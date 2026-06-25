import type { ActionResolution, GameRoom } from "../../types";

export type StoryThreadStatus = "open" | "escalating" | "resolved" | "failed";

export type StoryThread = {
  id: string;
  title: string;
  status: StoryThreadStatus;
  createdByTurn: number;
  updatedAtTurn: number;

  involvedNpcIds: string[];
  involvedClueIds: string[];
  involvedObjectIds: string[];
  involvedSceneIds: string[];

  unresolvedQuestion: string;
  nextPressureBeat?: string;
  payoffSceneIds?: string[];

  memoryLine: string;
  importance: number;
};

function generateId(prefix: string, turn: number): string {
  return `${prefix}-${turn}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createStoryThread(partial: Omit<StoryThread, "id">): StoryThread {
  return { id: generateId("thread", partial.createdByTurn), ...partial };
}

export function updateStoryThreadsAfterResolution(threads: StoryThread[], room: GameRoom, resolution: ActionResolution): StoryThread[] {
  const scene = resolution.narrationRequest.currentScene;
  const outcome = resolution.check.outcome;
  const plan = resolution.narrationRequest.resolutionPlan;
  const revealedClueIds = resolution.turnResolution.revealedClueIds ?? [];
  const affectedNpcIds = resolution.turnResolution.npcChanges.map((n) => n.id).filter((id): id is string => Boolean(id));

  const updated = threads.map((thread): StoryThread => {
    const touchesNpc = thread.involvedNpcIds.some((id) => affectedNpcIds.includes(id));
    const touchesClue = thread.involvedClueIds.some((id) => revealedClueIds.includes(id));
    const inScene = thread.involvedSceneIds.includes(scene.id);

    if (!touchesNpc && !touchesClue && !inScene) return thread;

    const newStatus: StoryThreadStatus = outcome === "success" && (touchesClue || touchesNpc)
      ? "resolved"
      : outcome === "failure" && touchesNpc
        ? "escalating"
        : thread.status;

    return {
      ...thread,
      status: newStatus,
      updatedAtTurn: room.turn,
      involvedSceneIds: Array.from(new Set([...thread.involvedSceneIds, scene.id]))
    };
  });

  // create new threads for moral choices and NPC exposure
  const choice = scene.actionChoices.find((c) =>
    resolution.narrationRequest.rawAction.includes(c.label) || resolution.narrationRequest.rawAction.startsWith(c.action)
  );
  const isMoral = choice?.actionType === "tomar_decision_moral" || choice?.intent === "betray" || choice?.intent === "sacrifice";
  const hasNpcExposure = outcome !== "failure" && affectedNpcIds.length > 0 && plan?.consequence.socialChange;

  const newThreads: StoryThread[] = [];

  if (isMoral && outcome !== "failure") {
    const actorName = resolution.narrationRequest.activePlayer.name;
    const actionLabel = choice?.label ?? resolution.narrationRequest.rawAction;
    newThreads.push(createStoryThread({
      title: `${actorName}: decisión moral — ${actionLabel}`,
      status: "open",
      createdByTurn: room.turn,
      updatedAtTurn: room.turn,
      involvedNpcIds: affectedNpcIds,
      involvedClueIds: revealedClueIds,
      involvedObjectIds: [],
      involvedSceneIds: [scene.id],
      unresolvedQuestion: `¿Los NPCs involucrados responderán con lealtad, venganza o traición?`,
      nextPressureBeat: "La próxima vez que estos NPCs sean presionados, la elección previa pesa.",
      memoryLine: `${actorName} eligió ${actionLabel} con consecuencias morales abiertas.`,
      importance: 0.85
    }));
  }

  if (hasNpcExposure && affectedNpcIds.length > 0) {
    const npcId = affectedNpcIds[0];
    const npc = room.campaign.npcs.find((n) => n.id === npcId);
    if (npc && !updated.some((t) => t.involvedNpcIds.includes(npcId) && t.status === "open")) {
      newThreads.push(createStoryThread({
        title: `${npc.name} bajo presión`,
        status: "open",
        createdByTurn: room.turn,
        updatedAtTurn: room.turn,
        involvedNpcIds: [npcId],
        involvedClueIds: [],
        involvedObjectIds: [],
        involvedSceneIds: [scene.id],
        unresolvedQuestion: `¿${npc.name} ayudará, mentirá o traicionará cuando la presión suba?`,
        memoryLine: `${npc.name} fue expuesto/a o presionado/a. Su reacción futura es incierta.`,
        importance: 0.7
      }));
    }
  }

  return [...updated, ...newThreads].slice(-16);
}

export function selectRelevantStoryThreadsForPrompt(threads: StoryThread[], presentNpcIds: string[], limit = 3): StoryThread[] {
  return threads
    .filter((t) => t.status !== "resolved" && t.status !== "failed")
    .sort((a, b) => {
      const aRelevant = a.involvedNpcIds.some((id) => presentNpcIds.includes(id)) ? 1 : 0;
      const bRelevant = b.involvedNpcIds.some((id) => presentNpcIds.includes(id)) ? 1 : 0;
      return (bRelevant - aRelevant) || (b.importance - a.importance);
    })
    .slice(0, limit);
}
