import type { TinyQuestCampaign } from "../campaigns/campaign.types";
import type { LivingGameState } from "./game-state.types";

export function createLivingGameState(input: { sessionId: string; campaign: TinyQuestCampaign }): LivingGameState {
  const { sessionId, campaign } = input;
  return {
    sessionId,
    campaignId: campaign.id,
    currentSceneId: campaign.scenes[0]?.id ?? "",
    round: 1,
    turn: 0,
    danger: campaign.startingDanger,
    party: [],
    discoveredClues: Object.fromEntries(campaign.clues.map((clue) => [clue.id, { id: clue.id, discovered: false, confirmed: false, damaged: false, lost: false, notes: [] }])),
    inventory: Object.fromEntries(campaign.keyObjects.map((item) => [item.id, { id: item.id, state: "intacto", storyMarks: [], notes: [] }])),
    nftObjects: {},
    npcStates: Object.fromEntries(campaign.npcs.map((npc) => [npc.id, { id: npc.id, attitude: npc.initialAttitude, present: false, alive: true, trust: 0, fear: 0, hostility: 0, knownSecrets: [], notes: [] }])),
    secondaryNPCStates: Object.fromEntries(campaign.secondaryNPCs.map((npc) => [npc.id, { id: npc.id, attitude: npc.initialState, present: false, alive: true, trust: 0, fear: 0, hostility: 0, knownSecrets: [], notes: [] }])),
    factionStates: Object.fromEntries(campaign.factions.map((faction) => [faction.id, { id: faction.id, hostility: 0, trust: 0, alert: 0, currentAgenda: faction.visibleAgenda, notes: [] }])),
    relationshipStates: [],
    locationStates: Object.fromEntries(campaign.locations.map((location) => [location.id, { id: location.id, visited: false, dangerBand: "low", discoveredSecrets: [], blockedExits: [], changedByMagic: false, changedByCombat: false, notes: [] }])),
    creatureStates: Object.fromEntries(campaign.creatures.map((creature) => [creature.id, { id: creature.id, alive: true, present: false, wounded: false, calmed: false, drivenOff: false, hostility: 0, notes: [] }])),
    routeStates: Object.fromEntries(campaign.routes.map((route) => [route.id, { id: route.id, open: false, blocked: false, discovered: false, notes: [] }])),
    sceneClocks: Object.fromEntries(campaign.scenes.map((scene) => [scene.id, { sceneId: scene.id, value: 0, max: campaign.maxRounds, forcedAdvanceAt: campaign.maxRounds }])),
    actionMemory: {},
    endingScore: Object.fromEntries(campaign.endings.map((ending) => [ending.id, 0])),
    availableEndings: campaign.endings.map((ending) => ending.id),
    lastTurns: []
  };
}
