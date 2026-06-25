import type { Character, GameRoom, StatKey } from "@tiny-quest/game-engine";

// ─── Client → Server ─────────────────────────────────────────────────────────

export type CreateRoomMsg = {
  type: "create_room";
  playerName: string;
  character: Character;
  campaignId: string;
};

export type JoinRoomMsg = {
  type: "join_room";
  roomCode: string;
  playerName: string;
  character: Character;
};

export type SubmitActionMsg = {
  type: "submit_action";
  roomCode: string;
  action: string;
  stat: StatKey;
  usePet: boolean;
};

export type C2SMessage = CreateRoomMsg | JoinRoomMsg | SubmitActionMsg | { type: "ping" };

// ─── Server → Client ─────────────────────────────────────────────────────────

export type RoomCreatedMsg = {
  type: "room_created";
  roomCode: string;
  playerId: string;
};

export type RoomJoinedMsg = {
  type: "room_joined";
  roomCode: string;
  playerId: string;
  state: GameRoom;
  yourTurn: boolean;
};

export type OpponentJoinedMsg = {
  type: "opponent_joined";
  playerName: string;
  state: GameRoom;
};

export type StateUpdateMsg = {
  type: "state_update";
  state: GameRoom;
  eventSummary: string;
  yourTurn: boolean;
};

export type ErrorMsg = {
  type: "error";
  message: string;
  code: string;
};

export type S2CMessage =
  | RoomCreatedMsg
  | RoomJoinedMsg
  | OpponentJoinedMsg
  | StateUpdateMsg
  | { type: "narrating" }
  | { type: "opponent_disconnected" }
  | { type: "opponent_reconnected"; playerName: string }
  | { type: "pong" }
  | ErrorMsg;

export type MultiplayerPhase =
  | "idle"
  | "connecting"
  | "lobby_host"     // created room, waiting for opponent
  | "lobby_guest"    // entering room code
  | "waiting_guest"  // opponent hasn't joined yet
  | "active"         // game running, your turn
  | "watching"       // game running, opponent's turn
  | "narrating"      // LLM is generating narration
  | "opponent_gone"  // opponent disconnected
  | "ended";         // session complete
