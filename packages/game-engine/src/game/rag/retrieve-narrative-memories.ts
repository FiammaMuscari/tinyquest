import type { ActionResolution, GameRoom } from "../../types";
import type { NarrativeRetrievalQuery, RetrievedMemory } from "./embedded-memory.types";
import type { NarrativeMemoryIndex } from "./narrative-memory-index";

type RetrieveArgs = {
  room: GameRoom;
  resolution: ActionResolution;
  memoryIndex: NarrativeMemoryIndex;
  limit?: number;
};

export async function retrieveNarrativeMemories({ room, resolution, memoryIndex, limit = 6 }: RetrieveArgs): Promise<RetrievedMemory[]> {
  const plan = resolution.narrationRequest.resolutionPlan;
  const scene = resolution.narrationRequest.currentScene;
  const patch = resolution.turnResolution.statePatch;

  const targetNpcIds = [
    plan?.validContext.targetKind === "npc" ? plan.validContext.targetId : undefined,
    ...patch.npcUpdates.map((u) => u.id).filter((id): id is string => Boolean(id))
  ].filter((id): id is string => Boolean(id));

  const targetObjectIds = [
    plan?.validContext.targetKind === "object" ? plan.validContext.targetId : undefined,
    ...(plan?.validContext.usedObjectIds ?? []),
    ...patch.itemUpdates.map((u) => u.id).filter((id): id is string => Boolean(id))
  ].filter((id): id is string => Boolean(id));

  const clueIds = [
    ...plan?.cluePolicy.allowedClueIds ?? [],
    ...resolution.turnResolution.revealedClueIds
  ];

  const routeIds = patch.routeUpdates.map((r) => r.id).filter((id): id is string => Boolean(id));

  const tags: string[] = [
    resolution.check.outcome,
    scene.id,
    resolution.narrationRequest.selectedStat,
    ...(resolution.narrationRequest.atmosphereTags ?? [])
  ].filter(Boolean);

  const query: NarrativeRetrievalQuery = {
    campaignId: room.campaign.id,
    roomId: room.id,
    turn: room.turn,
    sceneId: scene.id,
    phase: room.phase,
    actionText: resolution.narrationRequest.rawAction,
    actorId: resolution.narrationRequest.activePlayer.id,
    targetNpcIds,
    targetObjectIds,
    clueIds,
    routeIds,
    presentNpcIds: scene.npcIds ?? [],
    presentObjectIds: plan?.validContext.presentObjectIds ?? [],
    tags,
    dangerClock: room.dangerClock,
    limit
  };

  try {
    return await memoryIndex.retrieve(query);
  } catch (err) {
    console.warn("[TinyQuest RAG] retrieveNarrativeMemories failed — continuing without retrieved context", err);
    return [];
  }
}
