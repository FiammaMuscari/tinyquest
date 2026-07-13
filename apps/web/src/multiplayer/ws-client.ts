import type { Character, GameRoom, StatKey } from "@tiny-quest/game-engine";
import type { C2SMessage, ChatMessage, GuestActionMsg, MultiplayerPhase, PlayerInfo, S2CMessage } from "./protocol";
import { canonicalMultiplayerCharacter } from "./session-style";

// Cliente de salas de Tiny Quest. Es transporte + estado; NO corre el juego.
// El HOST usa startStory/broadcastState/signalNarrating tras resolver contra el
// motor; los invitados usan submitAction. La app escucha "guest_action" (solo le
// llega al host) para resolver la acción de un invitado y volver a difundir.

export type MultiplayerState = {
  phase: MultiplayerPhase;
  roomCode: string | null;
  playerId: string | null;
  isHost: boolean;
  players: PlayerInfo[];
  gameRoom: GameRoom | null;
  activePlayerId: string | null;
  yourTurn: boolean;
  allowMidJoin: boolean;
  errorMessage: string | null;
  lastEventSummary: string | null;
  chatMessages: ChatMessage[];
  kickedMessage: string | null;
};

export type MultiplayerEventMap = {
  state_change: MultiplayerState;
  guest_action: GuestActionMsg; // solo el host lo recibe
  story_started: { state: GameRoom; activePlayerId: string; yourTurn: boolean };
  state_update: { state: GameRoom; activePlayerId: string; yourTurn: boolean; eventSummary?: string };
  error: string;
  chat_message: ChatMessage;
};

type Handler<T> = (payload: T) => void;

// Asiento persistido para reconectar tras una recarga: el server guarda el asiento
// durante 5 min de gracia, así que rejoin_room por playerId nos vuelve a sentar.
const SEAT_KEY = "tiny-quest:mp-seat";
type StoredSeat = { roomCode: string; playerId: string };
function saveSeat(roomCode: string, playerId: string): void {
  try { localStorage.setItem(SEAT_KEY, JSON.stringify({ roomCode, playerId })); } catch { /* sin storage */ }
}
function loadSeat(): StoredSeat | null {
  try {
    const raw = localStorage.getItem(SEAT_KEY);
    if (!raw) return null;
    const seat = JSON.parse(raw) as StoredSeat;
    return seat.roomCode && seat.playerId ? seat : null;
  } catch { return null; }
}
function clearSeat(): void {
  try { localStorage.removeItem(SEAT_KEY); } catch { /* sin storage */ }
}

const emptyState: MultiplayerState = {
  phase: "idle",
  roomCode: null,
  playerId: null,
  isHost: false,
  players: [],
  gameRoom: null,
  activePlayerId: null,
  yourTurn: false,
  allowMidJoin: false,
  errorMessage: null,
  lastEventSummary: null
  ,chatMessages: [], kickedMessage: null
};

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private serverUrl: string;
  private _state: MultiplayerState = { ...emptyState };
  private listeners = new Map<string, Set<Handler<unknown>>>();
  // Cola de mensajes a mandar apenas abra el socket.
  private pending: C2SMessage[] = [];

  constructor(serverUrl = "ws://localhost:8787") {
    this.serverUrl = serverUrl;
  }

  get state(): Readonly<MultiplayerState> {
    return this._state;
  }

  // ─── Event emitter ──────────────────────────────────────────────────────────

  on<K extends keyof MultiplayerEventMap>(event: K, handler: Handler<MultiplayerEventMap[K]>): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler as Handler<unknown>);
  }

  off<K extends keyof MultiplayerEventMap>(event: K, handler: Handler<MultiplayerEventMap[K]>): void {
    this.listeners.get(event)?.delete(handler as Handler<unknown>);
  }

  private emit<K extends keyof MultiplayerEventMap>(event: K, payload: MultiplayerEventMap[K]): void {
    for (const handler of this.listeners.get(event) ?? []) {
      try { handler(payload); } catch { /* handler aislado */ }
    }
  }

  private setState(patch: Partial<MultiplayerState>): void {
    this._state = { ...this._state, ...patch };
    this.emit("state_change", this._state);
  }

  // ─── Conexión ─────────────────────────────────────────────────────────────

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.setState({ phase: this._state.phase === "idle" ? "connecting" : this._state.phase, errorMessage: null });
    this.ws = new WebSocket(this.serverUrl);

    this.ws.onopen = () => {
      this.startPing();
      const queued = this.pending;
      this.pending = [];
      for (const msg of queued) this.rawSend(msg);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as S2CMessage;
        this.handleServerMessage(msg);
      } catch { /* mensaje malformado */ }
    };

    this.ws.onclose = () => {
      this.stopPing();
      const alive = ["waiting_room", "active", "watching", "narrating"];
      if (alive.includes(this._state.phase)) {
        this.setState({ phase: "host_gone", errorMessage: "Se perdió la conexión con la sala." });
      }
    };

    this.ws.onerror = () => {
      this.setState({ errorMessage: "No se pudo conectar con el servidor de salas." });
    };
  }

  disconnect(): void {
    this.stopPing();
    clearSeat(); // salida intencional: no queremos reconectar a esta sala
    this.pending = [];
    if (this.ws) {
      this.ws.onclose = null; // salida limpia: no dispares "host_gone"
      this.ws.close();
    }
    this.ws = null;
    this._state = { ...emptyState };
    this.emit("state_change", this._state);
  }

  // ─── Acciones (comunes) ─────────────────────────────────────────────────────

  /** El invitado abre la pantalla de ingreso: conecta y habilita el formulario. */
  beginJoin(): void {
    this.setState({ phase: "lobby_guest", isHost: false });
    this.connect();
  }

  createRoom(playerName: string, character: Character, opts: { worldId?: string; perspective?: string } = {}): void {
    this.connect();
    this.setState({ phase: "lobby_host", isHost: true });
    this.send({ type: "create_room", playerName, character: canonicalMultiplayerCharacter(character), worldId: opts.worldId, perspective: opts.perspective });
  }

  joinRoom(roomCode: string, playerName: string, character: Character): void {
    this.connect();
    this.setState({ phase: "lobby_guest", isHost: false });
    const code = roomCode.toUpperCase();
    // Reconexión: si ya tenemos un asiento en ESTA sala (recarga de página o caída
    // breve), pedimos rejoin_room —re-sienta por playerId y NO chequea la puerta—
    // en vez de un join nuevo, que daría "sala cerrada" con la historia ya empezada.
    const seat = loadSeat();
    if (seat && seat.roomCode === code) {
      this.send({ type: "rejoin_room", roomCode: code, playerId: seat.playerId });
      return;
    }
    this.send({ type: "join_room", roomCode: code, playerName, character: canonicalMultiplayerCharacter(character) });
  }

  // ─── Acciones (host) ────────────────────────────────────────────────────────

  /** El host arranca la partida con el GameRoom ya forjado. */
  startStory(state: GameRoom, activePlayerId: string): void {
    if (!this._state.roomCode) return;
    this.send({ type: "start_story", roomCode: this._state.roomCode, state, activePlayerId });
  }

  /** El host difunde el estado autoritativo tras resolver un turno. */
  broadcastState(state: GameRoom, activePlayerId: string, eventSummary?: string): void {
    if (!this._state.roomCode) return;
    this.send({ type: "broadcast_game", roomCode: this._state.roomCode, state, activePlayerId, eventSummary });
    // El host refleja su propio broadcast localmente.
    this.setState({
      gameRoom: state,
      activePlayerId,
      yourTurn: activePlayerId === this._state.playerId,
      lastEventSummary: eventSummary ?? this._state.lastEventSummary,
      phase: state.sessionComplete ? "ended" : activePlayerId === this._state.playerId ? "active" : "watching"
    });
  }

  /** El host abre/cierra la puerta para llegadas a mitad de partida. */
  setRoomOptions(allowMidJoin: boolean): void {
    if (!this._state.roomCode) return;
    this.send({ type: "set_room_options", roomCode: this._state.roomCode, allowMidJoin });
  }

  kickPlayer(playerId: string): void { if (this._state.roomCode) this.send({ type: "kick_player", roomCode: this._state.roomCode, playerId }); }
  sendChat(text: string): void { if (this._state.roomCode && text.trim()) this.send({ type: "send_chat", roomCode: this._state.roomCode, text: text.trim().slice(0, 280) }); }
  setChatColor(color: string): void { if (this._state.roomCode) this.send({ type: "set_chat_color", roomCode: this._state.roomCode, color }); }
  setPlayerAvatar(character: Character): void { if (this._state.roomCode) this.send({ type: "set_player_avatar", roomCode: this._state.roomCode, character: canonicalMultiplayerCharacter(character) }); }

  /** El host avisa a los invitados que está narrando (spinner). */
  signalNarrating(): void {
    if (!this._state.roomCode || !this._state.activePlayerId) return;
    this.send({ type: "broadcast_game", roomCode: this._state.roomCode, narrating: true, activePlayerId: this._state.activePlayerId } as C2SMessage);
  }

  // ─── Acciones (invitado) ─────────────────────────────────────────────────────

  submitAction(action: string, stat: StatKey, usePet: boolean): void {
    if (!this._state.roomCode) return;
    this.send({ type: "submit_action", roomCode: this._state.roomCode, action, stat, usePet });
  }

  // ─── Ruteo de mensajes del servidor ──────────────────────────────────────────

  private handleServerMessage(msg: S2CMessage): void {
    switch (msg.type) {
      case "room_created":
        this.setState({ roomCode: msg.roomCode, playerId: msg.playerId, isHost: true, players: msg.players, phase: "lobby_host" });
        break;

      case "room_joined": {
        const rejoinedActive = this._state.gameRoom !== null; // llegó estado tras rejoin
        const isHostSeat = msg.players.find((p) => p.id === msg.playerId)?.isHost ?? this._state.isHost;
        // Guardamos el asiento para poder reconectar tras una recarga (solo invitados).
        if (!isHostSeat) saveSeat(msg.roomCode, msg.playerId);
        this.setState({
          roomCode: msg.roomCode, playerId: msg.playerId, players: msg.players, isHost: isHostSeat,
          errorMessage: null,
          phase: this._state.phase === "lobby_host" ? "lobby_host" : rejoinedActive ? this._state.phase : "waiting_room"
        });
        break;
      }

      case "player_joined":
      case "player_left":
      case "player_reconnected":
        this.setState({ players: msg.players });
        break;

      case "player_updated":
        this.setState({ players: msg.players, errorMessage: null });
        break;

      case "chat_message":
        this.setState({ chatMessages: [...this._state.chatMessages, msg.message].slice(-50) });
        this.emit("chat_message", msg.message);
        break;

      case "player_kicked":
        if (msg.playerId === this._state.playerId) {
          clearSeat();
          this.setState({ phase: "lobby_guest", roomCode: null, players: [], gameRoom: null, kickedMessage: msg.message, errorMessage: msg.message });
          if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; }
        } else this.setState({ players: msg.players });
        break;

      case "story_started": {
        const state = msg.state as GameRoom;
        this.setState({
          gameRoom: state, activePlayerId: msg.activePlayerId, yourTurn: msg.yourTurn, errorMessage: null,
          phase: state.sessionComplete ? "ended" : msg.yourTurn ? "active" : "watching"
        });
        this.emit("story_started", { state, activePlayerId: msg.activePlayerId, yourTurn: msg.yourTurn });
        break;
      }

      case "state_update": {
        const state = msg.state as GameRoom;
        this.setState({
          gameRoom: state, activePlayerId: msg.activePlayerId, yourTurn: msg.yourTurn, errorMessage: null,
          lastEventSummary: msg.eventSummary ?? this._state.lastEventSummary,
          phase: state.sessionComplete ? "ended" : msg.yourTurn ? "active" : "watching"
        });
        this.emit("state_update", { state, activePlayerId: msg.activePlayerId, yourTurn: msg.yourTurn, eventSummary: msg.eventSummary });
        break;
      }

      case "room_options":
        this.setState({ allowMidJoin: msg.allowMidJoin });
        break;

      case "narrating":
        if (!this._state.yourTurn) this.setState({ phase: "narrating" });
        break;

      case "guest_action":
        // Solo le llega al host: resolvé esta acción contra el motor y difundí.
        this.emit("guest_action", msg);
        break;

      case "error":
        // El asiento guardado ya no sirve (sala/asiento inexistente o partida
        // terminada): lo borramos para no reintentar rejoin en loop y permitir un
        // join limpio. El resto de errores no tocan el asiento.
        if (msg.code === "room_not_found" || msg.code === "game_ended") clearSeat();
        this.setState({ errorMessage: msg.message });
        this.emit("error", msg.message);
        break;

      case "pong":
        break;
    }
  }

  // ─── Internos ─────────────────────────────────────────────────────────────

  private send(msg: C2SMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.rawSend(msg);
    } else {
      this.pending.push(msg);
    }
  }

  private rawSend(msg: C2SMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.rawSend({ type: "ping" }), 25_000);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }
}

// Singleton para App.tsx. En desarrollo conserva el relay Go local; en el build
// publicado usa /ws en el mismo Worker (wss:// automáticamente, sin CORS ni una
// VITE_WS_URL compilada). VITE_WS_URL sigue permitiendo apuntar a otro relay.
const viteEnv = typeof import.meta !== "undefined"
  ? (import.meta as { env?: { VITE_WS_URL?: string; PROD?: boolean } }).env
  : undefined;
const productionWsUrl = viteEnv?.PROD && typeof window !== "undefined"
  ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
  : null;
const wsUrl = viteEnv?.VITE_WS_URL || productionWsUrl || "ws://localhost:8787";
export const multiplayerClient = new MultiplayerClient(wsUrl);
