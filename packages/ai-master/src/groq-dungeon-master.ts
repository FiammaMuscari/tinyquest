import type { DungeonMasterProvider, FinalRecapRequest, FinalRecapResponse, NarrationRequest, NarrationResponse } from "@tiny-quest/game-engine";
import { narrationResponseSchema } from "./schemas";
import { buildDungeonMasterSystemPrompt } from "./prompt-builder";
import { buildFallbackNarrationOutput, parseDungeonNarrationOutput, toLegacyNarrationFields } from "./narration-contract";
import { buildCompactGroqPrompt, createLlmBudgetState, DEFAULT_CHEAP_LLM_POLICY, getNarrationCacheKey, recordGroqCall, recordSkippedCall, shouldCallGroq, type LlmBudgetPolicy, type LlmBudgetState } from "./llm-budget";

type GroqEnv = {
  GROQ_API_KEY?: string;
  VITE_GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  VITE_GROQ_MODEL?: string;
  policy?: Partial<LlmBudgetPolicy>;
};

type GroqMessage = {
  role: "system" | "user";
  content: string;
};

type LlmDebugEntry = {
  label: string;
  at: string;
  endpoint: string;
  model: string;
  request: {
    messages: GroqMessage[];
    body: Record<string, unknown>;
  };
  response?: string;
  error?: string;
};

const MAX_GROQ_BODY_CHARS = 12_000;

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function isLlmDebugEnabled() {
  if (!canUseBrowserStorage()) return false;
  return localStorage.getItem("tiny-quest:debug-llm") === "1" || sessionStorage.getItem("tiny-quest:debug-llm") === "1";
}

function writeLlmDebug(entry: LlmDebugEntry) {
  if (!canUseBrowserStorage()) return;
  const safeEntry = { ...entry, request: { ...entry.request, body: { ...entry.request.body, apiKey: undefined } } };
  sessionStorage.setItem("tiny-quest:llm:last", JSON.stringify(safeEntry, null, 2));
  if (!isLlmDebugEnabled()) return;
  const historyRaw = sessionStorage.getItem("tiny-quest:llm:history");
  const history = historyRaw ? JSON.parse(historyRaw) as LlmDebugEntry[] : [];
  history.unshift(safeEntry as LlmDebugEntry);
  sessionStorage.setItem("tiny-quest:llm:history", JSON.stringify(history.slice(0, 12), null, 2));
  // Deliberadamente no contiene API key: solo prompt, payload, modelo y respuesta.
  console.groupCollapsed(`[Tiny Quest LLM] ${entry.label} · ${entry.model}`);
  console.log(safeEntry);
  console.groupEnd();
}

function logDmEvent(label: string, details: Record<string, unknown>) {
  const compact = Object.fromEntries(Object.entries(details).map(([key, value]) => [
    key,
    typeof value === "string" && value.length > 500 ? `${value.slice(0, 497)}...` : value
  ]));
  if (typeof console !== "undefined") console.info(`[Tiny Quest DM] ${label}`, compact);
}

function truncateText(value: unknown, max = 500) {
  if (typeof value !== "string") return value;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function compactGroqMessages(messages: GroqMessage[], emergency = false): GroqMessage[] {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  let payload: Record<string, unknown> = {};
  if (userMessage) {
    try {
      const parsed = JSON.parse(userMessage.content);
      payload = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : { raw: userMessage.content };
    } catch {
      payload = { raw: truncateText(userMessage.content, emergency ? 1_000 : 2_000) };
    }
  }

  const engineResolution = typeof payload.engineResolution === "object" && payload.engineResolution !== null
    ? payload.engineResolution as Record<string, unknown>
    : {};
  const narrationInput = typeof payload.narrationInput === "object" && payload.narrationInput !== null
    ? payload.narrationInput as Record<string, unknown>
    : {};
  const storyMemory = typeof payload.storyMemory === "object" && payload.storyMemory !== null
    ? payload.storyMemory as Record<string, unknown>
    : {};
  const retrievedContext = typeof payload.retrievedContext === "object" && payload.retrievedContext !== null
    ? payload.retrievedContext as Record<string, unknown>
    : {};
  const resolutionPlan = typeof payload.resolutionPlan === "object" && payload.resolutionPlan !== null
    ? payload.resolutionPlan as Record<string, unknown>
    : undefined;

  const compactPayload = {
    resolutionPlan,
    campaign: payload.campaign,
    scene: payload.scene,
    objective: truncateText(payload.objective, 220),
    activePlayer: narrationInput.actorName,
    action: truncateText(engineResolution.action ?? narrationInput.actionLabel, emergency ? 180 : 300),
    actionType: engineResolution.campaignActionType ?? narrationInput.actionType,
    target: engineResolution.target ?? narrationInput.targetPublicName,
    outcome: engineResolution.outcome ?? narrationInput.result,
    roll: engineResolution.roll,
    consequence: truncateText(engineResolution.consequence, 220),
    factualSummary: truncateText(engineResolution.factualSummary ?? narrationInput.factualSummary, 260),
    visibleConsequence: truncateText(engineResolution.visibleConsequence ?? narrationInput.visibleConsequence, 240),
    dangerClock: engineResolution.dangerClock,
    memory: storyMemory.currentMemory,
    cluesFound: storyMemory.cluesFound,
    recentTurns: emergency ? undefined : storyMemory.recentTurns,
    context: emergency ? undefined : {
      facts: retrievedContext.facts,
      clues: retrievedContext.clues,
      characters: retrievedContext.characters,
      currentTheory: truncateText(retrievedContext.currentTheory, 220)
    },
    visibleOptions: payload.visibleOptions,
    requiredJson: {
      narration: "string",
      immediateAction: { actorId: "string", actorName: "string", text: "string" },
      rollPresentation: { total: "number", dc: "number", result: "success|partial|failure", label: "string" },
      dialogue: [{ speakerId: "string", speakerName: "string", speakerKind: "player|bot|npc|narrator", line: "string", intention: "string" }],
      companionMoments: [],
      consequence: { summary: "string", physicalChange: "string?", socialChange: "string?", emotionalChange: "string?" },
      worldStateChange: { text: "string", changedNpcIds: [], changedObjectIds: [], changedClueIds: [] },
      dangerChange: { before: "number", after: "number", manifestation: "string" },
      clueReveals: [],
      uiFocus: { mainText: "string", highlight: "roll|clue|danger|dialogue|consequence|combat", cardType: "discovery|danger|failure|partial|success|combat|social", priority: "low|medium|high" },
      memoryPatch: { factsToRemember: [], factsToUpdate: [] },
      continuityWarnings: []
    }
  };

  return [
    {
      role: "system",
      content: "Sos el narrador de Tiny Quest. Respondé SOLO JSON válido con DungeonNarrationOutput. Obedecé resolutionPlan por encima de todo: no cambies tirada, resultado, pistas, NPCs, objetos, mustHappen ni mustNotHappen. Narrá breve y oscuro usando solo el payload."
    },
    {
      role: "user",
      content: JSON.stringify(compactPayload)
    }
  ];
}

export class GroqDungeonMasterProvider implements DungeonMasterProvider {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly useLocalProxy: boolean;
  private readonly policy: LlmBudgetPolicy;
  private readonly budgetState: LlmBudgetState;
  private cacheHits = 0;
  private fallbackUses = 0;
  private readonly responseCache = new Map<string, NarrationResponse>();
  private readonly pendingNarrationRequests = new Map<string, Promise<NarrationResponse>>();

  constructor(env: GroqEnv = {}) {
    this.apiKey = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY;
    this.model = env.GROQ_MODEL || env.VITE_GROQ_MODEL || "llama-3.3-70b-versatile";
    this.useLocalProxy = !this.apiKey && typeof window !== "undefined";
    this.policy = { ...DEFAULT_CHEAP_LLM_POLICY, ...(env.policy ?? {}) };
    this.budgetState = createLlmBudgetState();
  }

  getBudgetSnapshot() {
    return {
      policy: this.policy,
      state: { callsUsed: this.budgetState.callsUsed, callsUsedByScene: { ...this.budgetState.callsUsedByScene }, skippedCalls: [...this.budgetState.skippedCalls] },
      cacheHits: this.cacheHits,
      fallbackUses: this.fallbackUses
    };
  }

  async generateNarration(input: NarrationRequest): Promise<NarrationResponse> {
    if (!input.resolutionPlan) {
      if (!this.apiKey && !this.useLocalProxy) throw new Error("Groq no esta configurado. Falta GROQ_API_KEY o el proxy local.");
    } else {
      const decision = shouldCallGroq(input.resolutionPlan, this.policy, this.budgetState, Boolean(this.apiKey));
      if (!decision.allowed) {
        recordSkippedCall(this.budgetState, input.resolutionPlan, decision.reason);
        this.fallbackUses += 1;
        return buildSafeFallbackNarration(input);
      }
    }

    const cacheKey = this.cacheKey(input);
    const cached = this.responseCache.get(cacheKey);
    if (this.policy.cacheEnabled && cached) {
      this.cacheHits += 1;
      return cached;
    }
    const sessionCached = this.readSessionCache(cacheKey);
    if (this.policy.cacheEnabled && sessionCached) {
      this.cacheHits += 1;
      return sessionCached;
    }
    const pending = this.pendingNarrationRequests.get(cacheKey);
    if (pending) return pending;

    const request = this.generateNarrationUncached(input, cacheKey);
    this.pendingNarrationRequests.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.pendingNarrationRequests.delete(cacheKey);
    }
  }

  private async generateNarrationUncached(input: NarrationRequest, cacheKey: string): Promise<NarrationResponse> {
    const messages: GroqMessage[] = [
      { role: "system", content: buildDungeonMasterSystemPrompt() },
      { role: "user", content: input.resolutionPlan ? buildCompactGroqPrompt(input.resolutionPlan, this.policy.maxPromptChars) : "{}" }
    ];
    const json = await this.callGroq(messages, {}, "groq-chat");
    if (input.resolutionPlan) recordGroqCall(this.budgetState, input.resolutionPlan);
    const parsed = await this.parseValidateOrFallback(json, input);

    if (this.policy.cacheEnabled) {
      this.responseCache.set(cacheKey, parsed.data);
      this.writeSessionCache(cacheKey, parsed.data);
    }
    if (this.responseCache.size > 80) {
      const oldestKey = this.responseCache.keys().next().value;
      if (oldestKey) this.responseCache.delete(oldestKey);
    }
    return parsed.data;
  }

  private async parseValidateOrFallback(raw: string, input: NarrationRequest) {
    const parseAndValidate = (content: string, source: "groq-chat" | "repair-json") => {
      const parsedJson = normalizeGroqNarration(parseGroqJson(content), input);
      const parsed = narrationResponseSchema.safeParse(parsedJson);
      logDmEvent("schema-validation", {
        source,
        ok: parsed.success,
        issues: parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 8)
      });
      return parsed;
    };

    try {
      const parsed = parseAndValidate(raw, "groq-chat");
      if (parsed.success) return parsed;
    } catch (error) {
      logDmEvent("schema-validation", { source: "groq-chat", ok: false, error: error instanceof Error ? error.message : "parse failed" });
    }

    if (this.policy.retryOnInvalidJson) try {
      const repaired = await this.repairNarrationJson(raw, input);
      const parsed = parseAndValidate(repaired, "repair-json");
      if (parsed.success) return parsed;
    } catch (error) {
      logDmEvent("repair-json", { ok: false, error: error instanceof Error ? error.message : "repair failed" });
    }

    const fallback = buildSafeFallbackNarration(input);
    this.fallbackUses += 1;
    logDmEvent("fallback-used", { scene: input.currentScene.title, actor: input.activePlayer.name, action: input.rawAction });
    return { success: true as const, data: fallback };
  }

  async generateFinalRecap(input: FinalRecapRequest): Promise<FinalRecapResponse> {
    if (!this.apiKey && !this.useLocalProxy) throw new Error("Groq no esta configurado. Falta GROQ_API_KEY o el proxy local.");
    const json = await this.callGroq([
      { role: "system", content: "Resume una partida de Tiny Quest como cierre de capitulo de saga oscura. Responde SOLO JSON valido con {\"recap\":\"...\"}. No uses markdown." },
      { role: "user", content: JSON.stringify({ campaign: input.room.campaign.title, players: input.room.players.map((player) => player.name), clues: input.room.mysteryClues, memory: input.room.memorySummary, log: input.room.sessionLog.slice(0, 8) }) }
    ], {}, "final-recap");
    const parsed = JSON.parse(json) as FinalRecapResponse;
    if (typeof parsed.recap !== "string") throw new Error("Groq respondio un recap invalido.");
    return parsed;
  }

  private cacheKey(input: NarrationRequest) {
    if (input.resolutionPlan) return getNarrationCacheKey(input.resolutionPlan);
    const recentLogKey = input.recentSessionLog.map((event) => [
      event.turn,
      event.playerName,
      event.sceneTitle,
      event.action,
      event.outcome,
      event.total
    ].join(":")).join("|");
    return JSON.stringify({
      scene: input.currentScene.id,
      player: input.activePlayer.id,
      action: input.rawAction,
      stat: input.selectedStat,
      total: input.diceResults.total,
      outcome: input.resolvedOutcome,
      danger: input.dangerClock,
      memory: input.memorySummary,
      storyFlags: input.storyFlags,
      clues: input.mysteryCluesFound,
      recentLogKey
    });
  }

  private async repairNarrationJson(raw: string, input: NarrationRequest) {
    return this.callGroq([
      {
        role: "system",
        content: [
          "Repara una respuesta de Dungeon Master de Tiny Quest a JSON valido.",
          "Preserva las mejores imagenes concretas del texto original, pero elimina <think>, markdown y comentarios.",
          "No inventes tiradas, pistas decisivas ni contradigas el estado confirmado.",
          "Responde SOLO JSON valido con el contrato DungeonNarrationOutput exacto: narration, immediateAction, rollPresentation, dialogue, companionMoments, consequence, worldStateChange, dangerChange, clueReveals, uiFocus, memoryPatch, continuityWarnings.",
          "No uses clueReveals si cluePolicy.canRevealNewClue es false. No uses speakerId fuera de ResolutionPlan."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          raw,
          requiredMemory: input.memorySummary,
          scene: input.currentScene.title,
          activePlayer: input.activePlayer.name,
          action: input.rawAction,
          outcome: input.resolvedOutcome,
          consequence: input.consequence?.text ?? "Sin consecuencia grave.",
          resolutionPlan: input.resolutionPlan,
          forbiddenContradictions: input.memorySummary.forbiddenContradictions
        })
      }
    ], { model: "llama-3.3-70b-versatile", forceJson: true }, "repair-json");
  }

  private async callGroq(messages: GroqMessage[], options: { model?: string; forceJson?: boolean } = {}, debugLabel = "chat") {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const model = options.model ?? this.model;
    const isQwen = model === "qwen/qwen3-32b";
    const endpoint = this.useLocalProxy ? "/api/groq/chat" : "https://api.groq.com/openai/v1/chat/completions";
    let body = {
      model,
      messages,
      temperature: isQwen ? 0.62 : 0.68,
      max_tokens: Math.max(220, Math.min(560, Math.ceil(this.policy.maxOutputChars / 4))),
      ...(isQwen ? { reasoning_effort: "none", include_reasoning: false } : {}),
      ...(options.forceJson || !model.startsWith("qwen/") ? { response_format: { type: "json_object" } } : {})
    };
    if (JSON.stringify(body).length > MAX_GROQ_BODY_CHARS) {
      body = { ...body, messages: compactGroqMessages(messages) };
    }
    const debugBase: LlmDebugEntry = { label: debugLabel, at: new Date().toISOString(), endpoint, model, request: { messages, body } };
    writeLlmDebug(debugBase);
    let response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(22000)
    });
    if (response.status === 413) {
      body = { ...body, messages: compactGroqMessages(messages, true), max_tokens: 420 };
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(22000)
      });
    }
    if (!response.ok) {
      const error = response.status === 429 ? "Groq rate limit: espera unos segundos antes del siguiente turno." : `Groq request failed: ${response.status}`;
      writeLlmDebug({ ...debugBase, error });
      throw new Error(error);
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      const error = "Groq response did not include content.";
      writeLlmDebug({ ...debugBase, error });
      throw new Error(error);
    }
    writeLlmDebug({ ...debugBase, response: content });
    return content;
  }

  private readSessionCache(cacheKey: string) {
    if (typeof sessionStorage === "undefined") return undefined;
    try {
      const raw = sessionStorage.getItem(`tiny-quest:dm:${cacheKey}`);
      if (!raw) return undefined;
      const parsed = narrationResponseSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  private writeSessionCache(cacheKey: string, value: NarrationResponse) {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem(`tiny-quest:dm:${cacheKey}`, JSON.stringify(value));
    } catch {
      // Ignore storage pressure; in-memory cache still works.
    }
  }
}

function parseGroqJson(content: string) {
  const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  try {
    return JSON.parse(withoutThinking);
  } catch {
    const start = withoutThinking.indexOf("{");
    const end = withoutThinking.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(withoutThinking.slice(start, end + 1));
    throw new Error("Groq respondio texto sin JSON valido.");
  }
}

function normalizeGroqNarration(value: unknown, input: NarrationRequest) {
  const data = typeof value === "object" && value !== null ? { ...(value as Record<string, unknown>) } : {};
  if (input.resolutionPlan) {
    const structured = parseDungeonNarrationOutput(data.structuredNarration ?? data, input.resolutionPlan);
    const legacy = toLegacyNarrationFields(structured);
    data.structuredNarration = structured;
    data.narration = legacy.narration;
    data.npcDialogue = legacy.npcDialogue;
    data.consequence = legacy.consequence;
  }
  const sections = typeof data.sections === "object" && data.sections !== null ? data.sections as Record<string, unknown> : undefined;
  const target = input.narrativeContract?.target ?? input.currentScene.title;
  const factual = input.narrativeContract?.factualSummary ?? `${input.activePlayer.name} resuelve ${input.rawAction}.`;
  const visible = input.narrativeContract?.visibleConsequence ?? input.consequence?.text ?? "La decisión deja una consecuencia visible.";
  const fallbackNarration = `${input.activePlayer.name} se concentra en ${target}. ${factual}`;
  const fallbackDialogue = input.narrativeContract?.campaignActionType?.includes("npc") || input.narrativeContract?.campaignActionType === "interrogar_npc"
    ? `${target}: "Decilo rápido. Afuera ya están escuchando."`
    : "La presión alrededor del grupo sube, pero nadie agrega una verdad nueva.";
  const fallbackOptions = input.visibleOptions?.map((option) => option.label).filter(Boolean).slice(0, 3) ?? [];

  if (typeof data.narration !== "string") data.narration = typeof sections?.narration === "string" ? sections.narration : fallbackNarration;
  if (!Array.isArray(data.npcDialogue)) data.npcDialogue = typeof sections?.dialogue === "string" ? [sections.dialogue] : [fallbackDialogue];
  data.npcDialogue = (data.npcDialogue as unknown[]).filter((line) => typeof line === "string").slice(0, 2);
  if ((data.npcDialogue as unknown[]).length < 1) data.npcDialogue = [fallbackDialogue];

  if (!Array.isArray(data.nextOptions)) data.nextOptions = Array.isArray(sections?.options) ? sections.options : fallbackOptions;
  if (Array.isArray(data.nextOptionsText)) data.nextOptions = data.nextOptionsText;
  data.nextOptions = (data.nextOptions as unknown[]).filter((option) => typeof option === "string").slice(0, 3);
  if ((data.nextOptions as unknown[]).length < 2) data.nextOptions = fallbackOptions.length >= 2 ? fallbackOptions : ["Ganar tiempo", "Proteger la prueba", "Pedir ayuda"];

  const normalizedSections: { narration: string; dialogue: string; consequence: string; options: string[] } = {
    narration: typeof sections?.narration === "string" && sections.narration.length > 8 ? sections.narration : data.narration as string,
    dialogue: typeof sections?.dialogue === "string" && sections.dialogue.length > 2 ? sections.dialogue : (data.npcDialogue as string[]).join(" "),
    consequence: typeof sections?.consequence === "string" && sections.consequence.length > 4 ? sections.consequence : typeof data.consequence === "string" ? data.consequence : visible,
    options: Array.isArray(sections?.options) ? sections.options.filter((option): option is string => typeof option === "string").slice(0, 3) : data.nextOptions as string[]
  };
  if (normalizedSections.options.length < 2) normalizedSections.options = data.nextOptions as string[];
  data.sections = normalizedSections;

  if (typeof data.consequence !== "string") data.consequence = normalizedSections.consequence;
  if (typeof data.statePatch !== "object" || data.statePatch === null) data.statePatch = {};
  const patch = data.statePatch as Record<string, unknown>;

  const beat = typeof data.plotBeat === "object" && data.plotBeat !== null ? data.plotBeat as Record<string, unknown> : {};
  data.plotBeat = {
    title: typeof beat.title === "string" ? beat.title : `Capitulo: ${input.currentScene.title}`,
    hook: typeof beat.hook === "string" ? beat.hook : input.currentScene.objective,
    twist: typeof beat.twist === "string" ? beat.twist : input.memorySummary.currentTwist,
    characterFocus: typeof beat.characterFocus === "string" ? beat.characterFocus : input.activePlayer.name,
    threat: typeof beat.threat === "string" ? beat.threat : input.currentScene.danger,
    continuity: typeof beat.continuity === "string" ? beat.continuity : input.memorySummary.lastBeat
  };

  if (typeof data.memoryUpdate !== "object" || data.memoryUpdate === null) data.memoryUpdate = {};
  const memory = data.memoryUpdate as Record<string, unknown>;
  data.memoryUpdate = {
    summary: typeof memory.summary === "string" ? memory.summary : normalizedSections.consequence,
    facts: stringList(memory.facts, stringList(patch.factsAdded, [])),
    clues: stringList(memory.clues, stringList(patch.cluesAdded, [])),
    objects: stringList(memory.objects, []),
    npcs: stringList(memory.npcs, []),
    locations: stringList(memory.locations, []),
    dangers: stringList(memory.dangers, []),
    forbiddenContradictions: stringList(memory.forbiddenContradictions, []),
    confirmedFacts: stringList(memory.confirmedFacts, stringList(patch.factsAdded, [])),
    suspicions: stringList(memory.suspicions, []),
    damagedClues: stringList(memory.damagedClues, stringList(patch.cluesDamaged, [])),
    npcStates: stringList(memory.npcStates, stringList(patch.npcUpdates, [])),
    objectStates: stringList(memory.objectStates, stringList(patch.objectUpdates, [])),
    openQuestions: stringList(memory.openQuestions, [])
  };

  data.stateSuggestions = Array.isArray(data.stateSuggestions) ? data.stateSuggestions.filter(isValidStateSuggestion) : [];
  if (data.pacingHint !== "next_scene" && data.pacingHint !== "finale") data.pacingHint = "continue";
  return data;
}

function buildSafeFallbackNarration(input: NarrationRequest): NarrationResponse {
  const structuredFallback = input.resolutionPlan ? buildFallbackNarrationOutput(input.resolutionPlan) : undefined;
  const options = input.visibleOptions?.map((option) => option.label).filter(Boolean).slice(0, 3);
  const nextOptions = options && options.length >= 2 ? options : ["Revisar la última pista", "Hablar con un testigo", "Proteger la evidencia"];
  return {
    narration: structuredFallback?.narration ?? "El momento queda en tensión. La escena no avanza del todo, pero la pista principal sigue disponible.",
    npcDialogue: structuredFallback ? toLegacyNarrationFields(structuredFallback).npcDialogue : [],
    consequence: structuredFallback?.consequence.summary ?? "No se agregó nueva información por un error de narración.",
    nextOptions,
    plotBeat: {
      title: "Tensión sin Resolver",
      hook: "La escena espera una decisión clara.",
      twist: "",
      characterFocus: input.activePlayer.name,
      threat: "El peligro social aumenta si el grupo duda demasiado.",
      continuity: "Se conserva el estado anterior sin contradicciones."
    },
    sections: {
      narration: structuredFallback?.narration ?? "El momento queda en tensión. La escena no avanza del todo, pero la pista principal sigue disponible.",
      dialogue: "",
      consequence: structuredFallback?.consequence.summary ?? "No se agregó nueva información por un error de narración.",
      options: nextOptions
    },
    memoryUpdate: {
      summary: "No se agregó nueva información por un error de narración.",
      facts: [],
      clues: [],
      objects: [],
      npcs: [],
      locations: [],
      dangers: [],
      forbiddenContradictions: [],
      confirmedFacts: [],
      suspicions: [],
      damagedClues: [],
      npcStates: [],
      objectStates: [],
      openQuestions: []
    },
    stateSuggestions: [],
    pacingHint: "continue",
    structuredNarration: structuredFallback
  };
}

function stringList(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 8) : fallback;
}

function isValidStateSuggestion(value: unknown) {
  if (typeof value !== "object" || value === null) return false;
  const suggestion = value as Record<string, unknown>;
  if (suggestion.type === "addTemporaryItem" || suggestion.type === "removeTemporaryItem") return typeof suggestion.item === "string";
  if (suggestion.type === "introduceNPC") return typeof suggestion.npcName === "string";
  if (suggestion.type === "increaseSceneProgress" || suggestion.type === "adjustDangerClock") return typeof suggestion.amount === "number";
  if (suggestion.type === "revealClueId") return typeof suggestion.clueId === "string";
  return suggestion.type === "markObjectiveCompleted";
}
