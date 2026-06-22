import type { LivingGameState, StatePatch } from "./game-state.types";

function mergeById<T extends { id: string }>(current: Record<string, T>, updates: Partial<T>[]) {
  const next = { ...current };
  for (const update of updates) {
    if (!update.id) continue;
    next[update.id] = { ...(next[update.id] ?? { id: update.id }), ...update } as T;
  }
  return next;
}

export function applyStatePatch(state: LivingGameState, patch: StatePatch): LivingGameState {
  const nextClock = patch.sceneClockDelta
    ? {
        ...state.sceneClocks,
        [patch.sceneClockDelta.sceneId]: {
          ...state.sceneClocks[patch.sceneClockDelta.sceneId],
          value: (state.sceneClocks[patch.sceneClockDelta.sceneId]?.value ?? 0) + patch.sceneClockDelta.amount
        }
      }
    : state.sceneClocks;
  const nextActionMemory = { ...state.actionMemory };
  for (const update of patch.actionMemoryUpdates ?? []) {
    if (!update.actionId) continue;
    nextActionMemory[update.actionId] = {
      ...(nextActionMemory[update.actionId] ?? { actionId: update.actionId, sceneId: update.sceneId ?? state.currentSceneId, uses: 0, exhausted: false }),
      ...update
    };
  }

  return {
    ...state,
    danger: Math.max(0, Math.min(10, state.danger + patch.dangerDelta)),
    currentSceneId: patch.nextSceneId ?? state.currentSceneId,
    discoveredClues: mergeById(state.discoveredClues, patch.clueUpdates),
    inventory: mergeById(state.inventory, patch.itemUpdates),
    nftObjects: mergeById(state.nftObjects, patch.nftUpdates),
    npcStates: mergeById(state.npcStates, patch.npcUpdates),
    secondaryNPCStates: mergeById(state.secondaryNPCStates, patch.secondaryNPCUpdates),
    factionStates: mergeById(state.factionStates, patch.factionUpdates),
    relationshipStates: [...state.relationshipStates, ...patch.relationshipUpdates.filter((item): item is LivingGameState["relationshipStates"][number] => Boolean(item.fromId && item.toId && item.relation))],
    locationStates: mergeById(state.locationStates, patch.locationUpdates),
    creatureStates: mergeById(state.creatureStates, patch.creatureUpdates),
    routeStates: mergeById(state.routeStates, patch.routeUpdates),
    sceneClocks: nextClock,
    actionMemory: nextActionMemory,
    lastTurns: patch.turnSummary ? [patch.turnSummary, ...state.lastTurns].slice(0, 12) : state.lastTurns,
    endingScore: Object.fromEntries(Object.entries({ ...state.endingScore, ...patch.endingScoreDelta }).map(([id]) => [id, (state.endingScore[id] ?? 0) + (patch.endingScoreDelta[id] ?? 0)]))
  };
}
