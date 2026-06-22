import { applyNarration, createGameRoom, resolvePlayerAction } from "../engine";
import { chooseBotAction, chooseBotStat } from "../bots";
import { buildCompanionMoment } from "../bot-personality";
import { createCharacter } from "../character";
import { campaigns, defaultCampaign } from "../campaigns";
import { getActivePlayer, getCurrentScene, getVisibleActionChoices } from "../room-state";
import { validateResolutionPlan } from "../resolution-plan";
import { domainsCompatible, inferActionDomain } from "../context-coherence";
import { evaluateNarrativeQuality, generateNarrativeReport, type NarrativePlaytestReport, type NarrativePlaytestTurn } from "./narrativeQuality";
import type { ActionResolution, BotPlayer, CampaignMemoryUpdate, GameRoom, NarrationResponse, SceneActionChoice, StatKey } from "../types";

export type NarrativeSimulationOptions = {
  campaignId?: string;
  maxTurns?: number;
  seed?: number;
  useGroq?: boolean;
  playerName?: string;
};

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function withSeededRandom<T>(random: () => number, fn: () => T) {
  const previous = Math.random;
  Math.random = random;
  try { return fn(); } finally { Math.random = previous; }
}

function pickChoice(choices: SceneActionChoice[], turn: number, random: () => number) {
  const usable = choices.filter((choice) => !/proteger lo conseguido|tomar una decisión arriesgada|aceptar un coste/i.test(`${choice.label} ${choice.action}`));
  const pool = usable.length ? usable : choices;
  if (!pool.length) return undefined;
  return pool.find((choice) => choice.requiredClues?.length || choice.unlocksClues?.length) ?? pool[(turn + Math.floor(random() * pool.length)) % pool.length];
}

function pickAction(room: GameRoom, turn: number, random: () => number) {
  const scene = getCurrentScene(room);
  const actor = getActivePlayer(room);
  const choices = getVisibleActionChoices(scene, room);
  if (actor.type === "bot") {
    const decision = chooseBotAction(room, actor as BotPlayer);
    const selected = choices.find((choice) => choice.action === decision.label || choice.label === decision.label || decision.label.includes(choice.label));
    const stat = decision.allowedByState && scene.allowedStats.includes(decision.suggestedStat) ? decision.suggestedStat : selected?.recommendedStats.find((candidate) => scene.allowedStats.includes(candidate)) ?? chooseBotStat(actor as BotPlayer, scene);
    return { action: selected?.action ?? decision.label, stat };
  }
  const choice = pickChoice(choices, turn, random);
  const stat = choice?.recommendedStats.find((candidate) => scene.allowedStats.includes(candidate)) ?? scene.allowedStats[0] ?? "mind";
  return { action: choice?.action ?? scene.objective, stat };
}

function emptyMemoryUpdate(update: Partial<CampaignMemoryUpdate> = {}): CampaignMemoryUpdate {
  return {
    summary: update.summary,
    facts: update.facts ?? [],
    clues: update.clues ?? [],
    objects: update.objects ?? [],
    npcs: update.npcs ?? [],
    locations: update.locations ?? [],
    dangers: update.dangers ?? [],
    forbiddenContradictions: update.forbiddenContradictions ?? [],
    confirmedFacts: update.confirmedFacts,
    suspicions: update.suspicions,
    damagedClues: update.damagedClues,
    npcStates: update.npcStates,
    objectStates: update.objectStates,
    openQuestions: update.openQuestions
  };
}

function localNarrationFromResolution(resolution: ActionResolution): NarrationResponse {
  const plan = resolution.narrationRequest.resolutionPlan;
  const actor = resolution.narrationRequest.activePlayer.name;
  const scene = resolution.narrationRequest.currentScene.title;
  const result = plan?.roll.result ?? (resolution.check.outcome === "partial_success" ? "partial" : resolution.check.outcome);
  const consequence = plan?.consequence.summary ?? resolution.turnResolution.visibleConsequence;
  const variantSeed = [...(plan?.turnId ?? plan?.actionText ?? actor)].reduce((total, char) => total + char.charCodeAt(0), 0);
  const highPressure = [
    "La amenaza ya no espera: la turba aprieta la puerta y cada gesto cuesta aire.",
    "La campana vibra lejos; los aldeanos miden al grupo como si ya hubieran elegido culpable.",
    "El margen se achica: una piedra cambia de mano y nadie finge calma.",
    "Una soga raspa la madera; la escena pide una decisión antes del próximo grito.",
    "Nicolás queda más expuesto y hasta los aliados bajan la voz.",
    "El ruido de afuera tapa media frase y vuelve urgente cualquier prueba."
  ];
  const midPressure = [
    "La presión se nota en manos tensas y miradas que empiezan a elegir bando.",
    "La madera húmeda cruje bajo los pies; alguien retrocede para no quedar asociado a la prueba.",
    "La escena conserva margen, pero cada voz baja suena como una acusación.",
    "Un aldeano se aparta de la puerta y deja claro que el miedo ya organiza la sala.",
    "La prueba todavía respira, aunque demasiadas manos miran hacia ella.",
    "El silencio no calma: ordena a todos alrededor de quien pueda mentir mejor."
  ];
  const lowPressure = [
    "Todavía hay espacio para mirar, tocar y pensar antes de que todo se cierre.",
    "La sala permite una pregunta más, aunque nadie deja de vigilar la puerta.",
    "El silencio aguanta por ahora; la próxima acción decidirá qué prueba respira.",
    "Una vela chisporrotea y marca el único segundo tranquilo de la escena.",
    "El grupo conserva margen para elegir método, no para perder tiempo.",
    "La escena ofrece una abertura pequeña: hablar, comparar o proteger."
  ];
  const danger = plan?.scene.dangerAfter ?? resolution.narrationRequest.dangerClock;
  const pressurePool = danger >= 8 ? highPressure : danger >= 4 ? midPressure : lowPressure;
  const turnNumber = Number(plan?.turnId.split(":").pop() ?? 0);
  const pressure = pressurePool[(variantSeed + turnNumber) % pressurePool.length];
  const resultLine = result === "success"
    ? [`${actor} gana margen: ${consequence}`, `${actor} deja un cambio visible: ${consequence}`, `${actor} convierte la acción en ventaja concreta: ${consequence}`][variantSeed % 3]
    : result === "partial"
      ? [`${actor} avanza con coste: ${consequence}`, `${actor} consigue una mitad útil, pero paga posición: ${consequence}`, `${actor} sostiene la acción y algo se daña alrededor: ${consequence}`][variantSeed % 3]
      : [`${actor} falla y la complicación se vuelve física: ${consequence}`, `${actor} pierde el pulso del momento: ${consequence}`, `${actor} no logra imponer la acción y el mundo responde: ${consequence}`][variantSeed % 3];
  const narration = resultLine.trim();
  const speaker = plan?.npcDirectives.find((npc) => npc.canSpeak);
  const npcDialogue = speaker ? [`${speaker.name}: “Todavía no terminó.”`] : [];
  const options = resolution.narrationRequest.structuredOptions?.slice(0, 3).map((option) => option.label) ?? [];
  const structuredNarration = plan ? {
    narration,
    immediateAction: { actorId: plan.actorId, actorName: plan.actorName, text: plan.actionText },
    rollPresentation: { total: plan.roll.total, dc: plan.roll.dc, result: plan.roll.result, label: `${plan.roll.result}: ${plan.roll.total} vs ${plan.roll.dc}` },
    dialogue: npcDialogue.map((line) => ({ speakerId: speaker?.npcId ?? "narrator", speakerName: speaker?.name ?? "Narrador", speakerKind: speaker ? "npc" as const : "narrator" as const, line, intention: "reaccionar" })),
    companionMoments: plan.botDirectives.slice(0, 2).map((bot) => {
      const planDomain = inferActionDomain(plan.actionText, plan.validContext.targetId, plan.validContext.targetKind);
      const moment = buildCompanionMoment({ id: bot.botId, name: bot.name }, bot.botIntent, bot.botEmotion, plan);
      const compatibleAction = bot.allowedActions.find((action) => domainsCompatible(planDomain, inferActionDomain(action))) ?? moment.action;
      return { ...moment, action: compatibleAction, emotion: bot.emotionalState, relevance: moment.relevance };
    }),
    consequence: { summary: plan.consequence.summary, physicalChange: plan.consequence.physicalChange, socialChange: plan.consequence.socialChange, emotionalChange: plan.consequence.emotionalChange },
    worldStateChange: { text: plan.consequence.summary, changedNpcIds: plan.npcDirectives.map((npc) => npc.npcId), changedObjectIds: plan.validContext.usedObjectIds ?? [], changedClueIds: plan.cluePolicy.allowedClueIds },
    dangerChange: { before: plan.scene.dangerBefore, after: plan.scene.dangerAfter, manifestation: plan.consequence.dangerManifestation ?? plan.consequence.dangerReason ?? "El peligro no cambia de forma visible." },
    clueReveals: plan.cluePolicy.canRevealNewClue ? plan.cluePolicy.allowedClueIds.map((clueId) => ({ clueId, title: plan.consequence.clueEffect?.clueTitle ?? clueId, mode: plan.cluePolicy.clueRevealMode === "full" ? "full" as const : plan.cluePolicy.clueRevealMode === "partial" ? "partial" as const : "hint" as const, text: plan.consequence.clueEffect?.naturalDescription ?? clueId })) : [],
    uiFocus: { mainText: plan.uiFocus.mainEvent, highlight: plan.uiFocus.highlight, cardType: plan.roll.result === "failure" ? "failure" as const : plan.roll.result === "partial" ? "partial" as const : "success" as const, priority: plan.scene.dangerAfter >= 8 ? "high" as const : "medium" as const },
    memoryPatch: plan.memoryPatch,
    continuityWarnings: plan.continuityWarnings
  } : undefined;
  return {
    narration,
    playerNarration: narration,
    npcDialogue,
    consequence,
    consequenceText: consequence,
    nextOptions: options,
    nextOptionsText: options,
    statePatch: { factsAdded: [], cluesAdded: [], cluesDamaged: result === "failure" ? plan?.cluePolicy.allowedClueIds ?? [] : [], npcUpdates: [], objectUpdates: [], dangerDelta: (plan?.scene.dangerAfter ?? 0) - (plan?.scene.dangerBefore ?? 0), phaseSuggestion: plan?.scene.phase ?? "" },
    plotBeat: { title: scene, hook: consequence, twist: "", characterFocus: actor, threat: pressure, continuity: "Se respeta ResolutionPlan." },
    sections: { narration, dialogue: npcDialogue.join("\n"), consequence, options },
    memoryUpdate: emptyMemoryUpdate({ summary: consequence, facts: result === "success" ? [consequence] : [], dangers: (plan?.scene.dangerAfter ?? 0) > (plan?.scene.dangerBefore ?? 0) ? [pressure] : [], forbiddenContradictions: plan?.mustNotHappen.filter((item) => item.startsWith("No ")).slice(0, 3) ?? [] }),
    stateSuggestions: [],
    pacingHint: "continue",
    structuredNarration
  };
}

function turnFromResolution(turnNumber: number, resolution: ActionResolution, narration: NarrationResponse, warnings: string[], previousTurns: NarrativePlaytestTurn[]): NarrativePlaytestTurn {
  const plan = resolution.narrationRequest.resolutionPlan;
  if (!plan) throw new Error("ResolutionPlan missing from ActionResolution.");
  const base: NarrativePlaytestTurn = {
    turnNumber,
    actorId: plan.actorId,
    actorName: plan.actorName,
    actionText: plan.actionText,
    rollTotal: plan.roll.total,
    dc: plan.roll.dc,
    result: plan.roll.result,
    phase: plan.scene.phase,
    dangerBefore: plan.scene.dangerBefore,
    dangerAfter: plan.scene.dangerAfter,
    resolutionPlanSummary: { mustHappen: plan.mustHappen, mustNotHappen: plan.mustNotHappen, consequence: plan.consequence.summary, uiFocus: plan.uiFocus },
    narration: narration.playerNarration ?? narration.narration,
    warnings,
    score: { coherence: 0, tension: 0, consequence: 0, characterConsistency: 0, sceneContinuity: 0, clueValidity: 0, emotionalImpact: 0, uiClarity: 0, dndFeeling: 0, overall: 0 },
    issues: [],
    resolutionPlan: plan,
    structuredNarration: narration.structuredNarration
  };
  const quality = evaluateNarrativeQuality(base, previousTurns);
  return { ...base, score: quality.score, issues: quality.issues };
}

export async function simulateNarrativeRun(options: NarrativeSimulationOptions = {}): Promise<NarrativePlaytestReport> {
  const campaign = campaigns.find((item) => item.id === options.campaignId) ?? defaultCampaign;
  const maxTurns = options.maxTurns ?? 12;
  const random = createSeededRandom(options.seed ?? 7331);
  let room = createGameRoom({ selectedCampaign: campaign, humanCharacter: createCharacter({ name: options.playerName ?? "Fiamy" }), botCount: 2, id: `narrative-test-${campaign.id}` });
  const turns: NarrativePlaytestTurn[] = [];

  for (let index = 0; index < maxTurns && !room.sessionComplete; index += 1) {
    const selected = pickAction(room, index, random);
    let resolution: ActionResolution;
    try {
      resolution = withSeededRandom(random, () => resolvePlayerAction(room, selected.action, selected.stat as StatKey));
    } catch (_error) {
      const scene = getCurrentScene(room);
      const fallback = getVisibleActionChoices(scene, room)[0];
      if (!fallback) break;
      resolution = withSeededRandom(random, () => resolvePlayerAction(room, fallback.action, fallback.recommendedStats.find((stat) => scene.allowedStats.includes(stat)) ?? scene.allowedStats[0]));
    }
    const plan = resolution.narrationRequest.resolutionPlan;
    if (!plan) throw new Error("ResolutionPlan was not built by the engine.");
    const validation = validateResolutionPlan(plan);
    const warnings = validation.issues.map((issue) => `${issue.level}:${issue.code}:${issue.message}`);
    const narration = localNarrationFromResolution(resolution);
    const turn = turnFromResolution(index + 1, resolution, narration, warnings, turns);
    turns.push(turn);
    room = applyNarration(room, resolution, narration);
  }

  return generateNarrativeReport(turns, campaign.id, campaign.title);
}
