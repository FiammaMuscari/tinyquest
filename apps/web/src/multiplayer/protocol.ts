import type { Character, StatKey } from "@tiny-quest/game-engine";

// Protocolo de salas de Tiny Quest (JSON sobre WebSocket).
//
// ARQUITECTURA — host autoritativo:
//   El motor y el narrador (LLM) son TypeScript y viven en el navegador. El
//   servidor Go NO corre el juego: coordina la sala (membresía, orden de turnos,
//   reconexión) y relaya. El HOST forja la historia, resuelve cada turno contra
//   el motor y difunde el estado; los invitados mandan su acción y reciben el
//   estado. `GameRoom` viaja como JSON opaco para el servidor.

// ─── Vista pública de un jugador (la manda el servidor) ──────────────────────

export type PlayerInfo = {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  character: Character;
  chatColor: string;
};
export type ChatMessage = { id: string; playerId: string; playerName: string; text: string; color: string; sentAt: number };

// ─── Cliente → Servidor ──────────────────────────────────────────────────────

export type CreateRoomMsg = {
  type: "create_room";
  playerName: string;
  character: Character;
  worldId?: string;
  perspective?: string;
};

export type JoinRoomMsg = {
  type: "join_room";
  roomCode: string;
  playerName: string;
  character: Character;
};

export type RejoinRoomMsg = {
  type: "rejoin_room";
  roomCode: string;
  playerId: string;
};

// El host abre/cierra la puerta para que entren jugadores a mitad de partida.
export type SetRoomOptionsMsg = {
  type: "set_room_options";
  roomCode: string;
  allowMidJoin: boolean;
};

// El host declara que la historia quedó forjada y arranca la partida.
export type StartStoryMsg = {
  type: "start_story";
  roomCode: string;
  state: unknown; // GameRoom serializado (opaco para el servidor)
  activePlayerId: string;
};

// El host difunde el estado autoritativo tras resolver un turno.
export type BroadcastGameMsg = {
  type: "broadcast_game";
  roomCode: string;
  state: unknown; // GameRoom serializado
  eventSummary?: string;
  activePlayerId: string;
  narrating?: boolean;
};

// El host avisa "estoy narrando" (spinner en los invitados), sin estado nuevo.
export type NarratingSignalMsg = {
  type: "broadcast_game";
  roomCode: string;
  narrating: true;
  activePlayerId: string;
};

// Un invitado pide su acción de turno; el servidor la relaya al host.
export type SubmitActionMsg = {
  type: "submit_action";
  roomCode: string;
  action: string;
  stat: StatKey;
  usePet: boolean;
  useTalent: boolean;
};

export type C2SMessage =
  | CreateRoomMsg
  | JoinRoomMsg
  | RejoinRoomMsg
  | SetRoomOptionsMsg
  | StartStoryMsg
  | BroadcastGameMsg
  | SubmitActionMsg
  | { type: "send_chat"; roomCode: string; text: string }
  | { type: "set_chat_color"; roomCode: string; color: string }
  | { type: "set_player_avatar"; roomCode: string; character: Character }
  | { type: "kick_player"; roomCode: string; playerId: string }
  | { type: "ping" };

// ─── Servidor → Cliente ──────────────────────────────────────────────────────

export type RoomCreatedMsg = {
  type: "room_created";
  roomCode: string;
  playerId: string;
  players: PlayerInfo[];
};

export type RoomJoinedMsg = {
  type: "room_joined";
  roomCode: string;
  playerId: string;
  players: PlayerInfo[];
};

export type PlayerJoinedMsg = {
  type: "player_joined";
  player: PlayerInfo;
  players: PlayerInfo[];
};

export type PlayerLeftMsg = {
  type: "player_left";
  playerId: string;
  players: PlayerInfo[];
};

export type PlayerReconnectedMsg = {
  type: "player_reconnected";
  playerId: string;
  players: PlayerInfo[];
};

export type StoryStartedMsg = {
  type: "story_started";
  state: unknown; // GameRoom serializado
  activePlayerId: string;
  yourTurn: boolean;
};

export type StateUpdateMsg = {
  type: "state_update";
  state: unknown; // GameRoom serializado
  eventSummary?: string;
  activePlayerId: string;
  yourTurn: boolean;
};

// Solo llega al HOST: un invitado pidió esta acción, resolvela contra el motor.
export type GuestActionMsg = {
  type: "guest_action";
  playerId: string;
  action: string;
  stat: StatKey;
  usePet: boolean;
  useTalent: boolean;
};

export type ErrorMsg = {
  type: "error";
  message: string;
  code: string;
};

export type S2CMessage =
  | RoomCreatedMsg
  | RoomJoinedMsg
  | PlayerJoinedMsg
  | PlayerLeftMsg
  | PlayerReconnectedMsg
  | StoryStartedMsg
  | StateUpdateMsg
  | GuestActionMsg
  | { type: "room_options"; allowMidJoin: boolean }
  | { type: "narrating" }
  | { type: "chat_message"; message: ChatMessage }
  | { type: "player_updated"; players: PlayerInfo[] }
  | { type: "player_kicked"; playerId: string; players: PlayerInfo[]; message: string }
  | { type: "pong" }
  | ErrorMsg;

export type MultiplayerPhase =
  | "idle"
  | "connecting"
  | "lobby_host" // creaste la sala, esperando que arranque la historia
  | "lobby_guest" // ingresando código
  | "waiting_room" // en la sala, esperando que el host forje y arranque
  | "active" // partida en curso, tu turno
  | "watching" // partida en curso, turno de otro
  | "narrating" // el host está narrando
  | "host_gone" // el anfitrión se cayó / abandonó
  | "ended"; // sesión completa
