import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { C2SMessage, S2CMessage } from "./protocol.js";
import { isValidStat } from "./protocol.js";
import {
  createRoom,
  joinRoom,
  getRoomByWs,
  markDisconnected,
  getSlotForWs,
  getOpponentSlot,
  deleteRoom,
  pruneStaleRooms,
  touchRoom
} from "./room-manager.js";
import { initGameRoom, runTurn, isActivePlayer } from "./game-runner.js";

// ─── Send helpers ─────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: S2CMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sendError(ws: WebSocket, message: string, code: S2CMessage & { type: "error" } extends { code: infer C } ? C : never): void {
  send(ws, { type: "error", message, code });
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

const lastActionAt = new WeakMap<WebSocket, number>();
const MIN_ACTION_INTERVAL_MS = 1500;

function isRateLimited(ws: WebSocket): boolean {
  const last = lastActionAt.get(ws) ?? 0;
  return Date.now() - last < MIN_ACTION_INTERVAL_MS;
}

// ─── Message handlers ─────────────────────────────────────────────────────────

function handleCreateRoom(ws: WebSocket, msg: Extract<C2SMessage, { type: "create_room" }>): void {
  if (!msg.playerName?.trim() || !msg.campaignId?.trim()) {
    sendError(ws, "playerName y campaignId son requeridos.", "invalid_action");
    return;
  }
  const playerId = `host-${Date.now()}`;
  const room = createRoom(ws, playerId, msg.playerName.trim().slice(0, 32), msg.character, msg.campaignId.trim());
  send(ws, { type: "room_created", roomCode: room.code, playerId });
}

function handleJoinRoom(ws: WebSocket, msg: Extract<C2SMessage, { type: "join_room" }>): void {
  if (!msg.roomCode?.trim() || !msg.playerName?.trim()) {
    sendError(ws, "roomCode y playerName son requeridos.", "invalid_action");
    return;
  }
  const playerId = `guest-${Date.now()}`;
  const room = joinRoom(ws, msg.roomCode.trim(), playerId, msg.playerName.trim().slice(0, 32), msg.character);
  if (!room) {
    sendError(ws, "Sala no encontrada o ya completa.", "room_not_found");
    return;
  }

  // Initialize game room now that both players are present
  const gameRoom = initGameRoom(room);
  room.gameRoom = gameRoom;

  const hostIsFirst = gameRoom.players[gameRoom.activePlayerIndex]?.id === "player-1";

  // Notify guest
  send(ws, {
    type: "room_joined",
    roomCode: room.code,
    playerId,
    state: gameRoom,
    yourTurn: !hostIsFirst
  });

  // Notify host
  send(room.host.ws, {
    type: "opponent_joined",
    playerName: msg.playerName.trim(),
    state: gameRoom
  });
}

async function handleSubmitAction(ws: WebSocket, msg: Extract<C2SMessage, { type: "submit_action" }>): Promise<void> {
  if (isRateLimited(ws)) {
    sendError(ws, "Demasiadas acciones. Espera un momento.", "invalid_action");
    return;
  }

  const room = getRoomByWs(ws);
  if (!room || room.status !== "active" || !room.gameRoom) {
    sendError(ws, "Sala no encontrada o inactiva.", "room_not_found");
    return;
  }

  if (room.gameRoom.sessionComplete) {
    sendError(ws, "La sesión ya terminó.", "game_ended");
    return;
  }

  if (room.busy) {
    sendError(ws, "El Dungeon Master está narrando. Espera.", "invalid_action");
    return;
  }

  const slot = getSlotForWs(room, ws);
  if (!slot) {
    sendError(ws, "No estás en esta sala.", "invalid_action");
    return;
  }

  if (!isActivePlayer(room.gameRoom, slot.playerId)) {
    sendError(ws, "No es tu turno.", "not_your_turn");
    return;
  }

  const action = (msg.action ?? "").trim().slice(0, 200);
  if (!action) {
    sendError(ws, "La acción no puede estar vacía.", "invalid_action");
    return;
  }

  if (!isValidStat(msg.stat)) {
    sendError(ws, "Estadística inválida.", "invalid_action");
    return;
  }

  lastActionAt.set(ws, Date.now());
  room.busy = true;
  touchRoom(room.code);

  // Notify both players that narration is in progress
  send(room.host.ws, { type: "narrating" });
  if (room.guest?.ws) send(room.guest.ws, { type: "narrating" });

  try {
    const { nextRoom, eventSummary } = await runTurn(room.gameRoom, action, msg.stat, Boolean(msg.usePet));
    room.gameRoom = nextRoom;

    const nextActiveId = nextRoom.players[nextRoom.activePlayerIndex]?.id;

    const updateFor = (playerId: string): Extract<S2CMessage, { type: "state_update" }> => ({
      type: "state_update",
      state: nextRoom,
      eventSummary,
      yourTurn: nextActiveId === playerId
    });

    send(room.host.ws, updateFor(room.host.playerId));
    if (room.guest?.ws) send(room.guest.ws, updateFor(room.guest.playerId));
  } catch (err) {
    console.error("runTurn error:", err);
    send(ws, { type: "error", message: "Error interno al procesar el turno.", code: "internal" });
  } finally {
    room.busy = false;
  }
}

// ─── Connection lifecycle ─────────────────────────────────────────────────────

function handleDisconnect(ws: WebSocket): void {
  const room = markDisconnected(ws);
  if (!room) return;
  const opponent = getOpponentSlot(room, ws);
  if (opponent?.ws && opponent.connected) {
    send(opponent.ws, { type: "opponent_disconnected" });
  }
  // If both disconnected, schedule room deletion
  const bothGone = !room.host.connected && (!room.guest || !room.guest.connected);
  if (bothGone) {
    setTimeout(() => deleteRoom(room.code), 5 * 60 * 1000); // 5 min grace
  }
}

function handleMessage(ws: WebSocket, raw: string): void {
  let msg: C2SMessage;
  try {
    msg = JSON.parse(raw) as C2SMessage;
  } catch {
    sendError(ws, "Mensaje inválido (no es JSON).", "invalid_action");
    return;
  }

  switch (msg.type) {
    case "create_room": handleCreateRoom(ws, msg); break;
    case "join_room": handleJoinRoom(ws, msg); break;
    case "submit_action": void handleSubmitAction(ws, msg); break;
    case "ping": send(ws, { type: "pong" }); break;
    default: sendError(ws, "Tipo de mensaje desconocido.", "invalid_action");
  }
}

// ─── Server factory ───────────────────────────────────────────────────────────

export function createWsServer(port: number, onListening?: () => void): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on("listening", () => onListening?.());

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    ws.on("message", (data) => {
      const raw = data.toString();
      handleMessage(ws, raw);
    });

    ws.on("close", () => handleDisconnect(ws));
    ws.on("error", () => handleDisconnect(ws));

    // Heartbeat
    ws.on("pong", () => {
      const room = getRoomByWs(ws);
      const slot = room ? getSlotForWs(room, ws) : null;
      if (slot) slot.lastPing = Date.now();
    });
  });

  // Server-side ping every 30s to detect dead connections
  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.ping();
    }
    pruneStaleRooms();
  }, 30_000);

  wss.on("close", () => clearInterval(pingInterval));

  return wss;
}
