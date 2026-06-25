import type { ScenePhase } from "../../types";

export type EmbeddedMemoryType =
  | "fact"
  | "clue"
  | "npc_memory"
  | "object_memory"
  | "moral_choice"
  | "failed_action"
  | "dialogue"
  | "causal_link"
  | "story_thread"
  | "pending_consequence"
  | "combat"
  | "scene_transition"
  | "player_pattern";

export type EmbeddedMemorySource =
  | "engine"
  | "resolution"
  | "narration"
  | "memory_summary"
  | "causal_graph"
  | "manual";

export type EmbeddedMemoryTruthStatus =
  | "confirmed"
  | "suspected"
  | "contradicted"
  | "forbidden";

export type EmbeddedMemory = {
  id: string;
  campaignId: string;
  roomId: string;
  turn: number;
  sceneId: string;
  type: EmbeddedMemoryType;
  text: string;
  embedding: number[];

  npcIds: string[];
  objectIds: string[];
  clueIds: string[];
  playerIds: string[];
  routeIds: string[];
  tags: string[];

  importance: number;
  resolved: boolean;
  createdAtTurn: number;
  lastUsedTurn?: number;

  source: EmbeddedMemorySource;
  truthStatus: EmbeddedMemoryTruthStatus;
  summaryLine: string;
};

export type EmbeddedMemoryInput = Omit<EmbeddedMemory, "id" | "embedding">;

export type NarrativeRetrievalQuery = {
  campaignId: string;
  roomId: string;
  turn: number;
  sceneId: string;
  phase: ScenePhase;
  actionText: string;
  actorId: string;

  targetNpcIds: string[];
  targetObjectIds: string[];
  clueIds: string[];
  routeIds: string[];

  presentNpcIds: string[];
  presentObjectIds: string[];

  tags: string[];
  dangerClock: number;

  includeResolved?: boolean;
  limit?: number;
};

export type RetrievedMemory = {
  memory: EmbeddedMemory;
  score: number;
  reasons: string[];
};
