import type { ResolutionPlan } from "@tiny-quest/game-engine";

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
  maxCallsPerRun: 3,
  maxCallsPerScene: 2,
  maxPromptChars: 6000,
  maxOutputChars: 2500,
  useGroqForPlayerTurns: true,
  useGroqForBotTurns: false,
  useGroqForMajorMomentsOnly: true,
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

export function buildCompactGroqPrompt(plan: ResolutionPlan, maxChars = DEFAULT_CHEAP_LLM_POLICY.maxPromptChars) {
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
    rules: ["Obedecer consequence.summary exacto.", "No inventar NPCs, objetos, pistas ni ubicaciones.", "No cambiar dado ni resultado.", "No revelar mustNotHappen.", "No usar clueReveals si cluePolicy.canRevealNewClue=false."]
  };
  const text = JSON.stringify(payload);
  if (text.length <= maxChars) return text;
  return JSON.stringify({ ...payload, mustHappen: payload.mustHappen.slice(0, 2), mustNotHappen: payload.mustNotHappen.slice(0, 2), botDirectives: [], npcDirectives: payload.npcDirectives.slice(0, 2) }).slice(0, maxChars);
}

export function getNarrationCacheKey(plan: ResolutionPlan): string {
  return JSON.stringify({ turnId: plan.turnId, actorId: plan.actorId, actionText: plan.actionText, rollTotal: plan.roll.total, rollResult: plan.roll.result, consequence: plan.consequence.summary, sceneId: plan.scene.id });
}
