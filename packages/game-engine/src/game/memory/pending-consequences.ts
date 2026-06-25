import type { ActionResolution, Condition, GameRoom } from "../../types";
import type { StatePatch } from "../memory/game-state.types";

export type PendingConsequenceStatus = "pending" | "triggered" | "expired";

export type PendingConsequence = {
  id: string;
  sourceTurn: number;
  status: PendingConsequenceStatus;
  trigger: Condition;
  effect: Partial<StatePatch>;
  narrativeHint: string;

  involvedNpcIds: string[];
  involvedSceneIds: string[];
  involvedObjectIds: string[];
  involvedClueIds: string[];

  expiresAtTurn?: number;
  importance: number;
};

function generateId(turn: number): string {
  return `pcons-${turn}-${Math.random().toString(36).slice(2, 6)}`;
}

function evaluateCondition(condition: Condition, room: GameRoom): boolean {
  switch (condition.kind) {
    case "flag":
      return room.storyFlags.includes(condition.id);
    case "clue":
      return room.mysteryClues.some((c) => c.includes(condition.id));
    case "score":
      if (condition.id === "danger") {
        const val = room.dangerClock;
        const threshold = Number(condition.value ?? 0);
        if (condition.op === "gte") return val >= threshold;
        if (condition.op === "lte") return val <= threshold;
        return val === threshold;
      }
      return false;
    default:
      return false;
  }
}

export function addPendingConsequenceFromResolution(existing: PendingConsequence[], room: GameRoom, resolution: ActionResolution): PendingConsequence[] {
  const outcome = resolution.check.outcome;
  if (outcome === "success") return existing;

  const scene = resolution.narrationRequest.currentScene;
  const affectedNpcIds = resolution.turnResolution.npcChanges.map((n) => n.id).filter((id): id is string => Boolean(id));
  const plan = resolution.narrationRequest.resolutionPlan;

  // Social cost: NPC humiliation / partial exposure
  if (outcome === "partial_success" && affectedNpcIds.length > 0 && plan?.consequence.socialChange) {
    const npcId = affectedNpcIds[0];
    const npc = room.campaign.npcs.find((n) => n.id === npcId);
    if (npc) {
      existing = [...existing, {
        id: generateId(room.turn),
        sourceTurn: room.turn,
        status: "pending",
        trigger: { kind: "score", id: "danger", value: 6, op: "gte" },
        effect: { npcUpdates: [{ id: npcId, fear: 2, hostility: 1, notes: [`${npc.name} guardó rencor tras ser presionado/a.`] }] },
        narrativeHint: `${npc.name} puede actuar hostilarmente cuando el peligro suba (${room.turn}).`,
        involvedNpcIds: [npcId],
        involvedSceneIds: [scene.id],
        involvedObjectIds: [],
        involvedClueIds: [],
        expiresAtTurn: room.turn + 6,
        importance: 0.7
      }];
    }
  }

  // Failure: object damaged leads to future cost
  if (outcome === "failure" && resolution.turnResolution.objectChanges.length > 0) {
    const obj = resolution.turnResolution.objectChanges[0];
    if (obj?.id) {
      existing = [...existing, {
        id: generateId(room.turn),
        sourceTurn: room.turn,
        status: "pending",
        trigger: { kind: "flag", id: `object_used:${obj.id}` },
        effect: { dangerDelta: 1 },
        narrativeHint: `El objeto dañado ${obj.id} puede complicar una acción futura (${room.turn}).`,
        involvedNpcIds: [],
        involvedSceneIds: [scene.id],
        involvedObjectIds: [obj.id],
        involvedClueIds: [],
        expiresAtTurn: room.turn + 4,
        importance: 0.5
      }];
    }
  }

  return existing.slice(-12);
}

export function evaluatePendingConsequences(pending: PendingConsequence[], room: GameRoom): { triggered: PendingConsequence[]; remaining: PendingConsequence[] } {
  const triggered: PendingConsequence[] = [];
  const remaining: PendingConsequence[] = [];

  for (const pc of pending) {
    if (pc.status !== "pending") { remaining.push(pc); continue; }
    if (pc.expiresAtTurn !== undefined && room.turn >= pc.expiresAtTurn) {
      remaining.push({ ...pc, status: "expired" });
      continue;
    }
    if (evaluateCondition(pc.trigger, room)) {
      triggered.push({ ...pc, status: "triggered" });
    } else {
      remaining.push(pc);
    }
  }

  return { triggered, remaining };
}

export function applyTriggeredPendingConsequences(room: GameRoom, triggered: PendingConsequence[]): { dangerDelta: number; narrativeHints: string[] } {
  let dangerDelta = 0;
  const narrativeHints: string[] = [];

  for (const pc of triggered) {
    dangerDelta += pc.effect.dangerDelta ?? 0;
    narrativeHints.push(pc.narrativeHint);
  }

  return { dangerDelta, narrativeHints };
}
