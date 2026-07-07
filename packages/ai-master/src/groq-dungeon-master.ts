import type { DungeonMasterProvider, FinalRecapRequest, FinalRecapResponse, ImprovisedStoryContent, ImprovisedStoryRequest, NarrationRequest, NarrationResponse, OpeningSceneRequest, OpeningSceneResponse } from "@tiny-quest/game-engine";
import { buildNarrativeIngredientBundle } from "@tiny-quest/game-engine";
import { storyCoherenceIssues } from "./story-coherence";
import { improvisedStorySchema, narrationResponseSchema } from "./schemas";
import { repairLooseJson } from "./json-repair";
import { buildDungeonMasterSystemPrompt } from "./prompt-builder";
import { buildFallbackNarrationOutput, parseDungeonNarrationOutput, toLegacyNarrationFields } from "./narration-contract";
import { buildCompactGroqPrompt, createLlmBudgetState, DEFAULT_CHEAP_LLM_POLICY, getNarrationCacheKey, recordGroqCall, recordSkippedCall, shouldCallGroq, type LlmBudgetPolicy, type LlmBudgetState } from "./llm-budget";

type GroqEnv = {
  GROQ_API_KEY?: string;
  VITE_GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  VITE_GROQ_MODEL?: string;
  GEMINI_API_KEY?: string;
  VITE_GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  VITE_GEMINI_MODEL?: string;
  provider?: string;
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
  private readonly isGemini: boolean;
  // Groq credentials kept even when Gemini is the primary provider: the free tier of
  // Gemini returns 429/503 under load, and falling straight to the local template makes
  // the narration flat. Groq is the second line before the deterministic fallback.
  private readonly failoverGroqKey?: string;
  private readonly failoverGroqModel: string;
  private readonly policy: LlmBudgetPolicy;
  private readonly budgetState: LlmBudgetState;
  private cacheHits = 0;
  private fallbackUses = 0;
  private readonly responseCache = new Map<string, NarrationResponse>();
  private readonly pendingNarrationRequests = new Map<string, Promise<NarrationResponse>>();

  constructor(env: GroqEnv = {}) {
    // Gemini is selected explicitly (provider=gemini) or implicitly when a Gemini key is present.
    this.isGemini = env.provider === "gemini" || Boolean(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY);
    if (this.isGemini) {
      this.apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
      this.model = env.GEMINI_MODEL || env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
    } else {
      this.apiKey = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY;
      this.model = env.GROQ_MODEL || env.VITE_GROQ_MODEL || "openai/gpt-oss-120b";
    }
    this.failoverGroqKey = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY;
    this.failoverGroqModel = env.GROQ_MODEL || env.VITE_GROQ_MODEL || "openai/gpt-oss-120b";
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
      const decision = shouldCallGroq(input.resolutionPlan, this.policy, this.budgetState, Boolean(this.apiKey) || this.useLocalProxy);
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
    const bundle = input.resolutionPlan ? buildNarrativeIngredientBundle(input, input.resolutionPlan) : undefined;
    const messages: GroqMessage[] = [
      { role: "system", content: buildDungeonMasterSystemPrompt(input.selectedCampaign?.narratorVoice) },
      { role: "user", content: input.resolutionPlan ? buildCompactGroqPrompt(input.resolutionPlan, this.policy.maxPromptChars, input, bundle) : "{}" }
    ];
    const json = await this.callGroqWithFailover(messages, { route: "cheap" }, "groq-chat");
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
    ], { model: this.isGemini ? "gemini-2.5-flash" : "llama-3.3-70b-versatile", forceJson: true }, "repair-json");
  }

  private async callGroqWithFailover(messages: GroqMessage[], options: { forceJson?: boolean; maxTokens?: number; route?: "cheap" | "primary" } = {}, debugLabel = "chat") {
    // Ruteo por valor de la cuota: el free tier de Gemini rinde ~20 requests por DÍA,
    // así que se reserva para las llamadas que definen la experiencia (forja de
    // historia, apertura, recap). Las llamadas "cheap" (narración turno a turno,
    // ~16 por partida) van por Groq (miles/día) con Gemini solo de reserva puntual.
    const preferCheap = options.route === "cheap" && this.isGemini && (this.failoverGroqKey || this.useLocalProxy);
    if (preferCheap) {
      try {
        return await this.callGroq(messages, { ...options, forceProvider: "groq" }, `${debugLabel}-cheap`);
      } catch (error) {
        logDmEvent("provider-failover", { from: this.failoverGroqModel, to: this.model, cause: error instanceof Error ? error.message : "unknown" });
        return this.callGroq(messages, options, debugLabel);
      }
    }
    try {
      return await this.callGroq(messages, options, debugLabel);
    } catch (error) {
      // Gemini free tier drops calls (429/503) under load; retry once against Groq
      // before surrendering the turn to the deterministic template.
      const canFailover = this.isGemini && (this.failoverGroqKey || this.useLocalProxy);
      if (!canFailover) throw error;
      logDmEvent("provider-failover", { from: this.model, to: this.failoverGroqModel, cause: error instanceof Error ? error.message : "unknown" });
      return this.callGroq(messages, { ...options, forceProvider: "groq" }, `${debugLabel}-failover`);
    }
  }

  async generateOpeningScene(input: OpeningSceneRequest): Promise<OpeningSceneResponse> {
    const system = [
      "Sos el narrador de Tiny Quest, una aventura de misterio en español rioplatense neutro.",
      input.narratorVoice ? `Voz del narrador: ${JSON.stringify(input.narratorVoice)}.` : "",
      "Escribí la ESCENA DE APERTURA de la historia como el primer capítulo de una novela: tiempo presente, sensorial, concreta, con los héroes ya dentro de la escena.",
      "Prohibido el meta-lenguaje: nada de 'campaña', 'jugador', 'opciones', 'misión', 'objetivo', 'dados'.",
      "Usá SOLO los NPC listados (no inventes nombres) y solo su información pública.",
      "Cerrá con la tensión apuntando a la primera decisión, sin enumerar acciones posibles.",
      'Respondé SOLO JSON válido: {"narration":"2 párrafos, 90-160 palabras","dialogue":"una línea dicha por un NPC listado, formato Nombre: \\"...\\""}'
    ].filter(Boolean).join(" ");
    const payload = {
      historia: input.campaignTitle,
      premisa: input.premise,
      gancho: input.storyHook,
      enJuego: input.stakes?.slice(0, 2),
      escena: input.scene,
      npcs: input.npcs.slice(0, 4),
      heroes: input.playerNames.slice(0, 4),
      puntoDeEntrada: input.perspectiveEntry,
      primerasDecisiones: input.optionLabels.slice(0, 4)
    };
    const json = await this.callGroqWithFailover([
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) }
    ], { forceJson: true }, "opening-scene");
    const parsed = parseGroqJson(json) as { narration?: unknown; dialogue?: unknown };
    if (typeof parsed.narration !== "string" || parsed.narration.trim().length < 60) throw new Error("El narrador no produjo una apertura utilizable.");
    return {
      narration: parsed.narration.trim(),
      dialogue: typeof parsed.dialogue === "string" && parsed.dialogue.trim() ? parsed.dialogue.trim() : undefined
    };
  }

  async generateImprovisedStory(input: ImprovisedStoryRequest): Promise<ImprovisedStoryContent> {
    const world = input.worldContext;
    const wish = input.userPrompt?.trim() ?? "";
    const system = [
      "Sos el arquitecto de historias de Tiny Quest, un juego de misterio narrativo en español.",
      "Diseñá una historia jugable de 4 escenas con un culpable oculto.",
      ...(world ? [
        `La historia ocurre en ${world.worldName} (${world.era}). Ambiente sellado: ${world.ambience}`,
        `REGLAS INMUTABLES del mundo — respetalas en premisa, pistas y giro, pero NO las enuncies de golpe: el grupo las descubre jugando: ${world.rules.join(" · ")}`,
        `Tono y elementos de este mundo: ${world.seasoning}`,
        `Punto de entrada de los héroes (perspectiva ${world.perspective}): ${world.entryLine} La escena 1 arranca exactamente ahí.`
      ] : []),
      // El pedido del equipo manda: el mundo es el escenario, no una excusa para ignorarlo.
      ...(wish ? [
        `PEDIDO ESPECIAL DEL EQUIPO — OBLIGATORIO, tiene prioridad sobre el tono por defecto del mundo: "${wish}".`,
        "Integrá CADA elemento del pedido de forma central y visible (criaturas, tono, cantidad de NPCs, traiciones, lo que pidan): tienen que notarse en la premisa, los NPCs y las escenas, no de decorado.",
        "Si un elemento del pedido tensa el ambiente, adaptalo al mundo sin descartarlo (ej: una estirpe o facción propia de este mundo que encarne lo pedido). Las reglas inmutables son el único límite."
      ] : ["No hay pedido especial: diseñá la historia central del mundo y sorprendé al equipo."]),
      "Reglas de diseño: la premisa plantea una injusticia o misterio con reloj (algo malo pasa si el grupo no actúa);",
      "hiddenTruth contradice la explicación visible; cada pista acerca al culpable sin nombrarlo directo;",
      "los NPC tienen secreto propio (uno protege al culpable o ES parte del engaño); la escena 4 es el clímax donde se decide el final.",
      "keyObject y escapeRoute de cada escena son cosas FÍSICAS y concretas de ese lugar (van en botones de acción, cortos).",
      "Tono: fantasía oscura apta para todo público.",
      "NOMBRES con peso de saga épica (El Señor de los Anillos, Canción de Hielo y Fuego, The Witcher): lugares con historia en el nombre, personas con epíteto o linaje, casas o estirpes con apellido propio. PROHIBIDO lo genérico ('el Sabio', 'la Guardiana', 'el Herrero') y PROHIBIDO copiar ejemplos de otros mundos: inventá nombres originales que puedan abrir un capítulo de libro.",
      "PROHIBIDO que un NPC use el nombre o apellido del héroe, SALVO que bond lo explique explícitamente ('tu hermano menor', 'prima de tu madre'). El conflicto DEBE atarse a la identidad del héroe (heroe del payload: linaje, oficio, compañero, concepto) — escribí heroBond: 1 frase que explique por qué ESTE héroe no puede irse (su juramento, su oficio, su compañero o su sello lo atan). Sus strengths deben poder brillar en al menos una escena y su weakness complicarlo en otra: diseñá objetivos y rutas que las toquen.",
      "La acusación o conflicto necesita EVIDENCIA inicial concreta (evidence: 2-3 pruebas físicas, pueden ser falsas o plantadas: 'el mapa apareció doblado en tu capa'). Sin evidencia la acusación se siente arbitraria; con evidencia se siente misterio.",
      "CADA idea del pedido debe convertirse en una FUNCIÓN JUGABLE (personaje, pista, amenaza, objeto, lugar, vínculo emocional, giro, consecuencia o ventaja mecánica) — nunca decoración estética. Si piden 'un perro llamado Firulais', el perro es aliado emocional Y pista móvil Y posible riesgo, no un cameo. En keywordsUsed.how nombrá la función ('Firulais → pista móvil: fue el único que olió al culpable').",
      "hiddenTwists = 3 giros SECRETOS que REINTERPRETAN la evidencia inicial sin contradecirla (la prueba plantada tiene segunda lectura, el testigo vio otra cosa, el objeto robado eligió aparecer). Son capa de motor: JAMÁS los insinúes en premise, summary ni descripciones visibles.",
      "npcRelations = 2-3 relaciones SECRETAS entre NPCs (entre ellos, NUNCA con el héroe) que reinterpretan sus bonds públicos: una deuda, un amor viejo, un chantaje, una lealtad cruzada ('Marga encubre a Bren desde el incendio'). from/to = nombres EXACTOS de tus npcs. También son capa de motor: jamás visibles al crear.",
      "PISTAS FALSAS: EXACTAMENTE UNA de las 3 clues lleva isFalse:true — es una pista PLANTADA (por la amenaza o por un NPC que miente) que apunta en la dirección equivocada. Debe ser tan creíble como las verdaderas pero contener UN detalle verificable que no cierra (una hora imposible, una mano equivocada, un olor que no corresponde) para poder desmentirla jugando. Las otras dos son verdaderas. Capa de motor: jamás se marca cuál es.",
      "Si el pedido incluye una duración ('3 meses', 'un año'), es ESCALA DE CAMPAÑA: las 4 escenas son saltos temporales con marca en el título ('Semana 2 — el rastro', 'Mes 3 — el juicio'), pero summary.timeLimit es el reloj CORTO de la primera escena ('antes del próximo anochecer'), NUNCA la duración total.",
      "ENTIDADES SEPARADAS: el compañero del héroe (petName del payload) es SUYO y ya existe — jamás lo fusiones con mascotas o personajes del pedido. Si piden 'perro Firulais' y el héroe tiene 'Alma Dracónica', existen LOS DOS por separado, cada uno con su nombre y su rol — y el bond de un NPC JAMÁS puede decir que ese NPC es el compañero del héroe ni nombrarlo. Respetá TODOS los nombres propios del pedido letra por letra. Si el pedido incluye una mascota o criatura con nombre ('perro Firulais'), DEBE ser pieza jugable de la historia: agregala como NPC propio (appearance de animal, bond 'tu perro') Y hacela aparecer en la premise y en al menos una escena o pista — mencionarla al pasar NO cuenta.",
      "Si el pedido incluye una identidad para el héroe ('elfo oscuro', 'vampiro'), aplicásela AL HÉROE: su linaje, su condición social o el prejuicio del mundo contra él forman parte del conflicto — no la conviertas en un NPC suelto.",
      "AUTO-REVISIÓN antes de responder: ¿los nombres propios del pedido están intactos? ¿ninguna entidad quedó fusionada? ¿el reloj inicial no contradice la duración pedida? ¿el héroe quedó atado al conflicto (heroBond)? ¿las 3 primeras acciones permiten investigar la evidencia, confrontar a un NPC y usar un rasgo propio del héroe? Corregí lo que falle ANTES de responder.",
      "summary = card jugable en segunda persona: objective (TU misión, imperativa y personal, MÁXIMO 20 palabras, frase COMPLETA), risk (qué PERDÉS si fallás — cosas con nombre: tu linaje, tu perro, un juramento; máximo 20 palabras), firstMystery (la primera pregunta que pica), timeLimit (el reloj: 'antes del anochecer', corto). keywordsUsed = por CADA idea del pedido, cómo se usó y con qué función.",
      "PROHIBIDO el tono de sinopsis genérica: nada de 'la única forma de limpiar tu nombre', 'antes de que sea demasiado tarde', 'nada es lo que parece', 'una carrera contra el tiempo'. Escribí como novelista: premise de MÁXIMO 3 frases con al menos UN detalle sensorial concreto (un olor, un objeto en una mano, un gesto) y UNA imagen memorable. Todo texto visible debe poder leerse en voz alta sin vergüenza.",
      'Respondé SOLO JSON válido, sin markdown, con esta forma exacta: {"title","genre","premise","storyHook","hiddenTruth","themeSkill","twist","stakes":["..."],"threat":{"name","description","specialMove"},"scenes":[4 x {"title","objective","keyObject","escapeRoute"}],"npcs":[2-3 x {"name","role","description","motive","secret","desire","fear","appearance","bond","whyMightLie"}],"clues":[3 x {"title","text","sceneIndex":1-4,"isFalse":bool}],"summary":{"objective","risk","firstMystery","timeLimit"},"keywordsUsed":[{"idea","how"}],"heroBond","evidence":["..."],"hiddenTwists":["3 giros secretos"],"npcRelations":[2-3 x {"from","to","nature"}]}. appearance = cómo se VE el personaje en 1 frase dibujable que SIEMPRE dice: especie o etnia (humana de piel oscura, elfo pálido, vampiro, mestizo animal, lo que sea), género, edad aparente (niño, adulta, anciano), rasgos de cara/cuerpo, ropa y una marca distintiva. Variá MUCHO los cuerpos entre personajes: niños, ancianas, pieles oscuras y claras, criaturas — el elenco no puede ser todo adultos iguales. bond = relación dramática con el héroe en 3-8 palabras ("padre de la víctima · quiere sangre"). whyMightLie = por qué podría mentirte, SIN revelar su secreto real.'
    ].join(" ");
    const messages: GroqMessage[] = [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ pedidoDelEquipo: input.userPrompt.slice(0, 600), heroes: input.playerNames?.slice(0, 4), heroe: input.hero }) }
    ];
    // El LLM a veces devuelve JSON malformado o truncado por límite de tokens:
    // se intenta crudo → reparado, y si nada sirve se pide la historia de nuevo una vez.
    // (la revisión de coherencia corre después de cada intento; ver storyCoherenceIssues)
    const attempt = async (): Promise<ImprovisedStoryContent | null> => {
      // Los bloques nuevos (summary/keywords/evidence/bonds) piden más espacio de salida.
      const json = await this.callGroqWithFailover(messages, { forceJson: true, maxTokens: 3400 }, "story-forge");
      for (const candidate of [json, repairLooseJson(json)]) {
        try {
          const parsed = improvisedStorySchema.safeParse(parseGroqJson(candidate));
          if (parsed.success) return parsed.data;
          logDmEvent("story-forge", { ok: false, issues: parsed.error.issues.map((issue) => issue.path.join(".")).slice(0, 8) });
        } catch (error) {
          logDmEvent("story-forge", { ok: false, parseError: error instanceof Error ? error.message.slice(0, 120) : "parse failed" });
        }
      }
      return null;
    };
    // Revisión de coherencia post-generación: si la primera salida rompe nombres,
    // fusiona entidades o confunde el reloj, se regenera una vez y gana la salida
    // con menos problemas (regenerar "solo una parte" no es posible sin otra llamada).
    const first = await attempt();
    const firstIssues = first ? storyCoherenceIssues(first, input) : ["no-parse"];
    let story = first;
    if (!first || firstIssues.length > 0) {
      if (first) logDmEvent("story-forge", { ok: false, coherence: firstIssues });
      const second = await attempt();
      if (second) {
        const secondIssues = storyCoherenceIssues(second, input);
        story = !first || secondIssues.length < firstIssues.length ? second : first;
        if (secondIssues.length > 0) logDmEvent("story-forge", { ok: false, coherenceRetry: secondIssues });
      }
    }
    if (!story) {
      throw new Error("El narrador se trabó escribiendo la historia. Tocá Reintentar — suele salir a la segunda.");
    }
    logDmEvent("story-forge", { ok: true, title: story.title, scenes: story.scenes.length, npcs: story.npcs.length });
    return story;
  }

  private async callGroq(messages: GroqMessage[], options: { model?: string; forceJson?: boolean; forceProvider?: "groq"; maxTokens?: number } = {}, debugLabel = "chat") {
    const useGemini = this.isGemini && options.forceProvider !== "groq";
    const apiKey = options.forceProvider === "groq" ? this.failoverGroqKey : this.apiKey;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const model = options.model ?? (options.forceProvider === "groq" ? this.failoverGroqModel : this.model);
    const isQwen = model.startsWith("qwen/");
    const isGptOss = model.startsWith("openai/gpt-oss");
    const directUrl = useGemini
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://api.groq.com/openai/v1/chat/completions";
    const endpoint = this.useLocalProxy ? (useGemini ? "/api/gemini/chat" : "/api/groq/chat") : directUrl;
    let body = {
      model,
      messages,
      temperature: isQwen ? 0.72 : 0.80,
      max_tokens: options.maxTokens ?? Math.max(640, Math.min(1200, Math.ceil(this.policy.maxOutputChars / 3))),
      ...(isQwen ? { reasoning_effort: "none", include_reasoning: false } : {}),
      ...(isGptOss ? { reasoning_effort: "low" } : {}),
      // gemini-2.5-flash "piensa" por defecto y gasta el presupuesto de tokens antes de
      // emitir el JSON, truncándolo → el parse falla → fallback en cada turno. Sin thinking
      // la narración completa entra en el budget.
      ...(useGemini ? { reasoning_effort: "none" } : {}),
      ...(options.forceJson || !isQwen ? { response_format: { type: "json_object" } } : {})
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
      const provider = useGemini ? "Gemini" : "Groq";
      const error = response.status === 429 ? `${provider} rate limit: espera unos segundos antes del siguiente turno.` : `${provider} request failed: ${response.status}`;
      writeLlmDebug({ ...debugBase, error });
      throw new Error(error);
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      const error = `${useGemini ? "Gemini" : "Groq"} response did not include content.`;
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
    // Surface enrichedOptions for App.tsx to use as choice labels
    if (structured.enrichedOptions?.length) {
      data.enrichedOptions = structured.enrichedOptions;
    }
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
