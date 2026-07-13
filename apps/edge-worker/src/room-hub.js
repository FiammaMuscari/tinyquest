const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PLAYER_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const MAX_PLAYERS = 5;
const MAX_MESSAGE_SIZE = 1 << 20;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const RECONNECT_GRACE_MS = 5 * 60 * 1000;
const VALID_STATS = new Set(["body", "mind", "charm", "creativity", "courage", "focus", "luck"]);

function randomToken(alphabet, length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
}

function playerId() {
  return `p-${randomToken(PLAYER_ALPHABET, 8)}`;
}

function socketAttachment(ws) {
  try { return ws.deserializeAttachment() || {}; } catch { return {}; }
}

function publicPlayers(room) {
  return room.players.map(({ id, name, isHost, connected, character, chatColor }) => ({
    id, name, isHost, connected, character, chatColor
  }));
}

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Cloudflare Durable Object que reemplaza al relay Go en producción. El juego
// sigue siendo host-autoritativo: este objeto solo conserva salas y relaya JSON.
// El servidor Go se mantiene para desarrollo local y sus tests.
export class RoomHub {
  constructor(ctx) {
    this.ctx = ctx;
    this.rooms = new Map();
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      )`);
      for (const row of this.ctx.storage.sql.exec("SELECT code, payload FROM rooms")) {
        try { this.rooms.set(row.code, JSON.parse(row.payload)); } catch { this.deleteRoom(row.code); }
      }

      // Tras una actualización del Worker los sockets se cierran. Tras una mera
      // hibernación, en cambio, getWebSockets() y sus attachments siguen vivos.
      const liveSeats = new Set(this.ctx.getWebSockets().map((ws) => {
        const { roomCode, playerId: id } = socketAttachment(ws);
        return roomCode && id ? `${roomCode}:${id}` : "";
      }));
      const now = Date.now();
      for (const room of this.rooms.values()) {
        let changed = false;
        for (const player of room.players) {
          const connected = liveSeats.has(`${room.code}:${player.id}`);
          if (player.connected !== connected) changed = true;
          player.connected = connected;
          if (!connected && !player.disconnectedAt) player.disconnectedAt = now;
          if (connected && player.disconnectedAt) delete player.disconnectedAt;
        }
        if (changed) this.saveRoom(room);
      }
      await this.scheduleAlarm();
    });
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ roomCode: null, playerId: null });
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  saveRoom(room) {
    this.rooms.set(room.code, room);
    this.ctx.storage.sql.exec(
      "INSERT INTO rooms (code, payload) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET payload = excluded.payload",
      room.code,
      JSON.stringify(room)
    );
  }

  deleteRoom(code) {
    this.rooms.delete(code);
    this.ctx.storage.sql.exec("DELETE FROM rooms WHERE code = ?", code);
  }

  send(ws, payload) {
    try { ws.send(JSON.stringify(payload)); } catch { /* socket cerrado */ }
  }

  error(ws, code, message) {
    this.send(ws, { type: "error", code, message });
  }

  socketsFor(roomCode, except = null) {
    return this.ctx.getWebSockets().filter((ws) => {
      if (ws === except) return false;
      const attachment = socketAttachment(ws);
      return attachment.roomCode === roomCode && Boolean(attachment.playerId);
    });
  }

  socketFor(roomCode, id, except = null) {
    return this.socketsFor(roomCode, except).find((ws) => socketAttachment(ws).playerId === id) || null;
  }

  broadcast(room, payload, except = null) {
    for (const ws of this.socketsFor(room.code, except)) this.send(ws, payload);
  }

  seatOf(ws, room) {
    const attachment = socketAttachment(ws);
    if (attachment.roomCode !== room.code) return null;
    return room.players.find((player) => player.id === attachment.playerId) || null;
  }

  hostRoom(ws, code) {
    const room = this.rooms.get(trimmed(code).toUpperCase());
    if (!room) {
      this.error(ws, "room_not_found", "No existe una sala con ese código.");
      return null;
    }
    const seat = this.seatOf(ws, room);
    if (!seat?.isHost) {
      this.error(ws, "not_host", "Solo el anfitrión puede hacer eso.");
      return null;
    }
    return room;
  }

  attach(ws, room, player) {
    const old = this.socketFor(room.code, player.id, ws);
    if (old) old.close(4000, "Conexión reemplazada");
    ws.serializeAttachment({ roomCode: room.code, playerId: player.id });
    player.connected = true;
    delete player.disconnectedAt;
  }

  createRoom(ws, msg) {
    const name = trimmed(msg.playerName);
    if (!name) return this.error(ws, "invalid_action", "create_room necesita playerName y character.");
    if (socketAttachment(ws).roomCode) return this.error(ws, "invalid_action", "Ya estás en una sala.");
    let code = randomToken(CODE_ALPHABET, 6);
    while (this.rooms.has(code)) code = randomToken(CODE_ALPHABET, 6);
    const now = Date.now();
    const host = {
      id: playerId(), name, isHost: true, connected: true,
      character: msg.character, chatColor: "#f5d77b", joinedAt: now
    };
    const room = {
      code, status: "waiting", worldId: msg.worldId || "", perspective: msg.perspective || "",
      players: [host], activePlayerId: "", openDoor: false,
      createdAt: now, lastActivity: now, lastState: null, lastSummary: "", chatMessages: []
    };
    this.attach(ws, room, host);
    this.saveRoom(room);
    this.send(ws, { type: "room_created", roomCode: code, playerId: host.id, players: publicPlayers(room) });
  }

  joinRoom(ws, msg) {
    const name = trimmed(msg.playerName);
    if (!name) return this.error(ws, "invalid_action", "join_room necesita roomCode, playerName y character.");
    if (socketAttachment(ws).roomCode) return this.error(ws, "invalid_action", "Ya estás en una sala.");
    const room = this.rooms.get(trimmed(msg.roomCode).toUpperCase());
    if (!room) return this.error(ws, "room_not_found", "No existe una sala con ese código.");
    if (room.status === "ended") return this.error(ws, "game_ended", "Esa partida ya terminó.");
    if (room.status === "active" && !room.openDoor) {
      return this.error(ws, "story_started", "La historia ya arrancó y la sala está cerrada: pedile al anfitrión que abra la puerta (o una sala nueva).");
    }
    if (room.players.length >= MAX_PLAYERS) return this.error(ws, "room_full", "La sala está llena (anfitrión + 4 amigos como máximo).");
    const guest = {
      id: playerId(), name, isHost: false, connected: true,
      character: msg.character, chatColor: "#8ff2e2", joinedAt: Date.now()
    };
    room.players.push(guest);
    room.lastActivity = Date.now();
    this.attach(ws, room, guest);
    this.saveRoom(room);
    const players = publicPlayers(room);
    this.send(ws, { type: "room_joined", roomCode: room.code, playerId: guest.id, players });
    for (const message of room.chatMessages) this.send(ws, { type: "chat_message", message });
    if (room.status === "active" && room.lastState) {
      this.send(ws, { type: "state_update", state: room.lastState, eventSummary: room.lastSummary, activePlayerId: room.activePlayerId, yourTurn: false });
    }
    this.broadcast(room, { type: "player_joined", player: players[players.length - 1], players }, ws);
  }

  rejoinRoom(ws, msg) {
    const room = this.rooms.get(trimmed(msg.roomCode).toUpperCase());
    if (!room) return this.error(ws, "room_not_found", "Esa sala ya no existe.");
    const player = room.players.find((candidate) => candidate.id === msg.playerId);
    if (!player) return this.error(ws, "room_not_found", "Ese asiento ya no existe en la sala.");
    this.attach(ws, room, player);
    room.lastActivity = Date.now();
    this.saveRoom(room);
    const players = publicPlayers(room);
    this.send(ws, { type: "room_joined", roomCode: room.code, playerId: player.id, players });
    for (const message of room.chatMessages) this.send(ws, { type: "chat_message", message });
    if (room.status === "active" && room.lastState) {
      this.send(ws, { type: "state_update", state: room.lastState, eventSummary: room.lastSummary, activePlayerId: room.activePlayerId, yourTurn: player.id === room.activePlayerId });
    }
    this.broadcast(room, { type: "player_reconnected", playerId: player.id, players }, ws);
  }

  setRoomOptions(ws, msg) {
    const room = this.hostRoom(ws, msg.roomCode);
    if (!room) return;
    room.openDoor = Boolean(msg.allowMidJoin);
    room.lastActivity = Date.now();
    this.saveRoom(room);
    this.broadcast(room, { type: "room_options", allowMidJoin: room.openDoor });
  }

  startStory(ws, msg) {
    const room = this.hostRoom(ws, msg.roomCode);
    if (!room) return;
    if (msg.state == null) return this.error(ws, "invalid_action", "start_story necesita roomCode y state.");
    room.status = "active";
    room.activePlayerId = msg.activePlayerId || "";
    room.lastState = msg.state;
    room.lastActivity = Date.now();
    this.saveRoom(room);
    for (const player of room.players) {
      const socket = this.socketFor(room.code, player.id);
      if (socket) this.send(socket, { type: "story_started", state: msg.state, activePlayerId: room.activePlayerId, yourTurn: player.id === room.activePlayerId });
    }
  }

  broadcastGame(ws, msg) {
    const room = this.hostRoom(ws, msg.roomCode);
    if (!room) return;
    room.lastActivity = Date.now();
    if (msg.narrating && msg.state == null) {
      this.saveRoom(room);
      return this.broadcast(room, { type: "narrating" }, ws);
    }
    if (msg.state == null) return this.error(ws, "invalid_action", "broadcast_game sin state.");
    room.activePlayerId = msg.activePlayerId || "";
    room.lastState = msg.state;
    room.lastSummary = msg.eventSummary || "";
    this.saveRoom(room);
    for (const player of room.players) {
      const socket = this.socketFor(room.code, player.id);
      if (socket && socket !== ws) this.send(socket, {
        type: "state_update", state: msg.state, eventSummary: msg.eventSummary,
        activePlayerId: room.activePlayerId, yourTurn: player.id === room.activePlayerId
      });
    }
  }

  submitAction(ws, msg) {
    const room = this.rooms.get(trimmed(msg.roomCode).toUpperCase());
    if (!room) return this.error(ws, "room_not_found", "No existe una sala con ese código.");
    const player = this.seatOf(ws, room);
    if (!player) return this.error(ws, "room_not_found", "No estás sentado en esa sala.");
    if (room.status !== "active") return this.error(ws, "invalid_action", "La historia todavía no arrancó.");
    if (player.id !== room.activePlayerId) return this.error(ws, "not_your_turn", "No es tu turno.");
    if (!VALID_STATS.has(msg.stat)) return this.error(ws, "invalid_action", `Stat inválido: ${msg.stat || ""}`);
    const host = room.players.find((candidate) => candidate.isHost);
    const hostSocket = host && this.socketFor(room.code, host.id);
    if (!hostSocket) return this.error(ws, "internal", "El anfitrión está desconectado; esperá a que vuelva.");
    room.lastActivity = Date.now();
    this.saveRoom(room);
    this.send(hostSocket, { type: "guest_action", playerId: player.id, action: msg.action, stat: msg.stat, usePet: Boolean(msg.usePet) });
  }

  sendChat(ws, msg) {
    const room = this.rooms.get(trimmed(msg.roomCode).toUpperCase());
    if (!room) return this.error(ws, "room_not_found", "La sala ya no existe.");
    const player = this.seatOf(ws, room);
    const text = trimmed(msg.text);
    if (!player || !text) return this.error(ws, "invalid_action", "El mensaje está vacío.");
    if ([...text].length > 280) return this.error(ws, "invalid_action", "El mensaje supera 280 caracteres.");
    const message = { id: playerId(), playerId: player.id, playerName: player.name, text, color: player.chatColor, sentAt: Date.now() };
    room.chatMessages.push(message);
    room.chatMessages = room.chatMessages.slice(-50);
    room.lastActivity = Date.now();
    this.saveRoom(room);
    this.broadcast(room, { type: "chat_message", message });
  }

  setChatColor(ws, msg) {
    const color = typeof msg.color === "string" ? msg.color : "";
    if (!/^#[0-9a-f]{6}$/i.test(color)) return this.error(ws, "invalid_action", "Color de chat inválido.");
    const room = this.rooms.get(trimmed(msg.roomCode).toUpperCase());
    if (!room) return this.error(ws, "room_not_found", "La sala ya no existe.");
    const player = this.seatOf(ws, room);
    if (!player) return this.error(ws, "room_not_found", "No estás en la sala.");
    player.chatColor = color;
    this.saveRoom(room);
    this.broadcast(room, { type: "player_updated", players: publicPlayers(room) });
  }

  kickPlayer(ws, msg) {
    const room = this.hostRoom(ws, msg.roomCode);
    if (!room) return;
    const target = room.players.find((player) => player.id === msg.playerId);
    if (!target || target.isHost) return this.error(ws, "invalid_action", "No se puede expulsar a ese jugador.");
    room.players = room.players.filter((player) => player.id !== target.id);
    const players = publicPlayers(room);
    const targetSocket = this.socketFor(room.code, target.id);
    if (targetSocket) this.send(targetSocket, { type: "player_kicked", playerId: target.id, players, message: "El anfitrión te expulsó de la sala." });
    this.saveRoom(room);
    this.broadcast(room, { type: "player_kicked", playerId: target.id, players, message: `${target.name} fue expulsado.` }, targetSocket);
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== "string" || data.length > MAX_MESSAGE_SIZE) {
      return this.error(ws, "invalid_action", "Mensaje malformado.");
    }
    let msg;
    try { msg = JSON.parse(data); } catch { return this.error(ws, "invalid_action", "Mensaje malformado."); }
    try {
      switch (msg.type) {
        case "ping": this.send(ws, { type: "pong" }); break;
        case "create_room": this.createRoom(ws, msg); break;
        case "join_room": this.joinRoom(ws, msg); break;
        case "rejoin_room": this.rejoinRoom(ws, msg); break;
        case "set_room_options": this.setRoomOptions(ws, msg); break;
        case "start_story": this.startStory(ws, msg); break;
        case "broadcast_game":
        case "turn_result": this.broadcastGame(ws, msg); break;
        case "submit_action": this.submitAction(ws, msg); break;
        case "send_chat": this.sendChat(ws, msg); break;
        case "set_chat_color": this.setChatColor(ws, msg); break;
        case "kick_player": this.kickPlayer(ws, msg); break;
        default: this.error(ws, "invalid_action", `Tipo de mensaje desconocido: ${msg.type || ""}`);
      }
      await this.scheduleAlarm();
    } catch (error) {
      console.error("room hub message", error);
      this.error(ws, "internal", "Fallo interno del servidor de salas.");
    }
  }

  async markDisconnected(ws) {
    const { roomCode, playerId: id } = socketAttachment(ws);
    const room = this.rooms.get(roomCode);
    if (!room || !id) return;
    // Si un rejoin reemplazó este socket, no marques el asiento nuevo como caído.
    if (this.socketFor(roomCode, id, ws)) return;
    const player = room.players.find((candidate) => candidate.id === id);
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
    room.lastActivity = Date.now();
    this.saveRoom(room);
    this.broadcast(room, { type: "player_left", playerId: id, players: publicPlayers(room) }, ws);
    await this.scheduleAlarm();
  }

  async webSocketClose(ws) {
    await this.markDisconnected(ws);
  }

  async webSocketError(ws) {
    await this.markDisconnected(ws);
  }

  async scheduleAlarm() {
    let next = Infinity;
    for (const room of this.rooms.values()) {
      next = Math.min(next, room.lastActivity + ROOM_TTL_MS);
      for (const player of room.players) {
        if (!player.connected && player.disconnectedAt) next = Math.min(next, player.disconnectedAt + RECONNECT_GRACE_MS);
      }
    }
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
    else await this.ctx.storage.deleteAlarm();
  }

  async alarm() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (now >= room.lastActivity + ROOM_TTL_MS) {
        this.deleteRoom(room.code);
        continue;
      }
      let changed = false;
      for (const player of [...room.players]) {
        if (player.connected || !player.disconnectedAt || now < player.disconnectedAt + RECONNECT_GRACE_MS) continue;
        changed = true;
        if (player.isHost) {
          this.broadcast(room, { type: "error", message: "El anfitrión abandonó la partida.", code: "game_ended" });
          this.deleteRoom(room.code);
          break;
        }
        room.players = room.players.filter((candidate) => candidate.id !== player.id);
        this.broadcast(room, { type: "player_left", playerId: player.id, players: publicPlayers(room) });
      }
      if (this.rooms.has(room.code) && changed) this.saveRoom(room);
    }
    await this.scheduleAlarm();
  }
}
