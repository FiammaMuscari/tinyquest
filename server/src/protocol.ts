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

export type PingMsg = { type: "ping" };

export type C2SMessage = CreateRoomMsg | JoinRoomMsg | SubmitActionMsg | PingMsg;

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

export type NarratingMsg = { type: "narrating" };

export type OpponentDisconnectedMsg = { type: "opponent_disconnected" };
export type OpponentReconnectedMsg = { type: "opponent_reconnected"; playerName: string };

export type ErrorMsg = {
  type: "error";
  message: string;
  code: "not_your_turn" | "room_full" | "room_not_found" | "invalid_action" | "game_ended" | "internal";
};

export type PongMsg = { type: "pong" };

export type S2CMessage =
  | RoomCreatedMsg
  | RoomJoinedMsg
  | OpponentJoinedMsg
  | StateUpdateMsg
  | NarratingMsg
  | OpponentDisconnectedMsg
  | OpponentReconnectedMsg
  | ErrorMsg
  | PongMsg;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const VALID_STATS: StatKey[] = ["body", "mind", "charm", "creativity", "courage", "focus", "luck"];

export function isValidStat(s: string): s is StatKey {
  return VALID_STATS.includes(s as StatKey);
}
