import type { GameRoom } from "../../types";
import type { StoryThread } from "./story-threads";
import type { PendingConsequence } from "./pending-consequences";

export type ActiveNarrativeTensionSource =
  | "moral_choice"
  | "failed_roll"
  | "betrayal"
  | "clue_reveal"
  | "npc_reaction"
  | "combat"
  | "pending_consequence"
  | "story_thread";

export type ActiveNarrativeTension = {
  id: string;
  title: string;
  pressure: number;
  source: ActiveNarrativeTensionSource;
  involvedEntityIds: string[];
  unresolvedQuestion: string;
  likelyPayoff: string;
  blocks?: string[];
  unlocks?: string[];
  memoryLine: string;
};

let tensionCounter = 0;
function nextTensionId(): string {
  return `tension-${(tensionCounter++).toString(36)}`;
}

function tensionFromThread(thread: StoryThread): ActiveNarrativeTension {
  return {
    id: nextTensionId(),
    title: thread.title,
    pressure: thread.status === "escalating" ? 0.9 : 0.6,
    source: "story_thread",
    involvedEntityIds: [...thread.involvedNpcIds, ...thread.involvedObjectIds, ...thread.involvedClueIds],
    unresolvedQuestion: thread.unresolvedQuestion,
    likelyPayoff: thread.nextPressureBeat ?? "Resolución pendiente si la presión sube.",
    memoryLine: thread.memoryLine
  };
}

function tensionFromPendingConsequence(pc: PendingConsequence): ActiveNarrativeTension {
  return {
    id: nextTensionId(),
    title: `Consecuencia pendiente (turno ${pc.sourceTurn})`,
    pressure: pc.importance,
    source: "pending_consequence",
    involvedEntityIds: [...pc.involvedNpcIds, ...pc.involvedObjectIds, ...pc.involvedClueIds],
    unresolvedQuestion: `¿Cuándo y cómo se disparará la consecuencia de: ${pc.narrativeHint}?`,
    likelyPayoff: pc.narrativeHint,
    memoryLine: pc.narrativeHint
  };
}

function tensionFromCausalLink(cause: string, effect: string, description: string): ActiveNarrativeTension {
  return {
    id: nextTensionId(),
    title: `Vínculo causal abierto`,
    pressure: 0.5,
    source: "clue_reveal",
    involvedEntityIds: [],
    unresolvedQuestion: `¿${cause} ya cerró el conflicto con ${effect}?`,
    likelyPayoff: description,
    memoryLine: description
  };
}

export function deriveActiveNarrativeTensions(
  room: GameRoom,
  storyThreads: StoryThread[],
  pendingConsequences: PendingConsequence[]
): ActiveNarrativeTension[] {
  const tensions: ActiveNarrativeTension[] = [];

  // from story threads
  for (const thread of storyThreads.filter((t) => t.status !== "resolved" && t.status !== "failed")) {
    tensions.push(tensionFromThread(thread));
  }

  // from pending consequences
  for (const pc of pendingConsequences.filter((p) => p.status === "pending")) {
    tensions.push(tensionFromPendingConsequence(pc));
  }

  // from recent unresolved causal links in narrative memory
  const recentCausal = room.narrativeMemory.causalLinks
    .filter((link) => link.relation === "escalated" || link.relation === "blocked")
    .slice(-4);
  for (const link of recentCausal) {
    tensions.push(tensionFromCausalLink(link.cause, link.effect, link.description));
  }

  return tensions.sort((a, b) => b.pressure - a.pressure);
}

export function selectTopNarrativeTensions(
  room: GameRoom,
  storyThreads: StoryThread[],
  pendingConsequences: PendingConsequence[],
  limit = 3
): ActiveNarrativeTension[] {
  const all = deriveActiveNarrativeTensions(room, storyThreads, pendingConsequences);
  // boost tensions involving present NPCs
  const presentNpcs = new Set(room.campaign.scenes[room.currentSceneIndex]?.npcIds ?? []);
  return all
    .sort((a, b) => {
      const aPresent = a.involvedEntityIds.some((id) => presentNpcs.has(id)) ? 1 : 0;
      const bPresent = b.involvedEntityIds.some((id) => presentNpcs.has(id)) ? 1 : 0;
      return (bPresent - aPresent) || (b.pressure - a.pressure);
    })
    .slice(0, limit);
}
