import type { NarrationRequest, ResolutionPlan } from "@tiny-quest/game-engine";

export interface LlmBudgetPolicy {
  enabled: boolean;
  maxCallsPerRun: number;
  maxCallsPerScene: number;
  maxPromptChars: number;
  maxOutputChars: number;
  useGroqForPlayerTurns: boolean;
  useGroqForBotTurns: boolean;
  useGroqForMajorMomentsOnly: boolean;
  cacheEnabled: boolean;
  retryOnInvalidJson: boolean;
}

export interface LlmBudgetState {
  callsUsed: number;
  callsUsedByScene: Record<string, number>;
  skippedCalls: Array<{
    reason: string;
    actorId?: string;
    sceneId?: string;
    turnId?: string;
  }>;
}

export const DEFAULT_CHEAP_LLM_POLICY: LlmBudgetPolicy = {
  enabled: true,
  maxCallsPerRun: 16,
  maxCallsPerScene: 6,
  maxPromptChars: 6500,
  maxOutputChars: 3200,
  useGroqForPlayerTurns: true,
  useGroqForBotTurns: false,
  useGroqForMajorMomentsOnly: false,
  cacheEnabled: true,
  retryOnInvalidJson: false
};

export function createLlmBudgetState(initial: Partial<LlmBudgetState> = {}): LlmBudgetState {
  return { callsUsed: initial.callsUsed ?? 0, callsUsedByScene: { ...(initial.callsUsedByScene ?? {}) }, skippedCalls: [...(initial.skippedCalls ?? [])] };
}

function envValue(name: string) {
  const proc = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  return proc.process?.env?.[name];
}

export function hasGroqApiKey() {
  return Boolean(envValue("GROQ_API_KEY") || envValue("VITE_GROQ_API_KEY"));
}

export function recordSkippedCall(state: LlmBudgetState, plan: ResolutionPlan, reason: string) {
  state.skippedCalls.push({ reason, actorId: plan.actorId, sceneId: plan.scene.id, turnId: plan.turnId });
}

export function recordGroqCall(state: LlmBudgetState, plan: ResolutionPlan) {
  state.callsUsed += 1;
  state.callsUsedByScene[plan.scene.id] = (state.callsUsedByScene[plan.scene.id] ?? 0) + 1;
}

export function shouldCallGroq(plan: ResolutionPlan, policy: LlmBudgetPolicy = DEFAULT_CHEAP_LLM_POLICY, state: LlmBudgetState = createLlmBudgetState(), hasApiKeyOverride?: boolean): { allowed: boolean; reason: string } {
  if (!policy.enabled) return { allowed: false, reason: "policy-disabled" };
  if (!(hasApiKeyOverride ?? hasGroqApiKey())) return { allowed: false, reason: "missing-groq-api-key" };
  if (state.callsUsed >= policy.maxCallsPerRun) return { allowed: false, reason: "max-calls-per-run" };
  if ((state.callsUsedByScene[plan.scene.id] ?? 0) >= policy.maxCallsPerScene) return { allowed: false, reason: "max-calls-per-scene" };
  if (plan.actorKind === "bot" && !policy.useGroqForBotTurns) return { allowed: false, reason: "bot-turns-disabled" };
  if (plan.actorKind === "player" && !policy.useGroqForPlayerTurns) return { allowed: false, reason: "player-turns-disabled" };
  if (policy.useGroqForMajorMomentsOnly) {
    const dangerChanged = plan.scene.dangerAfter !== plan.scene.dangerBefore;
    const isMajor = plan.actorKind === "player" && (((plan.roll.result === "partial" || plan.roll.result === "failure") && dangerChanged) || plan.cluePolicy.canRevealNewClue || plan.scene.dangerAfter >= 6 || ["pressure", "combat", "climax"].includes(plan.scene.phase) || plan.uiFocus.showAs === "danger_spike");
    if (!isMajor) return { allowed: false, reason: "not-major-moment" };
  }
  return { allowed: true, reason: "allowed" };
}

function short(value: string | undefined, max = 220) {
  if (!value) return value;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function buildNarrativeStoryContext(input: NarrationRequest) {
  const campaign = input.selectedCampaign;
  const memory = input.memorySummary;
  if (!campaign) return undefined;
  const sceneClueIds = input.currentScene.clueIds ?? [];
  const sceneObjects = campaign.storyObjects
    ?.filter((o) => sceneClueIds.some((c) => o.relatedClues?.includes(c)) || o.location?.toLowerCase().includes(input.currentScene.id))
    .slice(0, 3)
    .map((o) => ({ name: o.name, desc: short(o.description, 90), status: o.status }));
  const activeTwist = memory.currentTwist ? short(memory.currentTwist, 140) : undefined;
  const pendingTwists = campaign.twists
    ?.filter((t) => !input.storyFlags.includes(`twist:${t.id}:revealed`))
    .slice(0, 2)
    .map((t) => ({ trigger: t.trigger, hint: short(t.reveal, 100) }));
  const narrativeDirective = activeTwist
    ? "Giro activo: tejelo como señal oblicua en la narración, nunca revelación directa."
    : pendingTwists?.length
      ? "Hay giros pendientes: genera tensión que insinúe revelaciones futuras sin revelarlas."
      : "Narrá con objeto físico de la escena, tensión emocional entre personajes y riesgo concreto.";
  return {
    sceneObjects: sceneObjects?.length ? sceneObjects : undefined,
    activeTwist,
    pendingTwists: pendingTwists?.length ? pendingTwists : undefined,
    moralPressure: short(campaign.moralDilemmas?.[0], 140),
    graveConsequence: short(campaign.graveConsequences?.[0], 110),
    openThreads: memory.unresolvedThreads?.slice(0, 2),
    bonds: memory.bonds?.slice(0, 2),
    suspects: memory.suspects?.slice(0, 2),
    narrativeDirective
  };
}

export function buildCompactGroqPrompt(plan: ResolutionPlan, maxChars = DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, input?: NarrationRequest) {
  const storyContext = input ? buildNarrativeStoryContext(input) : undefined;
  const retrievedMemories = input?.narrativeContext?.retrievedMemories
    ?.slice(0, 5)
    .map((r) => ({ type: r.memory.type, summary: r.memory.summaryLine, turn: r.memory.createdAtTurn, resolved: r.memory.resolved, score: Math.round(r.score * 100) / 100 }));
  const moralProfileSummary = input?.narrativeContext?.moralProfileSummary;
  const payload = {
    contract: "DungeonNarrationOutput JSON only",
    actor: { id: plan.actorId, name: plan.actorName, kind: plan.actorKind },
    actionText: plan.actionText,
    roll: { total: plan.roll.total, dc: plan.roll.dc, result: plan.roll.result },
    scene: { id: plan.scene.id, title: plan.scene.title, location: plan.scene.location, phase: plan.scene.phase, dangerBefore: plan.scene.dangerBefore, dangerAfter: plan.scene.dangerAfter },
    consequence: { summary: plan.consequence.summary, physicalChange: short(plan.consequence.physicalChange), socialChange: short(plan.consequence.socialChange), emotionalChange: short(plan.consequence.emotionalChange), dangerManifestation: short(plan.consequence.dangerManifestation) },
    mustHappen: plan.mustHappen.map((item) => short(item, 180)),
    mustNotHappen: plan.mustNotHappen.map((item) => short(item, 180)),
    allowedSpeakers: { actorId: plan.actorId, npcIds: plan.validContext.presentNpcIds, botIds: plan.botDirectives.map((bot) => bot.botId) },
    cluePolicy: plan.cluePolicy,
    botDirectives: plan.botDirectives.slice(0, 2).map((bot) => ({ botId: bot.botId, name: bot.name, allowedActions: bot.allowedActions.slice(0, 2), intent: bot.botIntent, emotion: bot.botEmotion })),
    npcDirectives: plan.npcDirectives.slice(0, 3).map((npc) => ({ npcId: npc.npcId, name: npc.name, canSpeak: npc.canSpeak, allowedIntentions: npc.allowedIntentions.slice(0, 3) })),
    uiFocus: plan.uiFocus,
    storyContext,
    retrievedMemories: retrievedMemories?.length ? retrievedMemories : undefined,
    moralProfileSummary: moralProfileSummary || undefined,
    rules: ["Obedecer consequence.summary exacto.", "No inventar NPCs, objetos, pistas ni ubicaciones.", "No cambiar dado ni resultado.", "No revelar mustNotHappen.", "No usar clueReveals si cluePolicy.canRevealNewClue=false.", "Usar storyContext para enriquecer narración: objetos físicos, giros oblicuos, tensión emocional entre personajes.", "retrievedMemories son hechos confirmados del pasado — úsalos para continuidad narrativa, no los contradigas."]
  };
  const text = JSON.stringify(payload);
  if (text.length <= maxChars) return text;
  const slim = { ...payload, storyContext: storyContext ? { narrativeDirective: storyContext.narrativeDirective, activeTwist: storyContext.activeTwist } : undefined, retrievedMemories: retrievedMemories?.slice(0, 2), mustHappen: payload.mustHappen.slice(0, 2), mustNotHappen: payload.mustNotHappen.slice(0, 2), botDirectives: [], npcDirectives: payload.npcDirectives.slice(0, 2) };
  return JSON.stringify(slim).slice(0, maxChars);
}

export function getNarrationCacheKey(plan: ResolutionPlan): string {
  return JSON.stringify({ turnId: plan.turnId, actorId: plan.actorId, actionText: plan.actionText, rollTotal: plan.roll.total, rollResult: plan.roll.result, consequence: plan.consequence.summary, sceneId: plan.scene.id });
}
