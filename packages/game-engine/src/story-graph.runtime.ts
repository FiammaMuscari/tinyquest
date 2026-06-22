import type { AvailableChoice, CampaignBlueprint, StoryDebugState, StoryGraph, StoryGraphRuntime, UniversalStatePatch } from "./story-graph.types";

export function createStoryGraphRuntime(graph: StoryGraph): StoryGraphRuntime {
  const blueprint = graph.blueprint;
  return {
    campaignId: blueprint.id,
    currentNodeId: graph.startNodeId,
    visitedNodeIds: [graph.startNodeId],
    flags: {},
    characterStates: Object.fromEntries(blueprint.cast.map((character) => [character.id, { characterId: character.id, name: character.name, role: character.role, locationId: character.startingLocationId, attitude: character.startingAttitude, trust: 0, fear: 0, knowsClueIds: blueprint.clues.filter((clue) => clue.sourceType === "character" && clue.sourceId === character.id).map((clue) => clue.id), revealedClueIds: [], secrets: character.secretIds, flags: [] }])),
    objectStates: Object.fromEntries(blueprint.objects.map((object) => [object.id, { objectId: object.id, name: object.name, locationId: object.startingLocationId, status: object.possibleStates[0] ?? "visible", clueIds: object.relatedClueIds, flags: [] }])),
    clueStates: Object.fromEntries(blueprint.clues.map((clue) => [clue.id, { clueId: clue.id, text: clue.text, status: "hidden", sourceId: clue.sourceId }])),
    locationStates: Object.fromEntries(blueprint.locations.map((location) => [location.id, { locationId: location.id, visited: `node:${location.id}` === graph.startNodeId, presentCharacterIds: [...location.presentCharacterIds], presentObjectIds: [...location.availableObjectIds], flags: [] }])),
    routeStates: Object.fromEntries(blueprint.locations.flatMap((from) => from.connectedLocationIds.map((to) => [`${from.id}->${to}`, { routeId: `${from.id}->${to}`, fromSceneId: `node:${from.id}`, toSceneId: `node:${to}`, status: "available", risk: 1, requiredClueIds: [] }]))),
    clocks: Object.fromEntries(blueprint.clocks.map((clock) => [clock.id, { clockId: clock.id, value: clock.startsAt, max: clock.max, meaning: clock.meaning, onMax: clock.onMax }])),
    relationships: {},
    activeBranches: [],
    closedBranches: [],
    pendingQuestions: [blueprint.dramaticQuestion],
    choiceMemory: {},
    endingScores: Object.fromEntries(blueprint.endings.map((ending) => [ending.id, 0]))
  };
}

function mergeById<T extends Record<string, unknown>>(current: Record<string, T>, updates: Partial<T>[], idKey: keyof T): Record<string, T> {
  const next = { ...current };
  for (const update of updates) {
    const id = update[idKey] as string | undefined;
    if (!id) continue;
    next[id] = { ...(next[id] ?? {}), ...update } as T;
  }
  return next;
}

export function applyUniversalStatePatch(runtime: StoryGraphRuntime, patch: UniversalStatePatch): StoryGraphRuntime {
  const nextNodeId = patch.nextNodeId ?? runtime.currentNodeId;
  return {
    ...runtime,
    currentNodeId: nextNodeId,
    visitedNodeIds: runtime.visitedNodeIds.includes(nextNodeId) ? runtime.visitedNodeIds : [...runtime.visitedNodeIds, nextNodeId],
    flags: { ...runtime.flags, ...(patch.flags ?? {}) },
    characterStates: mergeById(runtime.characterStates, patch.characterChanges ?? [], "characterId"),
    objectStates: mergeById(runtime.objectStates, patch.objectChanges ?? [], "objectId"),
    clueStates: mergeById(runtime.clueStates, patch.clueChanges ?? [], "clueId"),
    routeStates: mergeById(runtime.routeStates, patch.routeChanges ?? [], "routeId"),
    clocks: Object.fromEntries(Object.entries(runtime.clocks).map(([id, clock]) => [id, { ...clock, value: Math.max(0, Math.min(clock.max, clock.value + (patch.clockChanges?.find((change) => change.clockId === id)?.delta ?? 0))) }])),
    activeBranches: Array.from(new Set([...runtime.activeBranches, ...(patch.openBranches ?? [])])).filter((branch) => !(patch.closeBranches ?? []).includes(branch)),
    closedBranches: Array.from(new Set([...runtime.closedBranches, ...(patch.closeBranches ?? [])])),
    pendingQuestions: patch.pendingQuestions ?? runtime.pendingQuestions,
    endingScores: Object.fromEntries(Object.entries({ ...runtime.endingScores, ...(patch.endingScoreDelta ?? {}) }).map(([id]) => [id, (runtime.endingScores[id] ?? 0) + (patch.endingScoreDelta?.[id] ?? 0)])),
    lastTurn: patch ? { choiceId: "patch", result: "success", patch, summary: "StatePatch aplicado" } : runtime.lastTurn
  };
}

export function evaluateBlueprintEndings(blueprint: CampaignBlueprint, runtime: StoryGraphRuntime): string[] {
  return blueprint.endings.filter((ending) => ending.conditions.every((condition) => {
    const value = condition.kind === "clue" ? runtime.clueStates[condition.id]?.status : condition.kind === "clock" ? runtime.clocks[condition.id]?.value : condition.kind === "score" ? runtime.endingScores[condition.id] : runtime.flags[condition.id];
    if (condition.op === "gte") return Number(value ?? 0) >= Number(condition.value ?? 0);
    if (condition.op === "lte") return Number(value ?? 0) <= Number(condition.value ?? 0);
    if (condition.op === "neq") return value !== condition.value;
    return value === (condition.value ?? true);
  })).map((ending) => ending.id);
}

export function buildStoryDebugState(graph: StoryGraph, runtime: StoryGraphRuntime, choices: AvailableChoice[] = []): StoryDebugState {
  const node = graph.nodes[runtime.currentNodeId];
  const loc = runtime.locationStates[node.locationId];
  return {
    node: { id: node.nodeId, title: node.title, kind: node.kind },
    location: graph.blueprint.locations.find((location) => location.id === node.locationId)?.name ?? node.locationId,
    npcsPresent: loc.presentCharacterIds.map((id) => runtime.characterStates[id]?.name ?? id),
    objectsPresent: loc.presentObjectIds.map((id) => runtime.objectStates[id]?.name ?? id),
    clues: Object.values(runtime.clueStates).filter((clue) => clue.status !== "hidden").map((clue) => ({ id: clue.clueId, status: clue.status, text: clue.text })),
    choices: choices.map((choice) => ({ id: choice.choiceId, label: choice.label, reason: choice.reasonAvailable })),
    usedChoices: Object.keys(runtime.choiceMemory),
    flags: runtime.flags,
    clocks: Object.fromEntries(Object.entries(runtime.clocks).map(([id, clock]) => [id, { value: clock.value, max: clock.max, meaning: clock.meaning }])),
    branches: { active: runtime.activeBranches, closed: runtime.closedBranches, pendingQuestions: runtime.pendingQuestions },
    endingScores: runtime.endingScores,
    lastPatch: runtime.lastTurn?.patch
  };
}
