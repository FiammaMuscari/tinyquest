import type { Character, GameRoom, StatKey } from "@tiny-quest/game-engine";
import type { C2SMessage, S2CMessage, MultiplayerPhase } from "./protocol";

export type MultiplayerState = {
  phase: MultiplayerPhase;
  roomCode: string | null;
  playerId: string | null;
  gameRoom: GameRoom | null;
  yourTurn: boolean;
  opponentName: string | null;
  errorMessage: string | null;
  lastEventSummary: string | null;
};

export type MultiplayerEventMap = {
  state_change: MultiplayerState;
  error: string;
};

type Handler<T> = (payload: T) => void;

const DEFAULT_SERVER_URL = "ws://localhost:8787";

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private serverUrl: string;

  private _state: MultiplayerState = {
    phase: "idle",
    roomCode: null,
    playerId: null,
    gameRoom: null,
    yourTurn: false,
    opponentName: null,
    errorMessage: null,
    lastEventSummary: null
  };

  private listeners = new Map<string, Set<Handler<unknown>>>();

  constructor(serverUrl = DEFAULT_SERVER_URL) {
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
      try { handler(payload); } catch { /* ignore handler errors */ }
    }
  }

  private setState(patch: Partial<MultiplayerState>): void {
    this._state = { ...this._state, ...patch };
    this.emit("state_change", this._state);
  }

  // ─── Connection ─────────────────────────────────────────────────────────────

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.setState({ phase: "connecting", errorMessage: null });
    this.ws = new WebSocket(this.serverUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as S2CMessage;
        this.handleServerMessage(msg);
      } catch { /* malformed message, ignore */ }
    };

    this.ws.onclose = () => {
      this.stopPing();
      if (this._state.phase !== "idle" && this._state.phase !== "ended") {
        this.setState({ phase: "opponent_gone", errorMessage: "Conexión perdida con el servidor." });
      }
    };

    this.ws.onerror = () => {
      this.setState({ errorMessage: "No se pudo conectar con el servidor." });
    };
  }

  disconnect(): void {
    this.stopPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.setState({ phase: "idle", roomCode: null, playerId: null, gameRoom: null });
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  createRoom(playerName: string, character: Character, campaignId: string): void {
    this.connect();
    const send = () => {
      this.send({ type: "create_room", playerName, character, campaignId });
      this.setState({ phase: "waiting_guest" });
    };
    if (this.ws?.readyState === WebSocket.OPEN) {
      send();
    } else {
      this.ws!.addEventListener("open", send, { once: true });
    }
  }

  joinRoom(roomCode: string, playerName: string, character: Character): void {
    this.connect();
    const send = () => {
      this.send({ type: "join_room", roomCode: roomCode.toUpperCase(), playerName, character });
    };
    if (this.ws?.readyState === WebSocket.OPEN) {
      send();
    } else {
      this.ws!.addEventListener("open", send, { once: true });
    }
  }

  submitAction(action: string, stat: StatKey, usePet: boolean): void {
    if (!this._state.roomCode) return;
    this.send({ type: "submit_action", roomCode: this._state.roomCode, action, stat, usePet });
  }

  // ─── Message routing ─────────────────────────────────────────────────────────

  private handleServerMessage(msg: S2CMessage): void {
    switch (msg.type) {
      case "room_created":
        this.setState({ roomCode: msg.roomCode, playerId: msg.playerId, phase: "waiting_guest" });
        break;

      case "room_joined":
        this.setState({
          roomCode: msg.roomCode,
          playerId: msg.playerId,
          gameRoom: msg.state,
          phase: msg.yourTurn ? "active" : "watching",
          yourTurn: msg.yourTurn
        });
        break;

      case "opponent_joined":
        this.setState({
          opponentName: msg.playerName,
          gameRoom: msg.state,
          phase: "active",  // host always goes first
          yourTurn: true
        });
        break;

      case "narrating":
        this.setState({ phase: "narrating" });
        break;

      case "state_update":
        this.setState({
          gameRoom: msg.state,
          lastEventSummary: msg.eventSummary,
          yourTurn: msg.yourTurn,
          phase: msg.state.sessionComplete ? "ended" : msg.yourTurn ? "active" : "watching"
        });
        break;

      case "opponent_disconnected":
        this.setState({ phase: "opponent_gone", errorMessage: "Tu oponente se desconectó." });
        break;

      case "opponent_reconnected":
        this.setState({
          opponentName: msg.playerName,
          phase: this._state.yourTurn ? "active" : "watching",
          errorMessage: null
        });
        break;

      case "error":
        this.setState({ errorMessage: msg.message });
        this.emit("error", msg.message);
        break;

      case "pong":
        break;
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private send(msg: C2SMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, 25_000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

// Singleton para uso en App.tsx
export const multiplayerClient = new MultiplayerClient(
  import.meta.env.VITE_WS_URL ?? "ws://localhost:8787"
);
