import { buildMechanicalConsequence, isAwkwardMechanicalConsequence, isGenericMechanicalConsequence, type MechanicalConsequence } from "./consequence-builder";
import { concretizeActionText, validateActionSpecificity } from "./context-coherence";
import { buildBotActionFromIntent, chooseBotEmotion, chooseBotIntent, getBotPersonalityProfile, type BotEmotion, type BotIntent } from "./bot-personality";
import type { Campaign, CheckOutcome, CheckResult, ConsequenceResult, GameRoom, Player, Scene, SceneActionChoice, ScenePhase, StatKey, StructuredNextOption } from "./types";

export type ResolutionResult = "success" | "partial" | "failure";

export interface ResolutionPlan {
  turnId: string;
  actorId: string;
  actorName: string;
  actorKind: "player" | "bot" | "npc";
  actionText: string;
  roll: {
    die: "d20";
    value: number;
    bonus?: number;
    total: number;
    dc: number;
    result: ResolutionResult;
    critical?: boolean;
    fumble?: boolean;
  };
  scene: {
    id: string;
    title: string;
    phase: "intro" | "investigation" | "pressure" | "combat" | "climax" | "aftermath";
    location: string;
    dangerBefore: number;
    dangerAfter: number;
  };
  validContext: {
    presentNpcIds: string[];
    presentObjectIds: string[];
    knownClueIds: string[];
    availableClueIds: string[];
    allowedStats: string[];
    allowedTargetKinds: string[];
    targetKind?: string;
    targetId?: string;
    usedObjectIds?: string[];
  };
  mustHappen: string[];
  mustNotHappen: string[];
  consequence: {
    summary: string;
    physicalChange?: string;
    socialChange?: string;
    emotionalChange?: string;
    dangerReason?: string;
    dangerManifestation?: string;
    advantage?: string;
    cost?: string;
    complication?: string;
    clueEffect?: MechanicalConsequence["clueEffect"];
  };
  cluePolicy: {
    canRevealNewClue: boolean;
    allowedClueIds: string[];
    forbiddenClueIds: string[];
    clueRevealMode: "none" | "hint" | "partial" | "full";
  };
  npcDirectives: Array<{
    npcId: string;
    name: string;
    stateBefore?: string;
    stateAfter?: string;
    canSpeak: boolean;
    allowedIntentions: string[];
    forbiddenClaims: string[];
  }>;
  botDirectives: Array<{
    botId: string;
    name: string;
    personality: string;
    emotionalState: string;
    currentGoal: string;
    fear?: string;
    desire?: string;
    speechStyle?: string;
    allowedActions: string[];
    forbiddenActions: string[];
    botIntent: BotIntent;
    botEmotion: BotEmotion;
  }>;
  uiFocus: {
    mainEvent: string;
    highlight: "roll" | "clue" | "danger" | "dialogue" | "consequence" | "combat";
    showAs: "quiet_discovery" | "danger_spike" | "social_pressure" | "combat_hit" | "failed_attempt" | "partial_success";
  };
  memoryPatch: {
    factsToRemember: string[];
    factsToUpdate: string[];
    factsToForget?: string[];
  };
  continuityWarnings: string[];
}

export type ResolutionPlanIssue = { level: "warning" | "error"; code: string; message: string };
export type ResolutionPlanValidation = { ok: boolean; issues: ResolutionPlanIssue[] };

type BuildResolutionPlanInput = {
  roomBefore: GameRoom;
  roomAfter: GameRoom;
  scene: Scene;
  actor: Player;
  actionText: string;
  selectedStat: StatKey;
  check: CheckResult;
  consequence?: ConsequenceResult;
  selectedChoice?: SceneActionChoice;
  phase: ScenePhase;
  structuredOptions: StructuredNextOption[];
  unlockedClueIds: string[];
  damagedClueIds: string[];
  canAdvanceScene: boolean;
  canTriggerEnding: boolean;
  stateChanges: string[];
  npcReactions: string[];
};

const genericConsequence = /^(la escena|el peligro|la presión|la presion|la ventaja|algo|lo ocurrido|la acción|la accion).{0,80}(cambia|sube|avanza|queda|gana|conserva)|puede revelar pista|puede revelar una pista|reducir peligro o abrir combate breve/i;

const allowedTargetKindsByAction: Record<string, string[]> = {
  investigar_objeto: ["object", "scene", "creature"],
  comparar_evidencia: ["object", "scene", "creature"],
  interrogar_npc: ["npc"],
  confrontar_npc: ["npc", "faction"],
  proteger_aliado: ["npc"],
  abrir_ruta: ["route"],
  cerrar_ruta: ["route"],
  mentir: ["npc", "faction"],
  negociar: ["npc", "faction"],
  combatir: ["creature", "npc"],
  huir: ["route", "scene"],
  sacrificar_recurso: ["object", "npc", "scene"],
  usar_objeto: ["object"],
  revelar_prueba: ["object", "npc", "faction", "scene"],
  tomar_decision_moral: ["npc", "faction", "object", "scene"]
};

function toResolutionResult(outcome: CheckOutcome): ResolutionResult {
  return outcome === "partial_success" ? "partial" : outcome;
}

function toPlanPhase(phase: ScenePhase): ResolutionPlan["scene"]["phase"] {
  return phase === "ending" ? "aftermath" : phase;
}

function unique(values: Array<string | undefined | false>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim())));
}

function knownClueIds(campaign: Campaign, clueTexts: string[]) {
  const texts = new Set(clueTexts);
  return campaign.clues.filter((clue) => texts.has(clue.text) || texts.has(clue.id)).map((clue) => clue.id);
}

function sceneLocation(scene: Scene) {
  return (scene as Scene & { location?: string }).location ?? scene.title;
}

function inferPresentObjectIds(campaign: Campaign, scene: Scene) {
  const clueIds = new Set(scene.clueIds ?? []);
  const location = sceneLocation(scene);
  return campaign.storyObjects?.filter((object) => object.relatedClues.some((id) => clueIds.has(id)) || object.location === scene.title || object.location === location).map((object) => object.id) ?? [];
}

function contextLabels(input: BuildResolutionPlanInput, presentObjectIds: string[]) {
  return {
    npcs: Object.fromEntries(input.roomBefore.campaign.npcs.map((npc) => [npc.id, npc.name])),
    objects: Object.fromEntries(input.roomBefore.campaign.storyObjects?.map((object) => [object.id, object.name]) ?? []),
    clues: Object.fromEntries(input.roomBefore.campaign.clues.map((clue) => [clue.id, clue.label ?? clue.text])),
    clueDescriptions: Object.fromEntries(input.roomBefore.campaign.clues.map((clue) => [clue.id, clue.description ?? clue.text]))
  };
}

function consequenceParts(input: BuildResolutionPlanInput, validContext: ResolutionPlan["validContext"], policy: ResolutionPlan["cluePolicy"]): ResolutionPlan["consequence"] {
  const result = toResolutionResult(input.check.outcome);
  const mechanical = buildMechanicalConsequence({
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorKind: input.actor.type === "bot" ? "bot" : "player",
    actionText: input.selectedChoice?.label ?? input.actionText,
    result,
    scene: {
      id: input.scene.id,
      title: input.scene.title,
      location: sceneLocation(input.scene),
      phase: toPlanPhase(input.phase),
      objective: input.scene.objective,
      dangerBefore: input.roomBefore.dangerClock,
      dangerAfter: input.roomAfter.dangerClock
    },
    validContext: {
      presentNpcIds: validContext.presentNpcIds,
      presentObjectIds: validContext.presentObjectIds,
      availableClueIds: validContext.availableClueIds,
      knownClueIds: validContext.knownClueIds
    },
    roll: { total: input.check.total, dc: input.check.difficulty },
    contextLabels: contextLabels(input, validContext.presentObjectIds),
    target: { id: input.selectedChoice?.targetId, kind: input.selectedChoice?.targetKind, label: input.selectedChoice?.label },
    clueRevealMode: policy.clueRevealMode
  });
  return {
    summary: mechanical.summary,
    physicalChange: mechanical.physicalChange,
    socialChange: mechanical.socialChange,
    emotionalChange: mechanical.emotionalChange,
    dangerReason: mechanical.dangerManifestation,
    dangerManifestation: mechanical.dangerManifestation,
    advantage: mechanical.advantage,
    cost: mechanical.cost,
    complication: mechanical.complication,
    clueEffect: mechanical.clueEffect
  };
}

function buildMustHappen(input: BuildResolutionPlanInput, summary: string) {
  const result = toResolutionResult(input.check.outcome);
  const list = [
    `${input.actor.name} realiza: ${input.actionText}.`,
    `La tirada queda como ${input.check.total} vs ${input.check.difficulty}: ${result}.`,
    summary
  ];
  if (result === "success") list.push("Debe verse una ventaja clara, pero no resolver toda la campaña salvo permiso del motor.");
  if (result === "partial") list.push("Debe verse avance con coste: información incompleta, presión, gasto, exposición o deuda.");
  if (result === "failure") list.push("Debe verse una complicación real, no una recompensa limpia.");
  if (input.roomAfter.dangerClock >= 8) list.push("La presión debe sentirse peligrosa en pantalla.");
  return unique(list).slice(0, 8);
}

function buildMustNotHappen(input: BuildResolutionPlanInput) {
  const result = toResolutionResult(input.check.outcome);
  const list = [
    "No cambiar el resultado de la tirada.",
    "No inventar pistas, NPCs, objetos ni ubicaciones.",
    "No revelar una pista fuera de allowedClueIds.",
    "No hacer hablar NPCs ausentes.",
    ...input.roomBefore.memorySummary.forbiddenContradictions
  ];
  if (result === "failure") {
    list.push("No revelar una pista completa como recompensa directa del fallo.");
    list.push("No avanzar a final por un fallo.");
  }
  if (result === "partial") list.push("No narrar el parcial como victoria limpia.");
  if (!input.canTriggerEnding) list.push("No cerrar la escena ni desbloquear final secreto.");
  return unique(list).slice(0, 12);
}

function cluePolicy(input: BuildResolutionPlanInput): ResolutionPlan["cluePolicy"] {
  const result = toResolutionResult(input.check.outcome);
  const available = input.scene.clueIds ?? [];
  const allowed = input.unlockedClueIds.filter((id) => available.includes(id));
  const forbidden = input.roomBefore.campaign.clues.map((clue) => clue.id).filter((id) => !available.includes(id));
  if (result === "failure") return { canRevealNewClue: false, allowedClueIds: [], forbiddenClueIds: forbidden, clueRevealMode: "none" };
  if (result === "partial") return { canRevealNewClue: allowed.length > 0, allowedClueIds: allowed, forbiddenClueIds: forbidden, clueRevealMode: "partial" };
  return { canRevealNewClue: allowed.length > 0, allowedClueIds: allowed, forbiddenClueIds: forbidden, clueRevealMode: allowed.length ? "full" : "none" };
}

function npcDirectives(input: BuildResolutionPlanInput): ResolutionPlan["npcDirectives"] {
  const present = new Set(input.scene.npcIds ?? []);
  return input.roomBefore.campaign.npcs.filter((npc) => present.has(npc.id)).map((npc) => ({
    npcId: npc.id,
    name: npc.name,
    stateBefore: npc.role,
    stateAfter: input.npcReactions.find((reaction) => reaction.includes(npc.id)),
    canSpeak: true,
    allowedIntentions: ["warn", "lie", "plead", "threaten", "deflect"],
    forbiddenClaims: ["No revelar secretos no desbloqueados por el motor.", "No contradecir pistas confirmadas."]
  }));
}

function botDirectives(input: BuildResolutionPlanInput): ResolutionPlan["botDirectives"] {
  return input.roomBefore.players.filter((player) => player.type === "bot").map((bot) => {
    const profile = getBotPersonalityProfile(bot.id || bot.name);
    const botIntent = chooseBotIntent(bot, input.roomBefore, input.scene);
    const botEmotion = chooseBotEmotion(bot, input.roomBefore, input.scene);
    const concreteActions = input.structuredOptions.map((option) => concretizeActionText(option.label, {
      actorName: bot.name,
      scene: { location: sceneLocation(input.scene) } as never,
      validContext: { presentNpcIds: input.scene.npcIds ?? [], presentObjectIds: inferPresentObjectIds(input.roomBefore.campaign, input.scene), availableClueIds: input.scene.clueIds ?? [], knownClueIds: [] } as never,
      npcDirectives: npcDirectives(input)
    })).slice(0, 5);
    const personalityAction = buildBotActionFromIntent(bot, botIntent, botEmotion, { scene: input.scene, options: input.scene.actionChoices });
    return {
      botId: bot.id,
      name: bot.name,
      personality: `${profile.archetype}: ${profile.personality}`,
      emotionalState: bot.status === "dead" ? "muerto" : botEmotion,
      currentGoal: profile.desire,
      fear: profile.fear,
      desire: profile.desire,
      speechStyle: profile.speechStyle,
      allowedActions: unique([personalityAction, ...concreteActions]).slice(0, 5),
      forbiddenActions: bot.status === "dead" ? ["No puede actuar porque está muerto."] : [
        "No usar acciones genéricas sin objeto, NPC o ubicación concreta.",
        profile.name === "Belo" ? "No hacer análisis fino de pruebas si Miri puede hacerlo." : "",
        profile.name === "Miri" ? "No tanquear a la turba ni recibir pedradas si Belo puede cubrir." : ""
      ].filter(Boolean),
      botIntent,
      botEmotion
    };
  });
}

export function buildResolutionPlan(input: BuildResolutionPlanInput): ResolutionPlan {
  const result = toResolutionResult(input.check.outcome);
  const availableClueIds = input.scene.clueIds ?? [];
  const presentNpcIds = input.scene.npcIds ?? [];
  const presentObjectIds = unique([
    ...inferPresentObjectIds(input.roomBefore.campaign, input.scene),
    input.selectedChoice?.targetKind === "object" ? input.selectedChoice.targetId : undefined,
    input.selectedChoice?.objectId
  ]);
  const actionType = input.selectedChoice?.actionType ?? input.selectedChoice?.intent ?? input.selectedChoice?.category ?? "unknown";
  const validContext: ResolutionPlan["validContext"] = {
    presentNpcIds,
    presentObjectIds,
    knownClueIds: knownClueIds(input.roomBefore.campaign, input.roomBefore.mysteryClues),
    availableClueIds,
    allowedStats: input.scene.allowedStats,
    allowedTargetKinds: allowedTargetKindsByAction[actionType] ?? [],
    targetKind: input.selectedChoice?.targetKind,
    targetId: input.selectedChoice?.targetId,
    usedObjectIds: unique([input.selectedChoice?.objectId, input.selectedChoice?.targetKind === "object" ? input.selectedChoice.targetId : undefined])
  };
  const policy = cluePolicy(input);
  const consequence = consequenceParts(input, validContext, policy);
  const plan: ResolutionPlan = {
    turnId: `${input.roomBefore.id}:${input.roomBefore.turn + 1}`,
    actorId: input.actor.id,
    actorName: input.actor.name,
    actorKind: input.actor.type === "bot" ? "bot" : "player",
    actionText: concretizeActionText(input.actionText, { actorName: input.actor.name, scene: { location: sceneLocation(input.scene) } as never, validContext, npcDirectives: npcDirectives(input) }),
    roll: {
      die: "d20",
      value: input.check.d20.value,
      bonus: input.check.rollBreakdown.statModifier + input.check.rollBreakdown.d4Bonus + input.check.rollBreakdown.flatBonus - input.check.rollBreakdown.penalties,
      total: input.check.total,
      dc: input.check.difficulty,
      result,
      critical: input.check.critical,
      fumble: input.check.fumble
    },
    scene: {
      id: input.scene.id,
      title: input.scene.title,
      phase: toPlanPhase(input.phase),
      location: sceneLocation(input.scene),
      dangerBefore: input.roomBefore.dangerClock,
      dangerAfter: input.roomAfter.dangerClock
    },
    validContext,
    mustHappen: [],
    mustNotHappen: [],
    consequence,
    cluePolicy: policy,
    npcDirectives: npcDirectives(input),
    botDirectives: botDirectives(input),
    uiFocus: {
      mainEvent: consequence.summary,
      highlight: result === "success" && input.unlockedClueIds.length ? "clue" : input.roomAfter.dangerClock > input.roomBefore.dangerClock ? "danger" : result === "failure" ? "consequence" : input.selectedChoice?.category === "fight" ? "combat" : "roll",
      showAs: result === "failure" ? "failed_attempt" : result === "partial" ? "partial_success" : input.roomAfter.dangerClock > input.roomBefore.dangerClock ? "danger_spike" : input.selectedChoice?.category === "fight" ? "combat_hit" : "quiet_discovery"
    },
    memoryPatch: {
      factsToRemember: result === "success" ? [consequence.summary] : [],
      factsToUpdate: result !== "success" ? [consequence.summary] : []
    },
    continuityWarnings: []
  };
  plan.mustHappen = buildMustHappen(input, consequence.summary);
  plan.mustNotHappen = buildMustNotHappen(input);
  plan.continuityWarnings = validateResolutionPlan(plan).issues.filter((issue) => issue.level === "warning").map((issue) => issue.message);
  return plan;
}

function issue(level: ResolutionPlanIssue["level"], code: string, message: string): ResolutionPlanIssue {
  return { level, code, message };
}

export function validatePhase(plan: ResolutionPlan): ResolutionPlanIssue[] {
  const issues: ResolutionPlanIssue[] = [];
  if (plan.scene.phase === "climax" && plan.scene.dangerAfter < 8) issues.push(issue("error", "climax-danger-low", "No se permite climax con danger menor a 8 sin bandera explícita."));
  if (plan.roll.result === "failure" && plan.scene.phase === "aftermath") issues.push(issue("error", "failure-ending", "Un fallo no debe avanzar directamente a final/aftermath."));
  return issues;
}

export function validateCluePolicy(plan: ResolutionPlan): ResolutionPlanIssue[] {
  const issues: ResolutionPlanIssue[] = [];
  const available = new Set(plan.validContext.availableClueIds);
  for (const id of plan.cluePolicy.allowedClueIds) if (!available.has(id)) issues.push(issue("error", "invalid-clue", `La pista ${id} no está disponible en la escena.`));
  if (plan.roll.result === "failure" && (plan.cluePolicy.clueRevealMode === "full" || plan.cluePolicy.allowedClueIds.length > 0)) issues.push(issue("error", "failure-reveals-clue", "Un fallo no puede revelar una pista completa."));
  return issues;
}

export function validateValidContext(plan: ResolutionPlan): ResolutionPlanIssue[] {
  const issues: ResolutionPlanIssue[] = [];
  if (plan.validContext.targetKind && plan.validContext.allowedTargetKinds.length > 0 && !plan.validContext.allowedTargetKinds.includes(plan.validContext.targetKind)) {
    issues.push(issue("error", "invalid-target-kind", `${plan.actionText}: ${plan.validContext.targetKind} no es un targetKind válido para esta acción.`));
  }
  const presentObjects = new Set(plan.validContext.presentObjectIds);
  for (const objectId of plan.validContext.usedObjectIds ?? []) {
    if (!presentObjects.has(objectId)) issues.push(issue("error", "object-not-present", `Objeto ${objectId} no está presente y no puede usarse.`));
  }
  return issues;
}

export function validateNpcDirectives(plan: ResolutionPlan): ResolutionPlanIssue[] {
  const issues: ResolutionPlanIssue[] = [];
  const present = new Set(plan.validContext.presentNpcIds);
  for (const npc of plan.npcDirectives) {
    if (!present.has(npc.npcId)) issues.push(issue("error", "npc-not-present", `NPC ${npc.npcId} no está presente y no puede hablar.`));
  }
  return issues;
}

export function validateBotDirectives(plan: ResolutionPlan): ResolutionPlanIssue[] {
  const issues: ResolutionPlanIssue[] = [];
  for (const bot of plan.botDirectives) {
    if (bot.allowedActions.some((action) => /proteger lo conseguido|tomar una decisión arriesgada|aceptar un coste$/i.test(action))) {
      issues.push(issue("warning", "generic-bot-action", `Bot ${bot.name} conserva una acción demasiado genérica.`));
    }
  }
  return issues;
}

export function validateConsequence(plan: ResolutionPlan): ResolutionPlanIssue[] {
  const issues: ResolutionPlanIssue[] = [];
  for (const actionIssue of validateActionSpecificity(plan.actionText)) issues.push(issue(actionIssue.level, actionIssue.code, actionIssue.message));
  if (!plan.consequence.summary.trim()) issues.push(issue("error", "empty-consequence", "La consecuencia está vacía."));
  if (genericConsequence.test(plan.consequence.summary) || isGenericMechanicalConsequence(plan.consequence.summary)) issues.push(issue("error", "generic-consequence", "La consecuencia parece genérica y debe concretarse."));
  if (isAwkwardMechanicalConsequence(plan.consequence.summary)) issues.push(issue("error", "awkward-consequence", "La consecuencia suena armada, condicional o poco natural."));
  return issues;
}

export function validateResolutionPlan(plan: ResolutionPlan): ResolutionPlanValidation {
  const issues = [
    ...validatePhase(plan),
    ...validateCluePolicy(plan),
    ...validateValidContext(plan),
    ...validateNpcDirectives(plan),
    ...validateBotDirectives(plan),
    ...validateConsequence(plan)
  ];
  return { ok: issues.every((item) => item.level !== "error"), issues };
}
