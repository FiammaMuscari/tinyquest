import type { NarrationRequest, NarrativeIngredientBundle, ResolutionPlan } from "@tiny-quest/game-engine";

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
  maxCallsPerRun: 24,
  maxCallsPerScene: 8,
  maxPromptChars: 3200,
  maxOutputChars: 3200,
  useGroqForPlayerTurns: true,
  useGroqForBotTurns: true,
  useGroqForMajorMomentsOnly: false,
  cacheEnabled: true,
  retryOnInvalidJson: true
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

export function buildCompactGroqPrompt(plan: ResolutionPlan, maxChars = DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, input?: NarrationRequest, bundle?: NarrativeIngredientBundle) {
  // Recent LLM narration paragraphs — the story so far, LLM must continue from here
  const storyLast = (input?.recentSessionLog ?? [])
    .slice(0, 3)
    .map((e) => e.narration ?? "")
    .filter((n) => n.length > 20)
    .map((n) => short(n, 300) ?? n);

  // Hard facts for this turn (what happened, must appear in narration)
  const facts = bundle?.hardFacts.map((f) => short(f, 130) ?? f)
    ?? plan.mustHappen.slice(0, 5).map((f) => short(f, 130) ?? f);

  // Forbidden facts (must never appear)
  const forbidden = bundle?.forbiddenFacts.slice(0, 4).map((f) => short(f, 110) ?? f)
    ?? plan.mustNotHappen.slice(0, 3).map((f) => short(f, 110) ?? f);

  // Scene NPCs from bundle or plan. hiddenTies = relaciones secretas entre NPCs
  // (relationshipToOtherNPCs, cargado por la forja): viajan como subtexto, cap 2.
  const campaignNpcs = input?.selectedCampaign?.npcs;
  const hiddenTiesFor = (npcId: string): string[] | undefined => {
    const relations = campaignNpcs?.find((c) => c.id === npcId)?.relationshipToOtherNPCs;
    if (!relations) return undefined;
    const ties = Object.entries(relations).slice(0, 2).map(([otherId, nature]) => {
      const otherName = campaignNpcs?.find((c) => c.id === otherId)?.name ?? otherId;
      return `${otherName}: ${short(nature, 90) ?? nature}`;
    });
    return ties.length ? ties : undefined;
  };
  const npcs = bundle
    ? bundle.presentNpcs.slice(0, 3).map((n) => {
      const hiddenTies = hiddenTiesFor(n.id);
      return { name: n.name, attitude: n.currentAttitude, gestures: n.plausibleGestures.slice(0, 2), ...(hiddenTies ? { hiddenTies } : {}) };
    })
    : plan.npcDirectives.slice(0, 3).map((n) => ({ name: n.name, attitude: "desconocida", gestures: [] as string[] }));

  // Scene objects and motifs from bundle
  const objects = bundle
    ? bundle.loadedObjects.slice(0, 3).map((o) => ({ name: o.name, state: o.knownState }))
    : [];
  const motifs = bundle?.sensoryMotifs.slice(0, 3) ?? [];

  // Opening fragments of recent narrations — the LLM must NOT start the same way.
  // Use the first ~12 words so the constraint targets the actual repeated phrase.
  const noRepeat = (bundle?.recentNarrationOpenings.slice(0, 4)
    ?? storyLast.map((s) => s.split(/[.!?]/)[0]).filter(Boolean).slice(0, 3))
    .map((s) => s.split(/\s+/).slice(0, 12).join(" "))
    .filter(Boolean);

  // Visible options to enrich with narrative labels — ground each to its real
  // target entity + current state so the label references the right NPC/object,
  // not a random one from the scene.
  const liveNpcById = new Map((bundle?.presentNpcs ?? []).map((n) => [n.id, n] as const));
  const liveObjById = new Map((bundle?.loadedObjects ?? []).map((o) => [o.id, o] as const));
  const campaign = input?.selectedCampaign;
  const resolveOptionTarget = (o: { targetId?: string; npcId?: string; objectId?: string; routeId?: string }): { name: string; state?: string } | undefined => {
    const id = o.npcId ?? o.objectId ?? o.routeId ?? o.targetId;
    if (!id) return undefined;
    const liveNpc = liveNpcById.get(id);
    if (liveNpc) return { name: liveNpc.name, state: liveNpc.currentAttitude };
    const liveObj = liveObjById.get(id);
    if (liveObj) return { name: liveObj.name, state: liveObj.knownState };
    const npc = campaign?.npcs.find((n) => n.id === id);
    if (npc) return { name: npc.name };
    const obj = campaign?.storyObjects?.find((x) => x.id === id);
    if (obj) return { name: obj.name, state: obj.status };
    const enemy = campaign?.enemies.find((e) => e.id === id);
    if (enemy) return { name: enemy.name };
    return undefined;
  };
  const optionsToLabel = (input?.visibleOptions ?? []).slice(0, 5).map((o) => {
    const target = resolveOptionTarget(o);
    return {
      id: o.id,
      mechanic: o.label,
      ...(target ? { target: target.name } : {}),
      ...(target?.state ? { targetState: target.state } : {}),
      ...(o.intent ? { intent: o.intent } : {}),
      ...(o.riskLevel ? { risk: o.riskLevel } : {})
    };
  });

  // Bots
  const bots = plan.botDirectives.slice(0, 2).map((b) => ({
    name: b.name, intent: b.botIntent, emotion: b.botEmotion, action: b.allowedActions[0] ?? ""
  }));

  // Pistas plantadas (isFalse en la campaña) dentro de las revelables: el narrador
  // las vende creíbles pero siembra el detalle que no cierra — jamás las declara falsas.
  const clueIds = plan.cluePolicy.canRevealNewClue ? plan.cluePolicy.allowedClueIds.slice(0, 3) : [];
  const plantadas = clueIds.filter((id) => input?.selectedCampaign?.clues?.find((c) => c.id === id)?.isFalse);

  // El arma/oficio del héroe (dagas gemelas, arco encantado, ganzúas…): el
  // narrador debe saber CON QUÉ actúa el personaje, no narrar manos genéricas.
  const actorSkill = plan.actorKind === "player" ? short(input?.character?.specialAbility, 150) : undefined;

  const payload = {
    story: storyLast,
    turn: {
      actor: plan.actorName,
      kind: plan.actorKind,
      ...(actorSkill ? { actorSkill } : {}),
      action: plan.actionText,
      roll: { total: plan.roll.total, dc: plan.roll.dc, result: plan.roll.result, ...(plan.roll.critical ? { critical: true } : {}), ...(plan.roll.fumble ? { fumble: true } : {}) },
      facts,
      consequence: plan.consequence.summary,
      forbidden,
      clue: plan.cluePolicy.canRevealNewClue
        ? { canReveal: true, ids: clueIds, ...(plantadas.length ? { plantadas } : {}) }
        : { canReveal: false }
    },
    scene: {
      location: plan.scene.title,
      dangerBefore: plan.scene.dangerBefore,
      dangerAfter: plan.scene.dangerAfter,
      npcs,
      objects,
      motifs
    },
    bots: bots.length ? bots : undefined,
    noRepeat: noRepeat.length ? noRepeat : undefined,
    optionsToLabel: optionsToLabel.length ? optionsToLabel : undefined,
    rules: [
      "narration: 2-4 párrafos RICOS, entre 130 y 240 palabras — la historia se despliega como un libro, no se apura. Detalle sensorial, la reacción de los personajes presentes, el subtexto de la escena y un hilo que queda tenso para el próximo turno. Nunca cierres la historia ni la escena en un solo turno; cada turno es un capítulo que continúa.",
      "consequence.summary DEBE ser exactamente: " + plan.consequence.summary,
      "dangerChange: before=" + plan.scene.dangerBefore + " after=" + plan.scene.dangerAfter,
      ...(npcs.some((n) => "hiddenTies" in n && n.hiddenTies)
        ? ["npcs[].hiddenTies = relaciones SECRETAS entre personajes: usalas SOLO como subtexto (una mirada esquivada, una tensión, un nombre que incomoda). PROHIBIDO declararlas o revelarlas en la narración."]
        : []),
      ...(plantadas.length
        ? ["clue.plantadas = pistas FALSAS sembradas en la historia: si revelás una, narrala tan creíble como cualquier otra PERO dejá un detalle concreto que no cierra del todo (una hora, una mano, un olor). JAMÁS digas ni insinúes que es falsa."]
        : []),
      ...(actorSkill
        ? ["turn.actorSkill = las armas y herramientas propias del héroe: cuando la acción encaje (combate, cerraduras, puntería, sigilo), que la narración las nombre — pelea con SUS dagas, dispara SU arco, fuerza la cerradura con SUS ganzúas; nunca manos genéricas."]
        : []),
      "enrichedOptions: una etiqueta breve y concreta por cada optionsToLabel.id. Anclá la etiqueta a optionsToLabel.target (la entidad real de esa opción) y reflejá su targetState e intent/risk actuales. No inventes entidades fuera de scene ni cambies la mecánica de la opción.",
      "VARIÁ LA APERTURA: está PROHIBIDO empezar con las mismas palabras, el mismo sujeto o la misma imagen que cualquier entrada de noRepeat. Abrí cada turno distinto: a veces con una acción, a veces con un diálogo, a veces con un detalle sensorial NUEVO.",
      "story[] es continuidad de TRAMA y tensión, NO un molde de prosa: no copies su arranque ni sus frases. No repitas motivos ya usados en turnos previos (un objeto que cae, las voces que se cortan, el sudor frío, etc.); avanzá con material nuevo.",
      ...(plan.roll.critical ? ["turn.roll.critical: fue un golpe de suerte extraordinario (20 natural). Narralo como un momento sobresaliente, casi imposible, sin inventar hechos fuera de facts."] : []),
      ...(plan.roll.fumble ? ["turn.roll.fumble: fue una pifia (1 natural). Narrala como un pequeño desastre que se vuelve en contra del actor, dentro de lo que dice consequence."] : []),
      "PROHIBIDO: inventar NPCs/objetos/pistas fuera de scene. No revelar forbidden."
    ]
  };

  const text = JSON.stringify(payload);
  if (text.length <= maxChars) return text;

  // Slim fallback: drop less critical fields
  const slim = {
    story: storyLast.slice(0, 2).map((s) => short(s, 200) ?? s),
    turn: { ...payload.turn, facts: facts.slice(0, 3), forbidden: forbidden.slice(0, 2) },
    scene: { ...payload.scene, objects: objects.slice(0, 2), motifs: motifs.slice(0, 2) },
    noRepeat: noRepeat.slice(0, 2),
    optionsToLabel: optionsToLabel.slice(0, 3),
    rules: payload.rules
  };
  return JSON.stringify(slim).slice(0, maxChars);
}

export function getNarrationCacheKey(plan: ResolutionPlan): string {
  return JSON.stringify({ turnId: plan.turnId, actorId: plan.actorId, actionText: plan.actionText, rollTotal: plan.roll.total, rollResult: plan.roll.result, consequence: plan.consequence.summary, sceneId: plan.scene.id });
}
