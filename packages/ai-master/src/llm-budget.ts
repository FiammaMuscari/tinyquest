import type { GameRoom, NarrationRequest, NarrativeIngredientBundle, ResolutionPlan } from "@tiny-quest/game-engine";

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
  maxCallsPerRun: 18,
  maxCallsPerScene: 6,
  maxPromptChars: 4200,
  maxOutputChars: 2400,
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

export function buildCompactGroqPrompt(plan: ResolutionPlan, maxChars = DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, input?: NarrationRequest, bundle?: NarrativeIngredientBundle) {
  // Recent LLM narration paragraphs — the story so far, LLM must continue from here
  const storyLast = (input?.recentSessionLog ?? [])
    .slice(0, 2)
    .map((e) => e.narration ?? "")
    .filter((n) => n.length > 20)
    .map((n) => short(n, 300) ?? n);

  // "La novela hasta ahora": memoria ACUMULADA de toda la sesión (llega en el request
  // pero antes se ignoraba). storyLast son las 2 últimas escenas al detalle; esto es el
  // hilo largo — hechos ya establecidos, hilos abiertos y stakes — para que el narrador
  // recuerde capítulos anteriores y no reinvente ni contradiga lo ya jugado.
  const mem = input?.memorySummary;
  const established = mem ? [...(mem.confirmedFacts ?? []), ...(mem.facts ?? [])] : [];
  const openThreads = mem ? [...(mem.unresolvedThreads ?? []), ...(mem.openQuestions ?? [])] : [];
  const storySoFar = mem
    ? {
      ...(mem.lastBeat ? { lastBeat: short(mem.lastBeat, 200) } : {}),
      ...(established.length ? { established: [...new Set(established)].slice(0, 6).map((f) => short(f, 120) ?? f) } : {}),
      ...(openThreads.length ? { openThreads: [...new Set(openThreads)].slice(0, 4).map((t) => short(t, 110) ?? t) } : {}),
      ...(mem.stakes?.length ? { stakes: mem.stakes.slice(0, 2).map((s) => short(s, 110) ?? s) } : {}),
      ...(mem.currentTwist ? { twist: short(mem.currentTwist, 140) } : {})
    }
    : undefined;
  const hasStorySoFar = Boolean(storySoFar && Object.keys(storySoFar).length > 0);

  // RAG semántico: recuerdos recuperados por SIMILITUD con la acción/objetivo de ESTE
  // turno. Llegan en narrativeContext (App.tsx los computa con el índice de embeddings)
  // pero hasta ahora se descartaban antes del prompt que realmente viaja. A diferencia de
  // storySoFar (resumen lineal de la sesión), esto trae detalles relevantes de CUALQUIER
  // turno pasado — el punto de los embeddings: recuerdo no-lineal que reaparece a tiempo.
  // truthStatus se marca para que el narrador no venda un rumor/error como hecho.
  const retrievedMemories = input?.narrativeContext?.retrievedMemories ?? [];
  const recall = retrievedMemories
    .slice(0, 4)
    .map((r) => {
      const line = short(r.memory.summaryLine, 130);
      if (!line) return undefined;
      const status = r.memory.truthStatus;
      return status && status !== "confirmed" ? `${line} [${status}]` : line;
    })
    .filter((l): l is string => Boolean(l));
  const hasRecall = recall.length > 0;
  // Perfil moral acumulado del héroe (también llega en narrativeContext y se ignoraba):
  // tiñe el tono y cómo el mundo reacciona a él, sin declararse explícito.
  const moralProfile = short(input?.narrativeContext?.moralProfileSummary, 200);

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
  // stakeHint = possibleOutcomeHint de la opción (lo que está EN JUEGO al elegirla,
  // autorado por la campaña). No es un spoiler del misterio: es el tipo de consecuencia
  // que la etiqueta debe insinuar para que el jugador elija con criterio, sin declarar
  // el resultado como hecho ni nombrar el final concreto.
  const optionsToLabel = (input?.visibleOptions ?? []).slice(0, 5).map((o) => {
    const target = resolveOptionTarget(o);
    return {
      id: o.id,
      mechanic: o.label,
      ...(target ? { target: target.name } : {}),
      ...(target?.state ? { targetState: target.state } : {}),
      ...(o.intent ? { intent: o.intent } : {}),
      ...(o.riskLevel ? { risk: o.riskLevel } : {}),
      ...(o.possibleOutcomeHint ? { stakeHint: short(o.possibleOutcomeHint, 120) } : {})
    };
  });
  const hasStakeHints = optionsToLabel.some((o) => "stakeHint" in o);

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

  // Talento del héroe: el narrador debe saber su don (para colorear el tono) y, si
  // este turno se activó la habilidad 1/escena, tejer ese momento como un golpe de gracia.
  const talentName = plan.actorKind === "player" ? input?.talent?.name : undefined;
  const talentMoment = plan.actorKind === "player" ? short(input?.talent?.activeMoment, 160) : undefined;

  // Relojes de historia (engine `clocks.ts`): presión CON NOMBRE. A diferencia de
  // dangerClock (un número plano), acá el narrador sabe QUÉ se acerca y a qué distancia,
  // así puede dosificar la tensión. Los ocultos vienen marcados: se insinúan, no se nombran.
  const clockPressure = (input?.clocks?.pressure ?? []).slice(0, 4);
  const clocksFired = (input?.clocks?.firedNow ?? []).map((line) => short(line, 140)).filter((l): l is string => Boolean(l));
  const hasClocks = clockPressure.length > 0;

  const payload = {
    story: storyLast,
    ...(hasStorySoFar ? { storySoFar } : {}),
    ...(hasRecall ? { recall } : {}),
    ...(moralProfile ? { moralProfile } : {}),
    turn: {
      actor: plan.actorName,
      kind: plan.actorKind,
      ...(actorSkill ? { actorSkill } : {}),
      action: plan.actionText,
      ...(talentName ? { talent: talentName } : {}),
      ...(talentMoment ? { talentMoment } : {}),
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
    ...(hasClocks ? { clocks: clockPressure } : {}),
    ...(clocksFired.length ? { clocksFired } : {}),
    bots: bots.length ? bots : undefined,
    noRepeat: noRepeat.length ? noRepeat : undefined,
    optionsToLabel: optionsToLabel.length ? optionsToLabel : undefined,
    rules: [
      "narration: 3-4 párrafos, entre 160 y 240 palabras, prosa literaria de novela (nunca resumen de partida). Cada párrafo avanza un hecho: acción, reacción y consecuencia. Incluí un detalle sensorial NUEVO y dejá al menos un hilo abierto; no repitas el resumen, la acción ni imágenes de turnos anteriores. Nunca cierres la historia ni la escena en un solo turno.",
      ...(hasStorySoFar
        ? ["storySoFar = la novela hasta ahora: lastBeat es dónde quedó la escena; established son hechos YA confirmados (jamás los contradigas ni los redescubras como nuevos); openThreads son hilos sin cerrar que la historia debe seguir tejiendo; stakes es lo que está en juego; twist el giro vigente. Escribí este turno como el PRÓXIMO CAPÍTULO que continúa ese hilo: mantené tono, nombres, vínculos y consecuencias previas, y hacé avanzar al menos un openThread."]
        : []),
      ...(hasRecall
        ? ["recall = recuerdos que la historia YA estableció y que, por similitud con lo que hacés este turno, vuelven a pesar ahora. Tejelos como continuidad viva: un personaje que recuerda una promesa, un objeto que reaparece, una deuda que vuelve — no los repitas textualmente ni los redescubras como nuevos. Los marcados [suspected] son sospechas SIN confirmar; [contradicted] y [forbidden] NO son verdad: tratalos como rumor o error, nunca como hecho narrado."]
        : []),
      ...(moralProfile
        ? ["moralProfile = quién viene siendo el héroe según sus decisiones acumuladas: dejá que tiña el tono y cómo los NPCs y el mundo reaccionan ante él (confianza, miedo, respeto, recelo), sin declararlo nunca de forma explícita."]
        : []),
      ...(hasClocks
        ? ["clocks = relojes de presión que YA movió el motor (formato 'nombre (tipo) llenos/total'). Cuanto más lleno, más cerca está eso de ocurrir: dosificá la tensión con esa distancia — a 1/8 es un rumor de fondo, a 6/8 se siente en la nuca. Los marcados [oculto] JAMÁS se nombran ni se explican: solo se insinúan (un ruido que no encaja, una puerta que antes estaba abierta). PROHIBIDO mencionar números, segmentos o la palabra 'reloj': la presión se narra, no se reporta."]
        : []),
      ...(clocksFired.length
        ? ["clocksFired = pagos que se CUMPLIERON en este turno: son hechos consumados, no amenazas. Narralos como algo que YA pasó y que cambia el tablero, integrado en la consecuencia del turno — no los anuncies como aviso ni los pospongas."]
        : []),
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
      ...(talentMoment
        ? ["turn.talentMoment = el héroe ACTIVÓ su talento este turno (habilidad 1/escena): narralo como un golpe de gracia visible y decisivo, coherente con el resultado del tiro — no un poder genérico, sino ESE don manifestándose. Es un momento memorable, dale peso."]
        : (talentName
          ? ["turn.talent = el don del héroe: dejá que tiña el tono y su forma de encarar la escena, sin declararlo explícito ni convertirlo en poder mágico si no lo es."]
          : [])),
      "enrichedOptions: una etiqueta breve y concreta por cada optionsToLabel.id. Anclá la etiqueta a optionsToLabel.target (la entidad real de esa opción) y reflejá su targetState e intent/risk actuales. No inventes entidades fuera de scene ni cambies la mecánica de la opción.",
      ...(hasStakeHints
        ? ["optionsToLabel[].stakeHint = lo que está EN JUEGO al elegir esa opción. Dejá que la etiqueta INSINÚE esa tensión o consecuencia (qué se arriesga, qué se gana, qué se debe) con una palabra o imagen cargada — pero JAMÁS declares el resultado como hecho consumado, no spoilees qué final se abre ni nombres el desenlace. El jugador debe intuir el peso de la elección, no leer su spoiler."]
        : []),
      "VARIÁ LA APERTURA: está PROHIBIDO empezar con las mismas palabras, el mismo sujeto o la misma imagen que cualquier entrada de noRepeat. Abrí cada turno distinto: a veces con una acción, a veces con un diálogo, a veces con un detalle sensorial NUEVO.",
      "story[] es continuidad de TRAMA y tensión, NO un molde de prosa: no copies su arranque ni sus frases. No repitas motivos ya usados en turnos previos (un objeto que cae, las voces que se cortan, el sudor frío, etc.); avanzá con material nuevo.",
      ...(plan.roll.critical ? ["turn.roll.critical: fue un golpe de suerte extraordinario (20 natural). Narralo como un momento sobresaliente, casi imposible, sin inventar hechos fuera de facts."] : []),
      ...(plan.roll.fumble ? ["turn.roll.fumble: fue una pifia (1 natural). Narrala como un pequeño desastre que se vuelve en contra del actor, dentro de lo que dice consequence."] : []),
      "PROHIBIDO: inventar NPCs/objetos/pistas fuera de scene. No revelar forbidden."
    ]
  };

  const text = JSON.stringify(payload);
  if (text.length <= maxChars) return text;

  // Slim fallback: drop less critical fields. storySoFar se conserva RECORTADO —
  // la memoria de continuidad es lo último que se sacrifica (es el punto del cambio).
  const slimStorySoFar = storySoFar && hasStorySoFar
    ? {
      ...(storySoFar.lastBeat ? { lastBeat: storySoFar.lastBeat } : {}),
      ...(storySoFar.established ? { established: storySoFar.established.slice(0, 3) } : {}),
      ...(storySoFar.openThreads ? { openThreads: storySoFar.openThreads.slice(0, 2) } : {})
    }
    : undefined;
  const slim = {
    story: storyLast.slice(0, 2).map((s) => short(s, 200) ?? s),
    ...(slimStorySoFar ? { storySoFar: slimStorySoFar } : {}),
    ...(hasRecall ? { recall: recall.slice(0, 2) } : {}),
    ...(moralProfile ? { moralProfile } : {}),
    // Un reloj CUMPLIDO no se recorta nunca: es un hecho consumado del turno. La
    // presión en curso sí se achica a los 2 relojes más cargados.
    ...(hasClocks ? { clocks: clockPressure.slice(0, 2) } : {}),
    ...(clocksFired.length ? { clocksFired } : {}),
    turn: { ...payload.turn, facts: facts.slice(0, 3), forbidden: forbidden.slice(0, 2) },
    scene: { ...payload.scene, objects: objects.slice(0, 2), motifs: motifs.slice(0, 2) },
    noRepeat: noRepeat.slice(0, 2),
    optionsToLabel: optionsToLabel.slice(0, 3),
    rules: payload.rules
  };
  return JSON.stringify(slim).slice(0, maxChars);
}

// Contexto compacto para el recap final. El cierre debe sentirse GANADO por las
// decisiones acumuladas, no genérico: por eso viaja el endingScore (eje moral con su
// dimensión dominante), el final ya resuelto por el motor, el precio pagado (muertes,
// pérdidas) y la verdad probada. El motor decide el HECHO del final; el LLM solo lo
// narra con el peso de lo que la mesa eligió durante toda la partida.
export function buildFinalRecapContext(room: GameRoom) {
  const score = (room.livingState?.endingScore ?? {}) as Record<string, number>;
  const ranked = Object.entries(score)
    .filter(([, value]) => typeof value === "number" && value > 0)
    .sort((a, b) => b[1] - a[1]);
  const moralAxis = ranked.slice(0, 3).map(([key, value]) => `${key}:${value}`);
  const dominant = ranked[0]?.[0];

  const resolved = room.endingResolution;
  const ending = room.finalEnding;
  const price = [
    ...(resolved?.losses ?? []),
    ...room.players
      .filter((player) => player.status === "dead")
      .map((player) => `${player.name} cayó: ${player.deathCause ?? "pagó el precio de la escena"}`)
  ].slice(0, 4);
  const provenTruth = [...new Set([...room.mysteryClues, ...(room.memorySummary?.confirmedFacts ?? [])])]
    .slice(-4)
    .map((fact) => short(fact, 120) ?? fact);
  const log = room.sessionLog
    .slice(0, 6)
    .map((event) => (event.narration ? short(event.narration, 180) : undefined))
    .filter((line): line is string => Boolean(line));

  return {
    campaign: room.campaign.title,
    players: room.players.map((player) => player.name),
    ...(resolved?.title || ending?.title ? { ending: resolved?.title ?? ending?.title } : {}),
    ...(resolved?.plan?.tierLabel ? { endingTone: resolved.plan.tierLabel } : {}),
    ...(moralAxis.length ? { moralAxis } : {}),
    ...(dominant ? { dominant } : {}),
    ...(price.length ? { price } : {}),
    ...(provenTruth.length ? { provenTruth } : {}),
    ...(room.memorySummary?.currentTwist ? { twist: short(room.memorySummary.currentTwist, 160) } : {}),
    log
  };
}

// Reglas de estilo para que el recap refleje el eje moral acumulado sin listar números.
export const FINAL_RECAP_RULES = [
  "Cierra la partida como epílogo de saga oscura: 2-3 párrafos, prosa literaria, en español.",
  "El final YA está decidido por el motor (campo `ending`): narralo como consumado, no lo elijas ni lo cambies.",
  "moralAxis/dominant = el peso moral que la mesa acumuló con sus decisiones (verdad, misericordia, sacrificio, corrupción, caos). Que el TONO del cierre encarne ese eje dominante — NUNCA menciones los números ni las etiquetas crudas.",
  "price = lo que costó: nómbralo con dignidad, sin regodeo. provenTruth = lo que quedó probado: es la base del veredicto, no lo contradigas.",
  "No inventes NPCs, pistas ni hechos fuera del contexto. No cierres con moraleja explícita: dejá una última imagen concreta."
];

export function getNarrationCacheKey(plan: ResolutionPlan): string {
  return JSON.stringify({ turnId: plan.turnId, actorId: plan.actorId, actionText: plan.actionText, rollTotal: plan.roll.total, rollResult: plan.roll.result, consequence: plan.consequence.summary, sceneId: plan.scene.id });
}
