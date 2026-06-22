import type { Campaign, GameRoom, SceneActionChoice } from "./types";
import type { LivingGameState, StatePatch } from "./game/memory/game-state.types";
import type { ObjectState } from "./game/campaigns/campaign.types";

function objectStateFromStoryStatus(status: NonNullable<Campaign["storyObjects"]>[number]["status"]): ObjectState {
  if (status === "lost") return "perdido";
  if (status === "broken" || status === "destroyed") return "danado";
  if (status === "used") return "vinculado";
  return "intacto";
}

export function createLivingStateForRoom(room: Pick<GameRoom, "id" | "campaign" | "players" | "currentSceneIndex" | "roundInScene" | "turn" | "dangerClock">): LivingGameState {
  const campaign = room.campaign;
  const currentScene = campaign.scenes[room.currentSceneIndex] ?? campaign.scenes[0];
  return {
    sessionId: room.id,
    campaignId: campaign.id,
    currentSceneId: currentScene?.id ?? "",
    round: room.roundInScene + 1,
    turn: room.turn,
    danger: room.dangerClock,
    party: room.players.map((player) => ({ id: player.id, name: player.name, stats: player.character.stats, conditions: player.status === "dead" ? ["dead"] : [] })),
    discoveredClues: Object.fromEntries(campaign.clues.map((clue) => [clue.id, { id: clue.id, discovered: false, confirmed: false, damaged: false, lost: false, notes: [] }])),
    inventory: Object.fromEntries((campaign.storyObjects ?? []).map((object) => [object.id, {
      id: object.id,
      state: objectStateFromStoryStatus(object.status),
      holderId: object.holder,
      storyMarks: [],
      notes: [object.location, object.history].filter(Boolean)
    }])),
    nftObjects: {},
    npcStates: Object.fromEntries(campaign.npcs.map((npc) => [npc.id, { id: npc.id, attitude: "vivo", present: currentScene?.npcIds?.includes(npc.id) ?? false, alive: true, trust: 0, fear: 0, hostility: 0, knownSecrets: [], notes: [] }])),
    secondaryNPCStates: {},
    factionStates: {},
    relationshipStates: [],
    locationStates: Object.fromEntries(campaign.scenes.map((scene) => [scene.id, { id: scene.id, visited: scene.id === currentScene?.id, dangerBand: "low", discoveredSecrets: [], blockedExits: [], changedByMagic: false, changedByCombat: false, notes: [] }])),
    creatureStates: Object.fromEntries(campaign.enemies.map((enemy) => [enemy.id, { id: enemy.id, alive: true, present: currentScene?.enemyIds?.includes(enemy.id) ?? false, wounded: false, calmed: false, drivenOff: false, hostility: enemy.dangerLevel, notes: [] }])),
    routeStates: Object.fromEntries(campaign.scenes.flatMap((scene) => (scene.multipleChoiceOptions ?? [])
      .filter((choice) => choice.routeId)
      .map((choice) => [choice.routeId!, { id: choice.routeId!, open: false, blocked: false, discovered: false, status: "hidden" as const, notes: [choice.label] }]))),
    sceneClocks: Object.fromEntries(campaign.scenes.map((scene) => [scene.id, { sceneId: scene.id, value: 0, max: 4, forcedAdvanceAt: 4 }])),
    actionMemory: {},
    endingScore: Object.fromEntries(campaign.possibleEndings.map((ending) => [ending.id, 0])),
    availableEndings: campaign.possibleEndings.map((ending) => ending.id),
    lastTurns: []
  };
}

export function emptyStatePatch(): StatePatch {
  return {
    dangerDelta: 0,
    clueUpdates: [],
    itemUpdates: [],
    nftUpdates: [],
    npcUpdates: [],
    secondaryNPCUpdates: [],
    factionUpdates: [],
    relationshipUpdates: [],
    locationUpdates: [],
    creatureUpdates: [],
    routeUpdates: [],
    endingScoreDelta: {},
    sceneClockDelta: null,
    nextSceneId: null,
    actionMemoryUpdates: [],
    turnSummary: null
  };
}

export function clueIdsForChoice(campaign: Campaign, sceneId: string, choice?: SceneActionChoice, outcome: "success" | "partial_success" | "failure" = "success") {
  if (outcome === "failure") return [];
  const scene = campaign.scenes.find((item) => item.id === sceneId);
  const explicit = choice?.unlocksClues ?? [];
  if (explicit.length) return Array.from(new Set(explicit)).filter((id) => campaign.clues.some((clue) => clue.id === id));
  const sceneClues = scene?.clueIds ?? [];
  return sceneClues.slice(0, 1).filter((id) => campaign.clues.some((clue) => clue.id === id));
}

export function filterUndiscoveredClueIds(state: Pick<LivingGameState, "discoveredClues">, clueIds: string[]): string[] {
  return clueIds.filter((id) => !state.discoveredClues[id]?.discovered);
}

export function isValidRevealClueId(campaign: Campaign, sceneId: string, clueId: string): boolean {
  const scene = campaign.scenes.find((item) => item.id === sceneId);
  return Boolean(scene?.clueIds.includes(clueId) && campaign.clues.some((clue) => clue.id === clueId));
}
