import { getActionEnergyCost } from "./action-costs";
import { resolveCoherentTurnFacts } from "./action-outcomes";
import { applyStatePatch } from "./game/memory/game-state.reducer";
import { clueIdsForChoice, createLivingStateForRoom, emptyStatePatch, filterUndiscoveredClueIds, isValidRevealClueId } from "./living-state-adapter";
import { createCharacter } from "./character";
import { capDangerGainForRound, getDangerBand } from "./danger";
import { rollConsequence } from "./consequences";
import { resolveCheck } from "./checks";
import { createBotPlayers } from "./bots";
import { initialMemory } from "./memory";
import { getNarrativeActionType, narrativeDoDont } from "./narrative-contract";
import { buildCleanTurnNarration, buildVisibleConsequence } from "./player-narration";
import { shouldAdvanceScene, isFinalScene } from "./pacing";
import { determineEnding } from "./endings";
import { resolveEndingForRoom } from "./ending-resolution";
import { regenerateRoundEnergy } from "./energy";
import { createSessionForCampaign } from "./scenes";
import { campaignToWorldTheme, defaultCampaign } from "./campaigns";
import { getActivePlayer, getCurrentScene, getVisibleActionChoices } from "./room-state";
import { resolveAttack, resolveDefense } from "./combat";
import {
  buildDmContext, buildVisibleOptionsForDm, createInitialNarrativeMemory, indexTurnResult,
  updateStoryThreadsAfterResolution, addPendingConsequenceFromResolution, evaluatePendingConsequences, applyTriggeredPendingConsequences,
  updateMoralProfileFromResolution, initialMoralProfile
} from "./game/memory";
import { buildResolutionPlan } from "./resolution-plan";
import type { ActionResolution, Campaign, CampaignMemoryUpdate, Character, CheckOutcome, GameEvent, GameRoom, MemorySummary, NarrationResponse, Player, Scene, ScenePhase, StatKey, StructuredNextOption, WorldConfig, WorldTheme } from "./types";

export const dungeonWorld: WorldConfig = {
  id: "dungeon-realms",
  name: "Reinos de Mazmorra",
  aesthetic: "fantasia de dungeon, misterio, espadas, traiciones, tesoros, fantasmas, almas de dragon y mascotas legendarias",
  tone: ["misterioso", "aventurero", "peligroso", "emocional", "magico"]
};

type CreateRoomInput = {
  id?: string;
  mode?: GameRoom["mode"];
  humanCharacter?: ReturnType<typeof createCharacter>;
  selectedTheme?: WorldTheme;
  selectedCampaign?: Campaign;
  botCount?: number;
  extraPlayers?: Player[];
};

export function createGameRoom(input: CreateRoomInput = {}): GameRoom {
  const campaign = input.selectedCampaign ?? defaultCampaign;
  const selectedTheme = input.selectedTheme ?? campaignToWorldTheme(campaign);
  const sessionConfig = createSessionForCampaign(campaign);
  const humanCharacter = input.humanCharacter ?? createCharacter();
  const human: Player = {
    id: "player-1",
    name: humanCharacter.name,
    type: "human",
    character: humanCharacter,
    temporaryItems: ["mapa rasgado", "daga de plata vieja"]
  };

  const roomId = input.id ?? `${input.mode ?? "solo_test"}-${Date.now()}`;
  const players = [human, ...(input.extraPlayers ?? []), ...createBotPlayers(input.botCount ?? 2)];
  const baseRoomForLiving = { id: roomId, campaign, players, currentSceneIndex: 0, roundInScene: 0, turn: 0, dangerClock: 0 };

  return {
    id: roomId,
    mode: input.mode ?? "solo_test",
    sessionConfig,
    initialSceneId: sessionConfig.initialSceneId,
    players,
    activePlayerIndex: 0,
    currentSceneIndex: 0,
    roundInScene: 0,
    turn: 0,
    dangerClock: 0,
    mysteryClues: [],
    sceneProgress: 0,
    sessionStartedAt: Date.now(),
    sessionComplete: false,
    phase: "intro",
    memorySummary: initialMemory,
    sessionLog: [],
    storyFlags: [],
    narrativeMemory: createInitialNarrativeMemory({ campaign }),
    selectedTheme,
    campaign,
    selectedCampaignId: campaign.id,
    livingState: createLivingStateForRoom(baseRoomForLiving)
  };
}

function mergeUnique(existing: string[] = [], incoming: string[] = [], limit = 12) {
  return Array.from(new Set([...existing, ...incoming].map((item) => item.trim()).filter(Boolean))).slice(-limit);
}

export function applyMemoryUpdate<T extends { memorySummary: MemorySummary }>(gameState: T, update: CampaignMemoryUpdate): T {
  if (typeof console !== "undefined") {
    console.info("[Tiny Quest DM] memory-update", {
      facts: update.facts.length,
      clues: update.clues.length,
      objects: update.objects.length,
      npcs: update.npcs.length,
      locations: update.locations.length,
      dangers: update.dangers.length,
      forbiddenContradictions: update.forbiddenContradictions.length
    });
  }
  const memorySummary: MemorySummary = {
    ...gameState.memorySummary,
    facts: mergeUnique(gameState.memorySummary.facts, update.facts, 24),
    clues: mergeUnique(gameState.memorySummary.clues, update.clues, 12),
    objects: mergeUnique(gameState.memorySummary.objects, update.objects, 16),
    npcs: mergeUnique(gameState.memorySummary.npcs, update.npcs, 16),
    locations: mergeUnique(gameState.memorySummary.locations, update.locations, 16),
    dangers: mergeUnique(gameState.memorySummary.dangers, update.dangers, 12),
    forbiddenContradictions: mergeUnique(gameState.memorySummary.forbiddenContradictions, update.forbiddenContradictions, 24),
    confirmedFacts: mergeUnique(gameState.memorySummary.confirmedFacts, update.confirmedFacts ?? update.facts, 24),
    suspicions: mergeUnique(gameState.memorySummary.suspicions, update.suspicions, 16),
    damagedClues: mergeUnique(gameState.memorySummary.damagedClues, update.damagedClues, 16),
    npcStates: mergeUnique(gameState.memorySummary.npcStates, update.npcStates ?? update.npcs, 20),
    objectStates: mergeUnique(gameState.memorySummary.objectStates, update.objectStates ?? update.objects, 20),
    openQuestions: mergeUnique(gameState.memorySummary.openQuestions, update.openQuestions, 12)
  };
  return { ...gameState, memorySummary };
}

export function createSoloRoom(humanCharacter = createCharacter(), selectedCampaign: Campaign = defaultCampaign): GameRoom {
  return createGameRoom({ mode: "solo_test", humanCharacter, selectedCampaign, botCount: 2 });
}

export function createMultiplayerRoom(hostCharacter: Character, guestCharacter: Character, selectedCampaign: Campaign): GameRoom {
  const guest: import("./types").Player = {
    id: "player-2",
    name: guestCharacter.name,
    type: "human",
    status: "active",
    character: guestCharacter,
    temporaryItems: []
  };
  return createGameRoom({ mode: "multiplayer", humanCharacter: hostCharacter, extraPlayers: [guest], botCount: 0, selectedCampaign });
}

function normalizeActionText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function findSceneChoiceForAction(choices: ReturnType<typeof getVisibleActionChoices>, action: string) {
  const normalizedAction = normalizeActionText(action);
  return choices.find((choice) => {
    const normalizedChoiceAction = normalizeActionText(choice.action);
    const normalizedLabel = normalizeActionText(choice.label);
    return (
      action.startsWith(choice.action) ||
      action.includes(choice.label) ||
      choice.action === action ||
      normalizedAction === normalizedChoiceAction ||
      normalizedAction === normalizedLabel ||
      normalizedAction.includes(normalizedChoiceAction) ||
      normalizedAction.includes(normalizedLabel) ||
      normalizedChoiceAction.includes(normalizedAction)
    );
  });
}

function sanitizePlayerNarration(resolution: ActionResolution, candidate: string): string {
  return buildCleanTurnNarration(resolution.turnResolution, resolution.narrationRequest.currentScene.title, candidate);
}

export function deriveScenePhase(room: GameRoom, scene: Scene = getCurrentScene(room)): ScenePhase {
  if (room.sessionComplete) return "ending";
  if (room.dangerClock >= 10) return "climax";
  if (scene.hasCombat || scene.danger.toLowerCase().includes("combate")) return "combat";
  if (room.dangerClock >= 8 && room.sceneProgress >= 2) return "climax";
  if (room.dangerClock >= 4 || room.roundInScene >= 1) return "pressure";
  if (room.turn === 0 || room.phase === "intro") return "intro";
  return "investigation";
}

function riskForChoice(choice: { riskLevel?: string }, danger: number): StructuredNextOption["risk"] {
  if (danger >= 10) return "critical";
  if (choice.riskLevel === "high") return "high";
  if (choice.riskLevel === "medium") return "medium";
  return danger >= 7 ? "high" : danger >= 4 ? "medium" : "low";
}

export function buildStructuredOptions(room: GameRoom, scene: Scene = getCurrentScene(room)): StructuredNextOption[] {
  const phase = deriveScenePhase(room, scene);
  if (phase === "climax") {
    const stat: StatKey = scene.allowedStats[0] ?? "courage";
    return [
      { id: "crisis-reveal-truth", label: "Revelar la verdad aunque alguien pague el precio", intent: "final", suggestedStat: "courage", risk: "critical", availableInPhase: ["climax"] },
      { id: "crisis-save-someone", label: "Salvar a alguien y aceptar una pérdida", intent: "crisis", suggestedStat: "body", risk: "critical", availableInPhase: ["climax"] },
      { id: "crisis-accuse", label: "Acusar al responsable frente a todos", intent: "revelar_prueba", suggestedStat: "charm", risk: "critical", availableInPhase: ["climax"] },
      { id: "crisis-face-threat", label: "Enfrentar la amenaza bajo la campana", intent: "combatir", suggestedStat: stat, risk: "critical", availableInPhase: ["climax"] },
      { id: "crisis-flee-proof", label: "Huir con la prueba y dejar la plaza atrás", intent: "crisis", suggestedStat: "luck", risk: "critical", availableInPhase: ["climax"] }
    ].slice(0, 4) as StructuredNextOption[];
  }

  return getVisibleActionChoices(scene, room).map((choice) => ({
    id: choice.id,
    label: choice.label,
    intent: choice.intent ?? choice.actionType ?? choice.category ?? "investigate",
    suggestedStat: choice.recommendedStats[0] ?? scene.allowedStats[0],
    risk: riskForChoice(choice, room.dangerClock),
    requiresClue: choice.requiredClues?.[0],
    requiresObject: choice.objectId,
    availableInPhase: ["intro", "investigation", "pressure", "combat"] as ScenePhase[]
  })).slice(0, 5) as StructuredNextOption[];
}

function outcomeStateChanges(result: CheckOutcome, selectedChoice: ReturnType<typeof findSceneChoiceForAction> | undefined, consequenceText?: string) {
  if (result === "success") return [`Ventaja obtenida: ${selectedChoice?.possibleOutcomeHint ?? selectedChoice?.label ?? "la acción abre una posición útil"}.`];
  if (result === "partial_success") return [`Avance con coste: ${consequenceText ?? "la presión sube y alguien queda expuesto"}.`];
  return [`Complicación: ${consequenceText ?? "la oposición gana posición y una oportunidad queda más cara"}.`];
}

function buildCausalObligations(params: {
  room: GameRoom;
  scene: Scene;
  actorName: string;
  actionLabel: string;
  actionType?: string;
  result: CheckOutcome;
  danger: number;
  phase: ScenePhase;
  consequence?: string;
  canTriggerEnding: boolean;
  unlockedClues: string[];
}) {
  const target = params.actionLabel;
  const isObjectAction = params.actionType === "usar_objeto" || params.actionType === "investigar_objeto" || params.actionType === "comparar_evidencia";
  const isSocialAction = params.actionType === "interrogar_npc" || params.actionType === "confrontar_npc" || params.actionType === "revelar_prueba";
  const mustHappen: string[] = [];
  const mustNotHappen: string[] = [
    "No cambiar el resultado de la tirada.",
    "No inventar pistas decisivas fuera del estado.",
    "No desbloquear finales secretos como recompensa directa si el motor no lo permite."
  ];

  if (params.result === "success") {
    mustHappen.push(`La acción de ${params.actorName} obtiene una ventaja clara relacionada con: ${target}.`);
    if (params.unlockedClues.length) mustHappen.push(`Se puede mencionar la pista desbloqueada por el motor: ${params.unlockedClues.join("; ")}.`);
    else mustHappen.push("La escena reduce confusión o mejora posición sin inventar una pista decisiva nueva.");
  } else if (params.result === "partial_success") {
    mustHappen.push(`La acción de ${params.actorName} funciona a medias y deja un coste visible.`);
    mustHappen.push(params.consequence ?? "La presión sube, alguien queda expuesto o una prueba se vuelve más difícil de usar.");
    mustNotHappen.push("No presentar el avance parcial como una victoria limpia.");
  } else {
    mustHappen.push(`La acción de ${params.actorName} genera una complicación concreta relacionada con: ${target}.`);
    mustHappen.push(params.consequence ?? "La oposición gana tiempo, una prueba queda en duda o un NPC se aleja.");
    mustNotHappen.push("No dar la misma recompensa que un éxito.");
    mustNotHappen.push("No revelar toda la verdad como consecuencia del fallo.");
  }

  if (isObjectAction && params.result === "failure") {
    mustHappen.push("El objeto o evidencia sigue siendo útil, pero usarlo ahora exige coste o preparación.");
    mustNotHappen.push("No confirmar la prueba como si estuviera limpia.");
  }
  if (isSocialAction && params.result !== "success") {
    mustHappen.push("La reacción social empeora: un NPC duda, se cierra o gana unos segundos.");
  }
  if (params.danger >= 10 || params.phase === "climax") {
    mustHappen.push("La escena debe sentirse como clímax: no hay investigación tranquila.");
    mustHappen.push("La amenaza inmediata reacciona en pantalla.");
    mustNotHappen.push("No generar opciones normales de investigación.");
    mustNotHappen.push("No absolver a nadie ni cerrar el conflicto salvo que canTriggerEnding sea true.");
  } else if (params.danger >= 7) {
    mustHappen.push("La amenaza está activa: testigos, pruebas o rutas corren peligro.");
  } else if (params.danger >= 4) {
    mustHappen.push("La presión social ensucia la lectura de las pruebas o hace dudar a NPCs.");
  }
  if (!params.canTriggerEnding) {
    mustNotHappen.push("No cerrar la escena ni presentar final definitivo.");
  }

  return {
    mustHappen: Array.from(new Set(mustHappen)).slice(0, 8),
    mustNotHappen: Array.from(new Set([
      ...mustNotHappen,
      ...params.room.memorySummary.forbiddenContradictions,
      ...params.room.memorySummary.confirmedFacts.map((fact) => `No contradigas: ${fact}`)
    ])).slice(0, 12)
  };
}

export function resolvePlayerAction(room: GameRoom, action: string, selectedStat: StatKey, usePet = false): ActionResolution {
  const currentScene = getCurrentScene(room);
  const activePlayer = getActivePlayer(room);

  if (!currentScene.allowedStats.includes(selectedStat)) {
    throw new Error(`${selectedStat} is not allowed in ${currentScene.title}.`);
  }

  const check = resolveCheck(activePlayer.character.stats, selectedStat, currentScene.difficulty, action, usePet);
  const consequence = check.outcome === "success" ? undefined : rollConsequence();
  const selectedChoice = findSceneChoiceForAction(getVisibleActionChoices(currentScene, room), action);
  const actionType = getNarrativeActionType(selectedChoice, action);
  const actionContract = narrativeDoDont(actionType);
  const coherentFacts = resolveCoherentTurnFacts({ campaign: room.campaign, actor: activePlayer, choice: selectedChoice, rawAction: action, result: check.outcome });
  const target = coherentFacts.target.label;
  const energyCost = getActionEnergyCost(selectedChoice);
  if (activePlayer.character.energy < energyCost) {
    throw new Error(`${activePlayer.name} no tiene energía suficiente para esta acción (${activePlayer.character.energy}/${energyCost}).`);
  }
  const activeEnemy = room.campaign.enemies.find((enemy) => currentScene.enemyIds?.includes(enemy.id)) ?? room.campaign.enemies[0];
  let combatNote: string | undefined;
  if (activeEnemy && selectedChoice?.category === "fight") {
    const combat = resolveAttack(activePlayer.character.stats, selectedStat, activeEnemy);
    combatNote = combat.damage ? `${combat.note} Daño ${combat.damage}.` : combat.note;
  }
  if (selectedChoice?.category === "defend") {
    const combat = resolveDefense(activePlayer.character.stats, selectedStat);
    combatNote = `${combat.note} Reducción ${combat.defenseReduction}.`;
  }
  const mysteryClues = new Set(room.mysteryClues);
  if (check.outcome !== "failure") mysteryClues.add(currentScene.mysteryClue);
  // Consequence text can hint at damaged/partial evidence, but it is not a canonical campaign clue.
  const unlockedClueIds = check.outcome !== "failure" ? selectedChoice?.unlocksClues ?? [] : [];
  for (const clueId of unlockedClueIds) {
    const clue = room.campaign.clues.find((item) => item.id === clueId);
    if (clue) mysteryClues.add(clue.text);
  }

  const rawActionDangerDelta = check.outcome === "failure"
    ? selectedChoice?.dangerOnFailure ?? 1
    : check.outcome === "partial_success"
      ? selectedChoice?.dangerOnPartial ?? 0
      : 0;
  const actionDangerDelta = check.outcome === "failure" ? Math.min(1, rawActionDangerDelta) : Math.min(0, rawActionDangerDelta);
  const requestedDangerGain = actionDangerDelta + (consequence?.dangerDelta ?? 0);
  const currentRoundDangerGain = room.sessionLog
    .filter((event) => event.sceneId === currentScene.id && event.roundNumber === room.roundInScene + 1)
    .reduce((total, event) => total + Math.max(0, event.dangerDelta ?? 0), 0);
  const dangerGain = capDangerGainForRound({ requestedGain: requestedDangerGain, currentRoundGain: currentRoundDangerGain });
  const dangerClock = Math.min(10, room.dangerClock + dangerGain);
  const companionDeath = activePlayer.type === "bot"
    && activePlayer.status !== "dead"
    && getDangerBand(dangerClock) === "critical"
    && check.outcome === "failure"
    && (consequence?.roll.value ?? 0) >= 5;
  if (companionDeath) {
    const deathCause = `${activePlayer.name} muere cubriendo al grupo cuando la amenaza convierte el fallo en sacrificio.`;
    combatNote = combatNote ? `${combatNote} ${deathCause}` : deathCause;
  }

  const progressDelta = check.outcome === "success"
    ? selectedChoice?.progressOnSuccess ?? 0.75
    : check.outcome === "partial_success"
      ? Math.min(0.5, (selectedChoice?.progressOnSuccess ?? 0.75) / 2)
      : 0;
  const sceneProgress = room.sceneProgress + progressDelta;
  const unlockedFlags = selectedChoice?.unlocksFlags ?? [];
  const energyDelta = -energyCost + (consequence?.energyDelta ?? 0);
  const vitalityDelta = consequence?.vitalityDelta ?? 0;
  const players = room.players.map((player) => player.id === activePlayer.id
    ? {
      ...player,
      character: {
        ...player.character,
        energy: Math.max(0, player.character.energy + energyDelta),
        vitality: Math.max(0, player.character.vitality + vitalityDelta)
      }
    }
    : player);

  const revealedClueIds = filterUndiscoveredClueIds(room.livingState, clueIdsForChoice(room.campaign, currentScene.id, selectedChoice, check.outcome));
  const actionId = selectedChoice?.id ?? action;
  const previousActionMemory = room.livingState.actionMemory[actionId];
  const statePatch = emptyStatePatch();
  statePatch.dangerDelta = dangerClock - room.dangerClock;
  statePatch.clueUpdates = revealedClueIds.map((id) => ({ id, discovered: true, confirmed: check.outcome === "success", notes: [`${activePlayer.name}: ${selectedChoice?.label ?? action}`] }));
  statePatch.itemUpdates = selectedChoice?.objectId && check.outcome !== "failure"
    ? [{
      id: selectedChoice.objectId,
      state: selectedChoice.objectStateOnSuccess ?? "intacto",
      storyMarks: [selectedChoice.label],
      notes: [`${selectedChoice.label}: ${check.outcome}`]
    }]
    : [];
  statePatch.npcUpdates = currentScene.npcIds?.map((id) => ({
    id,
    present: true,
    fear: check.outcome === "failure" ? 1 : 0,
    trust: check.outcome === "success" ? 1 : 0,
    ...(id === selectedChoice?.npcId && selectedChoice.npcAttitudeOnSuccess && check.outcome !== "failure" ? { attitude: selectedChoice.npcAttitudeOnSuccess as never } : {}),
    ...(id === selectedChoice?.npcId ? { notes: [selectedChoice.possibleOutcomeHint ?? selectedChoice.label] } : {})
  })) ?? [];
  const routeId = selectedChoice?.routeId ?? ((selectedChoice?.actionType === "abrir_ruta" || selectedChoice?.actionType === "cerrar_ruta" || selectedChoice?.category === "defend" || selectedChoice?.intent === "flee") ? `${currentScene.id}:${actionId}` : undefined);
  const routeStatus = check.outcome === "failure" ? "blocked" : selectedChoice?.routeStatusOnSuccess ?? (selectedChoice?.actionType === "cerrar_ruta" ? "blocked" : "open");
  statePatch.routeUpdates = routeId
    ? [{
      id: routeId,
      open: routeStatus === "open" || routeStatus === "used",
      discovered: true,
      blocked: routeStatus === "blocked",
      status: routeStatus,
      notes: [selectedChoice?.label ?? action]
    }]
    : [];
  statePatch.sceneClockDelta = { sceneId: currentScene.id, amount: check.outcome === "success" ? 1 : check.outcome === "partial_success" ? 0.5 : 0 };
  statePatch.endingScoreDelta = {
    truth: revealedClueIds.length,
    mercy: selectedChoice?.label.toLowerCase().includes("misericordia") ? 1 : 0,
    sacrifice: selectedChoice?.label.toLowerCase().includes("romper") || selectedChoice?.label.toLowerCase().includes("salvar") ? 1 : 0,
    corruption: selectedChoice?.label.toLowerCase().includes("falso") ? 1 : 0,
    chaos: statePatch.dangerDelta > 0 ? statePatch.dangerDelta : 0
  };
  const outcomePatch = selectedChoice
    ? check.outcome === "success"
      ? selectedChoice.successPatch
      : check.outcome === "partial_success"
        ? selectedChoice.partialPatch
        : selectedChoice.failurePatch
    : undefined;
  if (outcomePatch) {
    statePatch.dangerDelta += outcomePatch.dangerDelta ?? 0;
    statePatch.clueUpdates.push(...(outcomePatch.clueUpdates ?? []));
    statePatch.itemUpdates.push(...(outcomePatch.itemUpdates ?? []));
    statePatch.npcUpdates.push(...(outcomePatch.npcUpdates ?? []));
    statePatch.routeUpdates.push(...(outcomePatch.routeUpdates ?? []));
    statePatch.factionUpdates.push(...(outcomePatch.factionUpdates ?? []));
    statePatch.locationUpdates.push(...(outcomePatch.locationUpdates ?? []));
    statePatch.creatureUpdates.push(...(outcomePatch.creatureUpdates ?? []));
    statePatch.actionMemoryUpdates?.push(...(outcomePatch.actionMemoryUpdates ?? []));
    statePatch.endingScoreDelta = { ...statePatch.endingScoreDelta, ...(outcomePatch.endingScoreDelta ?? {}) };
    statePatch.nextSceneId = outcomePatch.nextSceneId ?? statePatch.nextSceneId;
    statePatch.sceneClockDelta = outcomePatch.sceneClockDelta ?? statePatch.sceneClockDelta;
  }
  statePatch.actionMemoryUpdates = [...(statePatch.actionMemoryUpdates ?? []), {
    actionId,
    sceneId: currentScene.id,
    uses: (previousActionMemory?.uses ?? 0) + 1,
    lastOutcome: check.outcome === "partial_success" ? "partial" : check.outcome,
    exhausted: selectedChoice?.exhausts ?? ((previousActionMemory?.uses ?? 0) + 1 >= 1 && (selectedChoice?.category === "investigate" || selectedChoice?.category === "talk" || selectedChoice?.actionType === "abrir_ruta")),
    replacementHint: selectedChoice?.category === "investigate" ? "Usar, comparar o arriesgar la pista; no volver a examinar igual." : selectedChoice?.category === "talk" ? "Cambiar presión, ofrecer trato o confrontar contradicción; no repetir interrogatorio." : undefined
  }];
  statePatch.turnSummary = {
    turn: room.turn,
    sceneId: currentScene.id,
    playerId: activePlayer.id,
    actionId,
    result: check.outcome === "partial_success" ? "partial" : check.outcome,
    concreteChange: selectedChoice?.possibleOutcomeHint ?? consequence?.text ?? "La acción cambia la posición del grupo."
  };
  const patchedDangerClock = Math.max(0, Math.min(10, room.dangerClock + statePatch.dangerDelta));
  const livingState = applyStatePatch(room.livingState, statePatch);

  const nextRoom: GameRoom = {
    ...room,
    players,
    dangerClock: patchedDangerClock,
    mysteryClues: [...mysteryClues],
    sceneProgress,
    storyFlags: Array.from(new Set([...room.storyFlags, ...unlockedFlags])),
    phase: deriveScenePhase({ ...room, dangerClock: patchedDangerClock, sceneProgress }, currentScene),
    livingState
  };
  const structuredOptions = buildStructuredOptions(nextRoom, currentScene);
  const canTriggerEnding = isFinalScene(nextRoom) && check.outcome === "success" && (nextRoom.sceneProgress >= 2 || nextRoom.dangerClock >= 9);
  const resolutionPlan = buildResolutionPlan({
    roomBefore: room,
    roomAfter: nextRoom,
    scene: currentScene,
    actor: activePlayer,
    actionText: selectedChoice?.label ?? action,
    selectedStat,
    check,
    consequence,
    selectedChoice,
    phase: nextRoom.phase,
    structuredOptions,
    unlockedClueIds: revealedClueIds,
    damagedClueIds: check.outcome === "failure" ? [selectedChoice?.objectId ?? selectedChoice?.targetId ?? currentScene.mysteryClue].filter(Boolean) : [],
    canAdvanceScene: progressDelta > 0 || Boolean(statePatch.nextSceneId),
    canTriggerEnding,
    stateChanges: outcomeStateChanges(check.outcome, selectedChoice, consequence?.text),
    npcReactions: statePatch.npcUpdates.map((npc) => `${npc.id}: miedo ${npc.fear ?? 0}, confianza ${npc.trust ?? 0}`)
  });

  return {
    room: nextRoom,
    check,
    consequence,
    combatNote,
    turnResolution: {
      check,
      dice: check,
      consequence,
      statePatch,
      revealedClueIds,
      objectChanges: statePatch.itemUpdates,
      npcChanges: statePatch.npcUpdates,
      dangerDelta: statePatch.dangerDelta,
      progressDelta,
      endingProgress: statePatch.endingScoreDelta,
      nextAllowedActions: getVisibleActionChoices(currentScene, nextRoom),
      actionType,
      campaignActionType: coherentFacts.actionType,
      actor: coherentFacts.actor,
      target: coherentFacts.target,
      result: coherentFacts.result,
      outcomeKind: coherentFacts.outcomeKind,
      factualSummary: coherentFacts.factualSummary,
      visibleConsequence: coherentFacts.visibleConsequence,
      narrationHints: coherentFacts.narrationHints,
      debugSummary: coherentFacts.debugSummary
    },
    narrationRequest: {
      sessionConfig: room.sessionConfig,
      world: dungeonWorld,
      selectedTheme: room.selectedTheme,
      selectedCampaign: room.campaign,
      currentScene,
      activePlayer,
      party: players,
      character: players.find((player) => player.id === activePlayer.id)?.character ?? activePlayer.character,
      rawAction: action,
      selectedStat,
      skillUsed: activePlayer.character.abilityProgression.currentSkill,
      petUsed: usePet ? activePlayer.character.pet.name : undefined,
      visualPrompt: currentScene.atmosphere.visualPrompt,
      ambientSoundPrompt: currentScene.atmosphere.ambientSoundPrompt,
      atmosphereTags: currentScene.atmosphere.atmosphereTags,
      currentImageDescription: currentScene.atmosphere.visualPrompt,
      currentSoundMood: currentScene.atmosphere.ambientSoundPrompt,
      diceResults: check,
      consequence,
      combatNote,
      resolvedOutcome: check.outcome,
      dangerClock,
      mysteryCluesFound: [...mysteryClues],
      memorySummary: room.memorySummary,
      storyFlags: room.storyFlags,
      recentSessionLog: room.sessionLog.slice(0, 5),
      retrievedContext: buildDmContext(nextRoom),
      visibleOptions: buildVisibleOptionsForDm(nextRoom),
      structuredOptions,
      resolutionPlan,
      narrativeContract: {
        actionType,
        campaignActionType: coherentFacts.actionType,
        target,
        targetId: coherentFacts.target.id,
        outcomeKind: coherentFacts.outcomeKind,
        factualSummary: coherentFacts.factualSummary,
        visibleConsequence: coherentFacts.visibleConsequence,
        narrationHints: coherentFacts.narrationHints,
        must: Array.from(new Set([...actionContract.must, ...coherentFacts.narrationHints.mustMention])),
        avoid: Array.from(new Set([...actionContract.avoid, ...coherentFacts.narrationHints.mustNotMention]))
      }
    }
  };
}

export function applyNarration(room: GameRoom, resolution: ActionResolution, narration: NarrationResponse): GameRoom {
  let nextRoom = { ...resolution.room };
  let sceneProgress = nextRoom.sceneProgress;
  let dangerClock = nextRoom.dangerClock;
  const clues = new Set(nextRoom.mysteryClues);
  const suggestionScene = getCurrentScene(room);

  for (const suggestion of narration.stateSuggestions) {
    if (suggestion.type === "increaseSceneProgress") sceneProgress += Math.min(1, Math.max(0, suggestion.amount));
    if (suggestion.type === "revealClueId") {
      const clue = isValidRevealClueId(room.campaign, suggestionScene.id, suggestion.clueId)
        ? room.campaign.clues.find((item) => item.id === suggestion.clueId)
        : undefined;
      if (clue) clues.add(clue.text);
    }
    if (suggestion.type === "markObjectiveCompleted") sceneProgress = Math.max(sceneProgress, 2.5);
    if (suggestion.type === "adjustDangerClock") dangerClock = Math.max(0, Math.min(10, dangerClock + suggestion.amount));
  }

  const activePlayer = getActivePlayer(room);
  const scene = getCurrentScene(room);
  const eventChoice = scene.actionChoices.find((choice) => resolution.narrationRequest.rawAction.startsWith(choice.action) || resolution.narrationRequest.rawAction.includes(choice.label));
  const enoughStoryForFinal = room.mysteryClues.length >= 3 || room.roundInScene >= 1 || getDangerBand(dangerClock) === "critical";
  const finalSceneDecision = isFinalScene(room) && resolution.check.outcome === "success" && enoughStoryForFinal;
  if (finalSceneDecision) sceneProgress = Math.max(sceneProgress, 2.5);
  const cleanAction = eventChoice?.action ?? resolution.narrationRequest.rawAction;
  const criticalDanger = getDangerBand(dangerClock) === "critical";
  const tragicCompanionDeath = activePlayer.type === "bot"
    && activePlayer.status !== "dead"
    && criticalDanger
    && resolution.check.outcome === "failure"
    && Boolean(resolution.combatNote?.includes("muere cubriendo"));
  const deathCause = tragicCompanionDeath
    ? `${activePlayer.name} muere cubriendo al grupo cuando la amenaza convierte el fallo en sacrificio.`
    : undefined;
  const engineOutcome = deathCause ?? resolution.turnResolution.visibleConsequence ?? resolution.combatNote ?? resolution.consequence?.text ?? eventChoice?.possibleOutcomeHint ?? eventChoice?.memoryImpact ?? "El grupo gana una ventaja concreta sin subir el peligro.";
  const event: GameEvent = {
    id: `${Date.now()}-${room.turn}`,
    turn: room.turn,
    turnNumber: room.turn + 1,
    roundNumber: room.roundInScene + 1,
    playerId: activePlayer.id,
    playerName: activePlayer.name,
    isBot: activePlayer.type === "bot",
    sceneId: scene.id,
    sceneTitle: scene.title,
    actionId: eventChoice?.id,
    actionLabel: eventChoice?.label,
    action: cleanAction,
    stat: resolution.narrationRequest.selectedStat,
    chosenStat: resolution.narrationRequest.selectedStat,
    skillUsed: resolution.narrationRequest.skillUsed,
    petUsed: resolution.narrationRequest.petUsed,
    dice: resolution.check,
    result: resolution.check.outcome,
    engineOutcome,
    source: activePlayer.type === "bot" ? "bot-auto" : "human",
    outcome: resolution.check.outcome,
    total: resolution.check.total,
    narration: sanitizePlayerNarration(resolution, narration.playerNarration ?? narration.sections?.narration ?? narration.narration),
    consequenceText: deathCause ?? buildVisibleConsequence(resolution.turnResolution) ?? resolution.consequence?.text ?? narration.consequenceText ?? narration.sections?.consequence ?? narration.consequence,
    dangerDelta: dangerClock - room.dangerClock,
    progressDelta: sceneProgress - room.sceneProgress,
    unlockedFlags: resolution.room.storyFlags.filter((flag) => !room.storyFlags.includes(flag)),
    unlockedClues: resolution.room.mysteryClues.filter((clue) => !room.mysteryClues.includes(clue)),
    memoryImpact: eventChoice?.memoryImpact ?? cleanAction
  };

  const memoryWithAiUpdate = applyMemoryUpdate(nextRoom, narration.memoryUpdate).memorySummary;
  const stableMemory: MemorySummary = {
    ...memoryWithAiUpdate,
    clues: mergeUnique(memoryWithAiUpdate.clues, [...clues], 12),
    unresolvedThreads: memoryWithAiUpdate.unresolvedThreads.slice(-6),
    lastBeat: `${event.playerName}: ${event.actionLabel ?? event.action}`,
    suspects: memoryWithAiUpdate.suspects.slice(-6),
    betrayals: memoryWithAiUpdate.betrayals.slice(-6),
    bonds: memoryWithAiUpdate.bonds.slice(-6),
    stakes: memoryWithAiUpdate.stakes.slice(-6),
    currentTwist: eventChoice?.memoryImpact || memoryWithAiUpdate.currentTwist
  };

  const players = tragicCompanionDeath
    ? nextRoom.players.map((player) => player.id === activePlayer.id
      ? { ...player, status: "dead" as const, deathCause, character: { ...player.character, vitality: 0 } }
      : player)
    : nextRoom.players;

  nextRoom = {
    ...nextRoom,
    players,
    sceneProgress,
    dangerClock,
    phase: deriveScenePhase({ ...nextRoom, dangerClock, sceneProgress }, scene),
    mysteryClues: [...clues],
    storyFlags: tragicCompanionDeath ? Array.from(new Set([...nextRoom.storyFlags, `companion_dead:${activePlayer.id}`])) : nextRoom.storyFlags,
    memorySummary: tragicCompanionDeath
      ? { ...stableMemory, stakes: Array.from(new Set([...stableMemory.stakes, deathCause!])).slice(-6), currentTwist: deathCause! }
      : stableMemory,
    narrativeMemory: (() => {
      const base = indexTurnResult({ ...nextRoom, players, memorySummary: stableMemory, mysteryClues: [...clues] }, event);
      const threads = updateStoryThreadsAfterResolution(room.narrativeMemory.storyThreads ?? [], { ...nextRoom, dangerClock }, resolution);
      const withNewCons = addPendingConsequenceFromResolution(room.narrativeMemory.pendingConsequences?.filter((pc) => pc.status === "pending") ?? [], { ...nextRoom, dangerClock }, resolution);
      const { triggered, remaining } = evaluatePendingConsequences(withNewCons, { ...nextRoom, dangerClock });
      const { dangerDelta } = applyTriggeredPendingConsequences(nextRoom, triggered);
      if (dangerDelta) dangerClock = Math.max(0, Math.min(10, dangerClock + dangerDelta));
      return {
        ...base,
        storyThreads: threads,
        pendingConsequences: [...triggered, ...remaining].slice(-12),
        moralProfile: updateMoralProfileFromResolution(room.narrativeMemory.moralProfile ?? initialMoralProfile(), resolution)
      };
    })()
  };

  nextRoom.sessionLog = [event, ...nextRoom.sessionLog].slice(0, 24);

  const nextActiveRaw = (room.activePlayerIndex + 1) % room.players.length;
  let nextActive = nextActiveRaw;
  for (let index = 0; index < nextRoom.players.length; index += 1) {
    const candidate = (nextActiveRaw + index) % nextRoom.players.length;
    if (nextRoom.players[candidate]?.status !== "dead") {
      nextActive = candidate;
      break;
    }
  }
  const completedRound = nextActive <= room.activePlayerIndex;
  nextRoom.activePlayerIndex = nextActive;
  nextRoom.turn = room.turn + 1;
  nextRoom.roundInScene = room.roundInScene + (completedRound ? 1 : 0);
  if (completedRound) {
    const energyMax = nextRoom.campaign.energyMax ?? 6;
    nextRoom.players = regenerateRoundEnergy(nextRoom.players, energyMax, 1);
    nextRoom.livingState = {
      ...nextRoom.livingState,
      round: nextRoom.roundInScene + 1,
      turn: nextRoom.turn,
      party: nextRoom.players.map((player) => ({
        id: player.id,
        name: player.name,
        stats: player.character.stats,
        conditions: player.status === "dead" ? ["dead"] : []
      }))
    };
  }

  const endingResolution = resolveEndingForRoom(nextRoom);
  if (endingResolution.shouldEnd) {
    nextRoom.sessionComplete = true;
    nextRoom.phase = "ending";
    nextRoom.endingResolution = endingResolution;
    nextRoom.finalEnding = nextRoom.campaign.possibleEndings.find((ending) => ending.id === endingResolution.endingId) ?? determineEnding(nextRoom);
    nextRoom.finalRecap = endingResolution.narration ?? nextRoom.finalEnding?.description;
    return nextRoom;
  }

  if (shouldAdvanceScene(nextRoom)) {
    if (isFinalScene(nextRoom)) {
      const forcedEndingResolution = resolveEndingForRoom({
        ...nextRoom,
        roundInScene: nextRoom.sessionConfig.maxRoundsPerScene,
        sceneProgress: Math.max(nextRoom.sceneProgress, 2.5)
      });
      nextRoom.sessionComplete = true;
      nextRoom.phase = "ending";
      nextRoom.endingResolution = forcedEndingResolution.shouldEnd ? forcedEndingResolution : nextRoom.endingResolution;
      nextRoom.finalEnding = nextRoom.campaign.possibleEndings.find((ending) => ending.id === nextRoom.endingResolution?.endingId) ?? determineEnding(nextRoom);
      nextRoom.finalRecap = nextRoom.endingResolution?.narration ?? nextRoom.finalEnding?.description;
    } else {
      nextRoom.currentSceneIndex += 1;
      nextRoom.roundInScene = 0;
      nextRoom.sceneProgress = 0;
      nextRoom.phase = "intro";
      nextRoom.activePlayerIndex = 0;
      const advancedScene = nextRoom.campaign.scenes[nextRoom.currentSceneIndex];
      if (advancedScene) {
        nextRoom.livingState = {
          ...nextRoom.livingState,
          currentSceneId: advancedScene.id,
          round: 1,
          locationStates: {
            ...nextRoom.livingState.locationStates,
            [advancedScene.id]: {
              ...(nextRoom.livingState.locationStates[advancedScene.id] ?? { id: advancedScene.id, dangerBand: "low", discoveredSecrets: [], blockedExits: [], changedByMagic: false, changedByCombat: false, notes: [] }),
              visited: true
            }
          },
          npcStates: Object.fromEntries(Object.entries(nextRoom.livingState.npcStates).map(([id, npc]) => [id, { ...npc, present: advancedScene.npcIds.includes(id) }]))
        };
      }
    }
  }

  return nextRoom;
}
