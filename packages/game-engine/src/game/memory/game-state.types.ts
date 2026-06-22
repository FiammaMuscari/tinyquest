import type { DangerBand, NPCRelation, NPCStatus, ObjectState } from "../campaigns/campaign.types";

export type PlayerState = {
  id: string;
  name: string;
  stats: Record<string, number>;
  conditions: string[];
};

export type ClueState = {
  id: string;
  discovered: boolean;
  confirmed: boolean;
  damaged: boolean;
  lost: boolean;
  notes: string[];
};

export type ItemState = {
  id: string;
  state: ObjectState;
  holderId?: string;
  charges?: number;
  storyMarks: string[];
  notes: string[];
};

export type NFTObjectState = ItemState & {
  tokenTemplateId: string;
  boundToPlayerId?: string;
  corrupted: boolean;
  blessed: boolean;
};

export type NPCState = {
  id: string;
  attitude: NPCStatus;
  present: boolean;
  alive: boolean;
  trust: number;
  fear: number;
  hostility: number;
  knownSecrets: string[];
  notes: string[];
};

export type FactionState = {
  id: string;
  hostility: number;
  trust: number;
  alert: number;
  currentAgenda: string;
  notes: string[];
};

export type RelationshipState = {
  fromId: string;
  toId: string;
  relation: NPCRelation;
  intensity: number;
  knownByParty: boolean;
  notes: string[];
};

export type LocationState = {
  id: string;
  visited: boolean;
  dangerBand: DangerBand;
  discoveredSecrets: string[];
  blockedExits: string[];
  changedByMagic: boolean;
  changedByCombat: boolean;
  notes: string[];
};

export type CreatureState = {
  id: string;
  alive: boolean;
  present: boolean;
  wounded: boolean;
  calmed: boolean;
  drivenOff: boolean;
  hostility: number;
  notes: string[];
};

export type RouteState = {
  id: string;
  open: boolean;
  blocked: boolean;
  discovered: boolean;
  status?: "hidden" | "open" | "blocked" | "dangerous" | "watched" | "used";
  notes: string[];
};

export type SceneClock = {
  sceneId: string;
  value: number;
  max: number;
  forcedAdvanceAt: number;
};

export type ActionMemory = {
  actionId: string;
  sceneId: string;
  uses: number;
  actorIds?: string[];
  usedCount?: number;
  lastOutcome?: "success" | "partial" | "failure";
  lastResult?: "success" | "partial" | "failure";
  status?: "available" | "used" | "exhausted" | "mutated" | "locked";
  exhausted: boolean;
  producedClueIds?: string[];
  producedObjectChanges?: string[];
  producedNpcChanges?: string[];
  replacementHint?: string;
};

export type EndingScore = Record<string, number>;

export type TurnSummary = {
  turn: number;
  sceneId: string;
  playerId: string;
  actionId: string;
  result: "success" | "partial" | "failure";
  concreteChange: string;
};

export type LivingGameState = {
  sessionId: string;
  campaignId: string;
  currentSceneId: string;
  round: number;
  turn: number;
  danger: number;
  party: PlayerState[];
  discoveredClues: Record<string, ClueState>;
  inventory: Record<string, ItemState>;
  nftObjects: Record<string, NFTObjectState>;
  npcStates: Record<string, NPCState>;
  secondaryNPCStates: Record<string, NPCState>;
  factionStates: Record<string, FactionState>;
  relationshipStates: RelationshipState[];
  locationStates: Record<string, LocationState>;
  creatureStates: Record<string, CreatureState>;
  routeStates: Record<string, RouteState>;
  sceneClocks: Record<string, SceneClock>;
  actionMemory: Record<string, ActionMemory>;
  endingScore: EndingScore;
  availableEndings: string[];
  lastTurns: TurnSummary[];
};

export type StatePatch = {
  dangerDelta: number;
  clueUpdates: Partial<ClueState>[];
  itemUpdates: Partial<ItemState>[];
  nftUpdates: Partial<NFTObjectState>[];
  npcUpdates: Partial<NPCState>[];
  secondaryNPCUpdates: Partial<NPCState>[];
  factionUpdates: Partial<FactionState>[];
  relationshipUpdates: Partial<RelationshipState>[];
  locationUpdates: Partial<LocationState>[];
  creatureUpdates: Partial<CreatureState>[];
  routeUpdates: Partial<RouteState>[];
  endingScoreDelta: EndingScore;
  sceneClockDelta: { sceneId: string; amount: number } | null;
  nextSceneId: string | null;
  actionMemoryUpdates?: Partial<ActionMemory>[];
  turnSummary?: TurnSummary | null;
};
