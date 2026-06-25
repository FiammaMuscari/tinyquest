import type { WebSocket } from "ws";
import type { Character, GameRoom } from "@tiny-quest/game-engine";

export type RoomStatus = "waiting" | "active" | "ended";

export type PlayerSlot = {
  ws: WebSocket;
  playerId: string;
  playerName: string;
  character: Character;
  connected: boolean;
  lastPing: number;
};

export type MultiplayerRoom = {
  code: string;
  campaignId: string;
  host: PlayerSlot;
  guest: PlayerSlot | null;
  gameRoom: GameRoom | null;
  status: RoomStatus;
  busy: boolean;          // true while LLM is narrating
  createdAt: number;
  lastActivity: number;
};

const rooms = new Map<string, MultiplayerRoom>();

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/1/0 to avoid confusion
const CODE_LEN = 6;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LEN; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
  return code;
}

function uniqueCode(): string {
  let code = generateCode();
  let attempts = 0;
  while (rooms.has(code) && attempts++ < 20) code = generateCode();
  return code;
}

export function createRoom(ws: WebSocket, playerId: string, playerName: string, character: Character, campaignId: string): MultiplayerRoom {
  const code = uniqueCode();
  const room: MultiplayerRoom = {
    code,
    campaignId,
    host: { ws, playerId, playerName, character, connected: true, lastPing: Date.now() },
    guest: null,
    gameRoom: null,
    status: "waiting",
    busy: false,
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(ws: WebSocket, code: string, playerId: string, playerName: string, character: Character): MultiplayerRoom | null {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  if (room.status !== "waiting") return null;
  if (room.guest) return null; // already has guest

  room.guest = { ws, playerId, playerName, character, connected: true, lastPing: Date.now() };
  room.status = "active";
  room.lastActivity = Date.now();
  return room;
}

export function getRoomByCode(code: string): MultiplayerRoom | null {
  return rooms.get(code.toUpperCase()) ?? null;
}

export function getRoomByWs(ws: WebSocket): MultiplayerRoom | null {
  for (const room of rooms.values()) {
    if (room.host.ws === ws || room.guest?.ws === ws) return room;
  }
  return null;
}

export function markDisconnected(ws: WebSocket): MultiplayerRoom | null {
  const room = getRoomByWs(ws);
  if (!room) return null;
  if (room.host.ws === ws) room.host.connected = false;
  if (room.guest?.ws === ws) room.guest.connected = false;
  room.lastActivity = Date.now();
  return room;
}

export function reconnectSlot(room: MultiplayerRoom, ws: WebSocket, playerId: string): boolean {
  if (room.host.playerId === playerId) {
    room.host.ws = ws;
    room.host.connected = true;
    room.host.lastPing = Date.now();
    return true;
  }
  if (room.guest?.playerId === playerId) {
    room.guest.ws = ws;
    room.guest.connected = true;
    room.guest.lastPing = Date.now();
    return true;
  }
  return false;
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export function touchRoom(code: string): void {
  const room = rooms.get(code);
  if (room) room.lastActivity = Date.now();
}

export function getSlotForWs(room: MultiplayerRoom, ws: WebSocket): PlayerSlot | null {
  if (room.host.ws === ws) return room.host;
  if (room.guest?.ws === ws) return room.guest;
  return null;
}

export function getOpponentSlot(room: MultiplayerRoom, ws: WebSocket): PlayerSlot | null {
  if (room.host.ws === ws) return room.guest;
  if (room.guest?.ws === ws) return room.host;
  return null;
}

// Prune rooms that have been idle for more than ROOM_TTL_MS
export function pruneStaleRooms(): void {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(code);
    }
  }
}
