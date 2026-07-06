import {
  getDangerBand, getDangerLabel, inferActionDomain, isFinalScene, shouldResolveEnding,
  type NarrationRequest, type RetrievedMemory, type NarratorVoice,
  type NarrativeIngredientBundle,
} from "@tiny-quest/game-engine";
import type { ActiveNarrativeTension } from "@tiny-quest/game-engine";
import type { StoryThread } from "@tiny-quest/game-engine";
import type { PendingConsequence } from "@tiny-quest/game-engine";

export type NarrativeContext = {
  retrievedMemories?: RetrievedMemory[];
  activeTensions?: ActiveNarrativeTension[];
  storyThreads?: StoryThread[];
  pendingConsequences?: PendingConsequence[];
  moralProfileSummary?: string;
};

const MAX_PAYLOAD_CHARS = 8_000;

function shortText(value: string | undefined, max = 420) {
  if (!value) return value;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function shortList(values: string[] | undefined, maxItems = 4, maxChars = 180) {
  return values?.filter(Boolean).slice(-maxItems).map((value) => shortText(value, maxChars) ?? value);
}

function compactMemory(input: NarrationRequest["memorySummary"]) {
  return {
    facts: shortList(input.facts, 5, 150) ?? [],
    clues: shortList(input.clues, 3, 130) ?? [],
    objects: shortList(input.objects, 4, 120) ?? [],
    npcs: shortList(input.npcs, 4, 120) ?? [],
    locations: shortList(input.locations, 4, 120) ?? [],
    dangers: shortList(input.dangers, 4, 140) ?? [],
    forbiddenContradictions: shortList(input.forbiddenContradictions, 6, 180) ?? [],
    confirmedFacts: shortList(input.confirmedFacts, 6, 160) ?? [],
    suspicions: shortList(input.suspicions, 4, 140) ?? [],
    damagedClues: shortList(input.damagedClues, 4, 140) ?? [],
    npcStates: shortList(input.npcStates, 5, 140) ?? [],
    objectStates: shortList(input.objectStates, 5, 140) ?? [],
    openQuestions: shortList(input.openQuestions, 4, 140) ?? [],
    unresolvedThreads: shortList(input.unresolvedThreads, 2, 130) ?? [],
    lastBeat: shortText(input.lastBeat, 180) ?? "",
    suspects: shortList(input.suspects, 3, 90) ?? [],
    betrayals: shortList(input.betrayals, 2, 130) ?? [],
    bonds: shortList(input.bonds, 2, 130) ?? [],
    stakes: shortList(input.stakes, 2, 130) ?? [],
    currentTwist: shortText(input.currentTwist, 180) ?? ""
  };
}

function compactPayload<T extends Record<string, unknown>>(payload: T): T {
  if (JSON.stringify(payload).length <= MAX_PAYLOAD_CHARS) return payload;
  return {
    resolutionPlan: payload.resolutionPlan,
    campaign: payload.campaign,
    campaignId: payload.campaignId,
    scene: payload.scene,
    sceneAct: payload.sceneAct,
    objective: shortText(payload.objective as string | undefined, 180),
    availableClueIds: payload.availableClueIds,
    presentNpcs: payload.presentNpcs,
    sceneConflict: shortText(payload.sceneConflict as string | undefined, 220),
    endingControl: payload.endingControl,
    engineResolution: payload.engineResolution,
    narrationInput: payload.narrationInput,
    storyMemory: payload.storyMemory,
    visibleOptions: payload.visibleOptions,
    responseContract: payload.responseContract
  } as unknown as T;
}

export function buildNarratorVoiceSection(voice: NarratorVoice | undefined): string {
  if (!voice) return "";
  return [
    `NARRATOR VOICE: genre=${voice.genre} | tone=${voice.tone} | rhythm=${voice.rhythm} | diction=${voice.diction}.`,
    voice.forbiddenStyle.length ? `Forbidden style: ${voice.forbiddenStyle.join("; ")}.` : "",
    `Examples — success: "${voice.examples.success}" | partial: "${voice.examples.partial}" | failure: "${voice.examples.failure}" | npc: "${voice.examples.npcDialogue}".`
  ].filter(Boolean).join(" ");
}

export function buildDungeonMasterSystemPrompt(_narratorVoice?: NarratorVoice) {
  return [
    "Sos el narrador de TinyQuest, un libro de aventuras con dados que se escribe en tiempo real.",
    "Cada respuesta es el próximo párrafo del libro: continuá la TRAMA y la tensión de story[], pero VARIÁ la prosa — empezá distinto cada vez y no repitas las palabras, el sujeto ni la imagen inicial del turno anterior.",
    "El motor ya resolvió los dados. Narrá los hechos de turn.facts como prosa vívida, no como informe.",
    "NUNCA inventes NPCs, objetos o pistas fuera de los que aparecen en scene.",
    "NUNCA cambies resultado del dado. NUNCA uses forbidden de turn.",
    "Si optionsToLabel tiene entradas, generá enrichedOptions con una etiqueta narrativa concreta (que referencie objeto/persona de la escena) por cada id.",
    "Respondé SOLO con JSON válido. Sin Markdown. Sin texto fuera del JSON.",
    "Formato exacto: {\"narration\":\"1-2 párrafos cortos (máx ~90 palabras)\",\"dialogue\":[{\"speakerId\":\"\",\"speakerName\":\"\",\"speakerKind\":\"player|bot|npc|narrator\",\"line\":\"\",\"intention\":\"\"}],\"consequence\":{\"summary\":\"igual a turn.consequence\",\"physicalChange\":\"\",\"emotionalChange\":\"\"},\"dangerChange\":{\"before\":0,\"after\":0,\"manifestation\":\"\"},\"clueReveals\":[],\"memoryPatch\":{\"factsToRemember\":[],\"factsToUpdate\":[]},\"continuityWarnings\":[],\"enrichedOptions\":[{\"id\":\"\",\"label\":\"\"}]}"
  ].join(" ");
}


function buildRetrievedMemoriesSection(memories: RetrievedMemory[]): unknown[] {
  return memories.slice(0, 6).map((r, i) => ({
    index: i + 1,
    type: r.memory.type,
    memory: r.memory.text.slice(0, 200),
    whyRelevant: r.reasons.slice(0, 3).join("; ") || "general continuity",
    entities: [...r.memory.npcIds, ...r.memory.objectIds, ...r.memory.clueIds].slice(0, 4),
    truthStatus: r.memory.truthStatus,
    rule: "Use only as continuity reference. Do not reveal as new fact. Do not change state. Do not introduce absent entities. Only ResolutionPlan can authorize new facts."
  }));
}

function buildActiveTensionsSection(tensions: ActiveNarrativeTension[]): unknown[] {
  return tensions.slice(0, 3).map((t, i) => ({
    index: i + 1,
    title: t.title,
    cause: t.source,
    unresolvedQuestion: t.unresolvedQuestion,
    involvedEntities: t.involvedEntityIds.slice(0, 4),
    useNowIfRelevant: t.likelyPayoff,
    doNotResolveUnlessAuthorized: "Only the engine (mustHappen / StatePatch) can resolve this tension."
  }));
}

function buildStoryThreadsSection(threads: StoryThread[]): unknown[] {
  return threads.slice(0, 3).map((t) => ({
    title: t.title,
    status: t.status,
    unresolvedQuestion: t.unresolvedQuestion,
    nextPressureBeat: t.nextPressureBeat,
    involvedNpcs: t.involvedNpcIds.slice(0, 3)
  }));
}

export function buildDungeonMasterPayload(input: NarrationRequest, narrative: NarrativeContext = {}, ingredientBundle?: NarrativeIngredientBundle) {
  const sceneIndex = input.selectedCampaign?.scenes.findIndex((scene) => scene.id === input.currentScene.id) ?? 0;
  const campaignScene = input.selectedCampaign?.scenes.find((scene) => scene.id === input.currentScene.id);
  const context = input.retrievedContext;
  const dangerBand = getDangerBand(input.dangerClock);
  const dangerLabel = getDangerLabel(input.dangerClock);
  const discoveredClues = Object.fromEntries(input.mysteryCluesFound.map((clue, index) => [`clue-${index + 1}`, { id: `clue-${index + 1}`, text: clue, status: "confirmed" }]));
  const routeText = [...input.storyFlags, ...input.mysteryCluesFound, input.memorySummary.currentTwist].join(" ").toLowerCase();
  const routeStates = {
    ...(routeText.includes("ruta final") || routeText.includes("ending_ready") || routeText.includes("final") ? { ruta_final: { id: "ruta_final", status: "open" } } : {}),
    ...(routeText.includes("secret") || routeText.includes("secreto profundo") || routeText.includes("verdad bajo la verdad") ? { secret_deep_truth: { id: "secret_deep_truth", status: "open" } } : {})
  };
  const actionText = input.rawAction.toLowerCase();
  const actionDomain = inferActionDomain(input.rawAction, input.resolutionPlan?.validContext.targetId, input.resolutionPlan?.validContext.targetKind);
  const actionMode = actionText.includes("huir") || actionText.includes("escapar")
    ? "escape"
    : actionText.includes("pelear") || actionText.includes("atacar") || actionText.includes("duelo")
      ? "fight"
      : actionText.includes("acusar") || actionText.includes("confes") || actionText.includes("presionar") || actionText.includes("interrogar")
        ? "social_pressure"
        : actionText.includes("ruta") || actionText.includes("forzar") || actionText.includes("puerta") || actionText.includes("salida")
          ? "movement_route"
          : actionText.includes("examinar") || actionText.includes("comparar") || actionText.includes("objeto") || actionText.includes("prueba")
            ? "examination"
            : "general_action";
  const knownObjects = context?.relevantObjects.map((object) => ({ name: object.name, status: object.status })) ?? [];
  const presentCharacters = context?.relevantCharacters.map((npc) => ({ name: npc.name, status: npc.status, suspicion: npc.suspicion, trust: npc.trust })) ?? [];

  const endingControl = input.selectedCampaign ? {
    isFinalScene: isFinalScene(input.selectedCampaign, input.currentScene.id),
    shouldResolveEnding: shouldResolveEnding({
      campaign: { ...input.selectedCampaign, maxRounds: input.sessionConfig.maxRoundsPerScene },
      state: {
        currentSceneId: input.currentScene.id,
        danger: input.dangerClock,
        round: input.recentSessionLog[0]?.roundNumber ?? 1,
        discoveredClues,
        routeStates,
        availableEndings: input.selectedCampaign.possibleEndings.map((ending) => ending.id),
        sceneClocks: { [input.currentScene.id]: { currentTicks: 0, maxTicks: 2.5 } },
        endingScore: { truth: input.mysteryCluesFound.length, mercy: routeText.includes("misericordia") ? 2 : 0, sacrifice: routeText.includes("coste") ? 1 : 0 }
      },
      lastAction: { statePatch: { endingScoreDelta: { truth: input.mysteryCluesFound.length } } }
    })
  } : { isFinalScene: false, shouldResolveEnding: false };

  const payload = {
    resolutionPlan: input.resolutionPlan,
    campaign: input.selectedCampaign?.title ?? input.selectedTheme.title,
    campaignId: input.selectedCampaign?.id ?? input.selectedTheme.id,
    scene: input.currentScene.title,
    sceneAct: `${sceneIndex + 1} de ${input.selectedCampaign?.scenes.length ?? 3}`,
    objective: input.currentScene.objective,
    sceneDescription: shortText(campaignScene?.description, 360),
    narratorGuidance: shortText(input.selectedCampaign?.narratorGuidance ?? input.selectedTheme.narratorGuidance, 650),
    availableClueIds: input.selectedCampaign?.clues
      .filter((clue) => input.currentScene.clueIds?.includes(clue.id) || input.mysteryCluesFound.includes(clue.text))
      .slice(0, 6)
      .map((clue) => ({ id: clue.id, text: shortText(clue.text, 180), sceneId: clue.sceneId })),
    campaignStory: {
      premise: shortText(input.selectedCampaign?.premise ?? input.selectedCampaign?.storyHook, 320),
      hiddenTruth: shortText(input.selectedCampaign?.hiddenTruth, 260),
      mainConflict: shortText(input.selectedCampaign?.mainConflict, 260),
      stakes: shortList(input.selectedCampaign?.stakes, 3, 160),
      sceneFlow: shortList(input.selectedCampaign?.sceneFlow, 3, 160),
      possibleReveals: shortList(input.selectedCampaign?.possibleReveals, 4, 180),
      moralDilemmas: shortList(input.selectedCampaign?.moralDilemmas, 2, 180),
      failureStates: shortList(input.selectedCampaign?.failureStates, 2, 180),
      factions: input.selectedCampaign?.factions?.slice(0, 4).map((faction) => ({ name: faction.name, agenda: shortText(faction.agenda, 140), pressure: shortText(faction.pressure, 140) })),
      suspects: input.selectedCampaign?.suspects?.slice(0, 5).map((suspect) => ({ name: suspect.name, motive: shortText(suspect.motive, 140), secret: shortText(suspect.secret, 140) })),
      threats: input.selectedCampaign?.threats?.slice(0, 3).map((threat) => ({
        name: threat.name,
        pressure: shortText(threat.pressure, 160),
        escalatesWhen: shortText(threat.escalatesWhen, 140)
      })),
      twists: input.selectedCampaign?.twists?.slice(0, 3).map((twist) => ({
        title: twist.title,
        trigger: twist.trigger,
        reveal: shortText(twist.reveal, 180)
      })),
      graveConsequences: shortList(input.selectedCampaign?.graveConsequences, 3, 180)
    },
    forbiddenMotifs: ["luna roja", "sangre", "juramento", "pacto", "huellas", "herramienta ritual", "serpiente", "fantasma", "susurros"],
    previousTextToAvoidRepeating: input.recentSessionLog.map((event) => shortText(event.narration, 220)).slice(0, 2),
    atmosphere: {
      visualPrompt: shortText(input.visualPrompt, 220),
      ambientSoundPrompt: shortText(input.ambientSoundPrompt, 180),
      tags: input.atmosphereTags,
      imageDescription: shortText(input.currentImageDescription, 220),
      soundMood: shortText(input.currentSoundMood, 120)
    },
    party: input.party.map((player) => ({
      name: player.name,
      type: player.type,
      lineage: player.character.species,
      role: player.character.role,
      pet: player.character.pet.name,
      motive: shortText(player.character.concept, 120),
      vitality: player.character.vitality,
      energy: player.character.energy
    })),
    activePlayer: {
      name: input.activePlayer.name,
      type: input.activePlayer.type,
      lineage: input.activePlayer.character.species,
      role: input.activePlayer.character.role,
      pet: input.activePlayer.character.pet.name,
      motive: shortText(input.activePlayer.character.concept, 120)
    },
    presentNpcs: input.selectedCampaign?.npcs
      .filter((npc) => !npc.appearsInScenes?.length || npc.appearsInScenes.includes(input.currentScene.id))
      .slice(0, 4)
      .map((npc) => ({
        name: npc.name,
        role: npc.role,
        motive: shortText(npc.motive, 120),
        fear: shortText(npc.fear, 120),
        desire: shortText(npc.desire, 120),
        knows: shortList(npc.whatTheyKnow, 2, 140),
        hides: shortList(npc.whatTheyHide, 2, 140),
        reaction: npc.reactionByOutcome?.[input.resolvedOutcome]
      })),
    npcInteractionRule: "Incluye al menos un NPC presente hablando o reaccionando si no contradice la escena. En peligro bajo/medio puede ser charla tensa, negociación o duda; en alto/crítico puede ser hostilidad, desesperación o traición.",
    narrativeContract: input.narrativeContract,
    sceneUniqueActions: campaignScene?.multipleChoiceOptions.map((option) => ({
      actionId: option.id,
      label: option.label,
      actionType: option.actionType,
      targetId: option.targetId,
      targetKind: option.targetKind,
      clueIds: option.unlocksClues,
      cost: option.energyCost,
      exhausts: option.exhausts,
      resultHint: shortText(option.possibleOutcomeHint, 160)
    })),
    actionMemory: input.retrievedContext?.repeatedActions.slice(0, 4) ?? [],
    sceneConflict: input.selectedCampaign?.id === "red-moon-killer" || input.selectedCampaign?.id === "luna-roja"
      ? "La aldea quiere ejecutar a Nicolás, el lobo acusado. La turba presiona afuera; Tomás teme hablar; Bruno cuida el molino; Doña Irma protege la capilla; Elías intenta cerrar el caso rápido."
      : input.currentScene.objective,
    latinoStyle: {
      sentenceStyle: "frases cortas, tensión concreta, diálogo natural",
      avoidPhrases: ["la escena cambia en algo visible", "la siguiente acción debe usar ese cambio", "detalle físico queda confirmado", "testigo de la verdad incómoda", "obtiene la pista"],
      noTechnicalTextForPlayer: true
    },
    coherenceContract: {
      priority: "coherencia > continuidad > consecuencia > estilo",
      actionMode,
      actionDomain,
      resolvedAction: input.rawAction,
      diceOutcome: input.resolvedOutcome,
      sceneLocation: input.currentScene.title,
      sceneObjective: input.currentScene.objective,
      knownClues: shortList(input.mysteryCluesFound, 6, 180),
      knownObjects,
      presentCharacters,
      previousActions: input.recentSessionLog.slice(0, 4).map((event) => ({
        player: event.playerName,
        action: shortText(event.actionLabel ?? event.action, 160),
        outcome: event.outcome,
        scene: event.sceneTitle,
        consequence: shortText(event.consequenceText ?? event.engineOutcome, 180)
      })),
      forbidden: [
        "No repetir descubrimientos ya confirmados como si fueran nuevos.",
        "No mover personajes sin narrar desplazamiento.",
        "No restaurar objetos rotos, perdidos o dañados.",
        "No revelar pensamientos internos de NPCs como verdad absoluta.",
        "No mezclar acción de escape/combate con examen tranquilo salvo como vistazo parcial."
        , "No cambiar de dominio narrativo: body no usa campana/badajo; bell no usa mordida/herida; chains no usa sello lunar salvo mustHappen explícito."
        , "No narrar affordances imposibles: campana bajo capa, campana cubierta con palma o grilletes guardados bajo capa."
      ]
    },
    endingControl,
    engineResolution: {
      action: input.rawAction,
      actionType: input.narrativeContract?.actionType,
      campaignActionType: input.narrativeContract?.campaignActionType,
      target: input.narrativeContract?.target,
      targetId: input.narrativeContract?.targetId,
      outcomeKind: input.narrativeContract?.outcomeKind,
      factualSummary: shortText(input.narrativeContract?.factualSummary, 260),
      visibleConsequence: shortText(input.narrativeContract?.visibleConsequence, 220),
      narrationHints: input.narrativeContract?.narrationHints,
      mustNarrate: input.narrativeContract?.must,
      mustAvoid: input.narrativeContract?.avoid,
      stat: input.selectedStat,
      skillUsed: input.skillUsed,
      petUsed: input.petUsed,
      roll: input.diceResults,
      outcome: input.resolvedOutcome,
      consequence: input.consequence?.text ?? "Sin consecuencia grave.",
      combat: input.combatNote ?? "Sin intercambio de combate.",
      dangerClock: input.dangerClock,
      dangerBand,
      dangerMeaning: dangerBand,
      dangerLabel,
      dangerInstruction: dangerBand === "high"
        ? "Presion fuerte: amenaza activa, rutas en riesgo y NPCs hostiles o desesperados. No cerrar la escena ni forzar avance salvo indicacion del motor."
        : dangerBand === "critical"
          ? "Crisis inmediata: puede cerrar escena, forzar avance o detonar persecucion, incendio, ataque, ejecucion o revelacion forzada."
          : dangerLabel,
      companionDeath: input.combatNote?.includes("muere cubriendo") ? input.combatNote : undefined
    },
    narrationInput: {
      actorName: input.activePlayer.name,
      sceneTitle: input.currentScene.title,
      actionLabel: input.rawAction,
      actionType: input.narrativeContract?.campaignActionType,
      result: input.resolvedOutcome,
      targetPublicName: input.narrativeContract?.target,
      involvedNpcs: input.selectedCampaign?.npcs
        .filter((npc) => !npc.appearsInScenes?.length || npc.appearsInScenes.includes(input.currentScene.id))
        .map((npc) => npc.name)
        .slice(0, 4),
      involvedObjects: input.selectedCampaign?.storyObjects
        ?.filter((object) => input.currentScene.clueIds?.some((clueId) => object.relatedClues.includes(clueId)))
        .map((object) => object.name)
        .slice(0, 4),
      factualSummary: input.narrativeContract?.factualSummary,
      visibleConsequence: input.narrativeContract?.visibleConsequence,
      tone: input.selectedCampaign?.tone ?? input.selectedCampaign?.genre,
      pressure: input.selectedCampaign?.mainConflict ?? input.currentScene.objective,
      forbiddenPhrases: [
        "actúa sobre",
        "la acción sale mal",
        "el intento de cambiar el enfoque",
        "la escena deja una consecuencia concreta",
        "la escena cambia en algo visible",
        "la siguiente acción debe",
        "un detalle físico queda confirmado",
        "se llena de ruido",
        "cambia de manos y deja una marca visible",
        "target",
        "outcome",
        "actionType",
        "statePatch",
        "peligroDelta"
      ]
    },
    storyMemory: {
      cluesFound: shortList(input.mysteryCluesFound, 6, 180),
      currentMemory: compactMemory(input.memorySummary),
      forbiddenContradictions: shortList(input.memorySummary.forbiddenContradictions, 8, 180),
      storyFlags: shortList(input.storyFlags, 8, 120),
      recentTurns: (context?.recentTurns ?? input.recentSessionLog).slice(0, 4).map((event) => ({
        player: event.playerName,
        action: shortText(event.actionLabel ?? event.action, 160),
        outcome: event.outcome,
        total: event.total,
        scene: event.sceneTitle,
        consequence: shortText(event.consequenceText ?? event.engineOutcome, 180),
        flags: event.unlockedFlags
      })),
      npcNames: input.selectedCampaign?.npcs.map((npc) => npc.name).slice(0, 5),
      enemyNames: input.selectedCampaign?.enemies.map((enemy) => enemy.name).slice(0, 4)
    },
    retrievedContext: context ? {
      facts: context.relevantFacts.map((fact) => shortText(fact.text, 180)).slice(0, 5),
      clues: context.relevantClues.map((clue) => shortText(clue.text, 160)).slice(0, 4),
      objects: context.relevantObjects.map((object) => `${object.name}: ${object.status}`).slice(0, 4),
      characters: context.relevantCharacters.map((npc) => `${npc.name}: ${npc.status}, sospecha ${npc.suspicion}, confianza ${npc.trust}`).slice(0, 4),
      causalLinks: context.causalLinks.map((link) => shortText(link.description, 180)).slice(0, 4),
      currentTheory: shortText(context.currentTheory, 260),
      openQuestions: shortList(context.openQuestions, 3, 160),
      possibleEndings: shortList(context.possibleEndings, 4, 120),
      blockedEndings: shortList(context.blockedEndings, 3, 120),
      forbiddenContradictions: shortList(context.forbiddenContradictions, 4, 160),
      recentMotifsToAvoid: shortList(context.recentMotifsToAvoid, 6, 80),
      sceneTurnCount: context.sceneTurnCount,
      repeatedActions: context.repeatedActions.slice(0, 4)
    } : undefined,
    visibleOptions: input.visibleOptions?.map((option) => ({
      id: option.id,
      label: option.label,
      action: option.action,
      category: option.category,
      risk: option.riskLevel
    })),
    relevantRetrievedMemory: narrative.retrievedMemories && narrative.retrievedMemories.length > 0
      ? buildRetrievedMemoriesSection(narrative.retrievedMemories)
      : undefined,
    activeNarrativeTensions: narrative.activeTensions && narrative.activeTensions.length > 0
      ? buildActiveTensionsSection(narrative.activeTensions)
      : undefined,
    relevantStoryThreads: narrative.storyThreads && narrative.storyThreads.length > 0
      ? buildStoryThreadsSection(narrative.storyThreads)
      : undefined,
    triggeredPendingConsequences: narrative.pendingConsequences
      ? narrative.pendingConsequences.filter((pc) => pc.status === "triggered").slice(0, 3).map((pc) => pc.narrativeHint)
      : undefined,
    moralProfileSummary: narrative.moralProfileSummary || undefined,
    narratorVoice: input.selectedCampaign?.narratorVoice
      ? buildNarratorVoiceSection(input.selectedCampaign.narratorVoice)
      : undefined,
    responseContract: {
      narration: "1 a 2 párrafos CORTOS (máximo ~90 palabras en total): 1) acción física concreta con un objeto o detalle sensorial de la escena, 2) tensión emocional o señal de giro. Cada frase tiene que ganarse su lugar; nada de relleno atmosférico.",
      npcDialogue: ["PNJ: una frase breve con deseo, amenaza o mentira."],
      consequence: "Una frase clara: que cambia ahora por el resultado del dado.",
      nextOptions: ["Accion concreta con persona/lugar/objeto", "Accion concreta con persona/lugar/objeto"],
      plotBeat: {
        title: "Titulo de capitulo breve",
        hook: "Que acaba de volverse irresistible.",
        twist: "Que giro cambia la sospecha.",
        characterFocus: "Que personaje queda comprometido y por que.",
        threat: "Que amenaza avanza si nadie actua.",
        continuity: "Que recordar en el proximo turno."
      },
      sections: {
        narration: "Prosa de escena, 2 a 3 frases.",
        dialogue: "PNJ: linea memorable.",
        consequence: "Coste, ventaja o cambio de posicion.",
        options: ["Accion concreta", "Accion concreta"]
      },
      memoryUpdate: {
        facts: [],
        clues: [],
        objects: [],
        npcs: [],
        locations: [],
        dangers: [],
        forbiddenContradictions: []
      }
    }
  };

  // Attach ingredient bundle as the primary narrative contract for the LLM.
  // Placed last so compactPayload preserves it (it's not in the slim-down list).
  const payloadWithBundle = ingredientBundle
    ? { ...payload, narrativeIngredients: ingredientBundle }
    : payload;

  return compactPayload(payloadWithBundle as typeof payload);
}

export function buildDungeonMasterPrompt(input: NarrationRequest, narrative: NarrativeContext = {}, ingredientBundle?: NarrativeIngredientBundle): string {
  return JSON.stringify(buildDungeonMasterPayload(input, narrative, ingredientBundle), null, 2);
}
