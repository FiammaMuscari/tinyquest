import type { NarrationRequest, Campaign, CampaignNPC, DungeonNarrationOutput } from "./types";
import type { ResolutionPlan } from "./resolution-plan";

// ─── Forbidden phrases ────────────────────────────────────────────────────────

export const FORBIDDEN_NARRATION_PHRASES_BUNDLE = [
  "toma una decisión arriesgada",
  "toma una decision arriesgada",
  "la ventaja pasa a otras manos",
  "alguien gana tiempo",
  "alguien pierde seguridad",
  "la decisión deja una marca clara",
  "la decision deja una marca clara",
  "obliga al grupo a moverse con cuidado",
  "la prueba deja de ser sospecha",
  "una marca física",
  "una marca fisica",
  "la versión pública",
  "la version publica",
  "alguien toca donde no debe",
  "una voz grita desde atrás",
  "una voz grita desde atras",
  "la ruta no es segura, pero cambia la posición de todos",
  "la ruta no es segura, pero cambia la posicion de todos",
  "ahora el peligro viene desde atrás",
  "ahora el peligro viene desde atras",
  "la escena avanza sin repetir",
  "la escena cambia en algo visible",
  "la siguiente acción debe",
  "la siguiente accion debe",
  "actúa sobre la escena",
  "actua sobre la escena",
  "la escena responde con una consecuencia visible",
] as const;

export function containsForbiddenBundlePhrase(text: string): boolean {
  const n = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return FORBIDDEN_NARRATION_PHRASES_BUNDLE.some((phrase) => {
    const np = phrase.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return n.includes(np);
  });
}

// ─── NPC gesture registry ─────────────────────────────────────────────────────

const NPC_GESTURES: Record<string, { plausible: string[]; implausible: string[] }> = {
  tomas: {
    plausible: [
      "se limpia las manos en el delantal",
      "mira la campana antes de responder",
      "traga saliva",
      "aprieta una bolsa de harina",
      "retrocede hacia la puerta del molino",
      "evita mirar el cadáver",
      "se rasca el cuello con los dedos blancos de harina",
    ],
    implausible: [
      "se lleva harina a la boca",
      "habla con calma frente a la turba",
      "se enfrenta directamente a Elías",
      "saca un arma",
    ],
  },
  elias: {
    plausible: [
      "se adelanta antes de que alguien termine",
      "señala el cuerpo sin mirar la turba",
      "frunce el ceño y espera que alguien contradiga",
      "acomoda el acta bajo el brazo izquierdo",
      "habla despacio para que la turba lo oiga",
      "no toca la prueba, la nombra",
    ],
    implausible: [
      "llora",
      "confiesa espontáneamente",
      "retrocede ante una pregunta",
    ],
  },
  mayor: {
    plausible: [
      "acomoda el sello del anillo antes de hablar",
      "mira primero a la turba, luego responde",
      "sonríe un segundo tarde",
      "baja la voz al final de la frase",
      "toca la llave del archivo sin darse cuenta",
      "no mira la prueba directamente",
    ],
    implausible: [
      "confiesa sin presión",
      "llora delante de la turba",
      "corre",
    ],
  },
  mara: {
    plausible: [
      "aprieta la carta rota entre los dedos",
      "evita mirar a Nicolás directamente",
      "se queda sin voz un momento antes de responder",
      "esconde los dedos manchados de tinta bajo la manga",
      "mira la salida antes de hablar",
      "aprieta el rosario pero no lo muestra",
    ],
    implausible: [
      "grita",
      "ataca a alguien",
      "ríe ante la situación",
    ],
  },
  irma: {
    plausible: [
      "aprieta el rosario hasta hacerse daño",
      "mira la cuerda de la campana antes de hablar",
      "se persigna sin terminar el gesto",
      "se acerca a la campana sin tocarla",
      "baja la vista cuando mencionan a Mara",
    ],
    implausible: [
      "corre",
      "usa un arma",
      "habla primero sin que le pregunten",
    ],
  },
  nicolas: {
    plausible: [
      "arrastra los grilletes sin levantar la vista",
      "mira las manos antes de responder",
      "respira lento cuando mencionan a Mara",
      "no niega nada que ya saben",
      "aprieta la mandíbula cuando oye 'ejecución'",
    ],
    implausible: [
      "ataca sin estar liberado",
      "grita su inocencia a la turba",
      "corre con los grilletes puestos",
    ],
  },
  belo: {
    plausible: [
      "se coloca entre el grupo y la amenaza sin hablar",
      "cruza los brazos y espera",
      "apoya una mano en la vaina sin desenvainár",
      "mira al más hostil, no al más ruidoso",
      "asiente con la cabeza cuando Fiamy termina",
    ],
    implausible: [
      "analiza pistas con detalle",
      "hace observaciones filosóficas",
      "se distrae con el entorno",
    ],
  },
  miri: {
    plausible: [
      "se agacha para ver la marca desde abajo",
      "pasa los dedos sobre la prueba sin tocar el centro",
      "cierra los ojos un segundo antes de hablar",
      "menciona lo que falta, no lo que hay",
      "mira a Belo antes de decir algo comprometedor",
    ],
    implausible: [
      "carga físicamente contra alguien",
      "grita en escenas de tensión",
      "ignora una pista visible",
    ],
  },
};

function getNpcGestures(npcId: string, npcName: string): { plausible: string[]; implausible: string[] } {
  const key = Object.keys(NPC_GESTURES).find(
    (k) => npcId.toLowerCase().includes(k) || npcName.toLowerCase().includes(k)
  );
  return key ? NPC_GESTURES[key] : { plausible: [], implausible: [] };
}

// ─── Target name inference ────────────────────────────────────────────────────

export function inferTargetName(
  plan: ResolutionPlan,
  request: NarrationRequest,
  campaign?: Campaign
): string | undefined {
  const targetId = plan.validContext.targetId;
  const targetKind = plan.validContext.targetKind;
  const actionText = plan.actionText.toLowerCase();

  // Try campaign object lookup by id
  if (targetId && campaign) {
    const obj = campaign.storyObjects?.find((o) => o.id === targetId);
    if (obj) return obj.name;
    const npc = campaign.npcs.find((n) => n.id === targetId);
    if (npc) return npc.name;
    const clue = campaign.clues.find((c) => c.id === targetId);
    if (clue) return (clue.label ?? clue.text).split(";")[0].trim().slice(0, 40);
  }

  // Use narrativeContract.target only if it's not the same string as the full action label
  const contractTarget = request.narrativeContract?.target;
  if (contractTarget && contractTarget !== request.rawAction && contractTarget.length < 50) {
    return contractTarget;
  }

  // Keyword-based inference from action text + targetId
  const combined = [actionText, targetId ?? "", request.rawAction.toLowerCase()].join(" ");
  if (combined.includes("grillete") || combined.includes("cadena")) return "los grilletes";
  if (combined.includes("cuerda") || (combined.includes("campana") && !combined.includes("accuse"))) return "la cuerda de la campana";
  if (combined.includes("mordida") || combined.includes("cadáver") || combined.includes("cadaver") || combined.includes("herida")) return "la herida del cadáver";
  if (combined.includes("carta") || combined.includes("sello")) return "la carta sellada";
  if (combined.includes("cuchilla") || combined.includes("herramienta ritual")) return "la cuchilla ritual";
  if (combined.includes("barro") || combined.includes("rastro")) return "el rastro de barro";
  if (combined.includes("sendero") || combined.includes("ruta") || combined.includes("camino")) return "la ruta";
  if (combined.includes("nicolás") || combined.includes("nicolas")) return "Nicolás";
  if (combined.includes("elías") || combined.includes("elias")) return "Elías";
  if (combined.includes("tomás") || combined.includes("tomas")) return "Tomás";
  if (combined.includes("mara")) return "Mara";

  // targetKind fallback — never return the raw action label
  switch (targetKind) {
    case "object": return "la prueba";
    case "npc": return plan.npcDirectives[0]?.name ?? "el testigo";
    case "route": return "la salida";
    case "clue": return "la pista";
    case "creature": return "la amenaza";
    default: return undefined;
  }
}

// ─── Sensory motif inference ──────────────────────────────────────────────────

const SCENE_MOTIFS: Record<string, string[]> = {
  molino: ["harina flotando en el aire", "olor a madera mojada", "luz amarilla por las grietas", "el crujido del mecanismo parado"],
  capilla: ["cera vieja sobre piedra", "silencio que absorbe pasos", "campana quieta", "olor a incienso frío"],
  aldea: ["murmullos que no se detienen", "antorchas que proyectan sombras dobles", "barro pisado por muchos pies"],
  bosque: ["hojas mojadas que no crujen sino se pegan", "campanillas de hueso entre las ramas", "barro rojo que no desaparece"],
  molino_ext: ["el umbral con barro viejo", "luz que entra sesgada", "la turba apretada afuera"],
};

function inferSensoryMotifs(scene: { title: string; id: string }, atmosphereTags: string[]): string[] {
  const combined = [scene.title, scene.id, ...atmosphereTags].join(" ").toLowerCase();
  for (const [key, motifs] of Object.entries(SCENE_MOTIFS)) {
    if (combined.includes(key)) return motifs;
  }
  return atmosphereTags.slice(0, 4).map((t) => t.replace(/_/g, " "));
}

// ─── Bundle type ──────────────────────────────────────────────────────────────

export type NarrativeIngredientBundle = {
  outcome: "success" | "partial" | "failure";
  actor: {
    id: string;
    name: string;
    role?: string;
    kind: "player" | "bot" | "npc";
  };
  action: {
    label: string;
    intent: string;
    campaignActionType?: string;
    targetKind?: string;
    targetId?: string;
    targetName?: string;
  };
  hardFacts: string[];
  forbiddenFacts: string[];
  dramaticForces: string[];
  emotionalPressures: string[];
  sensoryMotifs: string[];
  loadedObjects: {
    id: string;
    name: string;
    knownState: string;
    symbolicWeight?: string;
  }[];
  presentNpcs: {
    id: string;
    name: string;
    role?: string;
    currentAttitude?: string;
    plausibleGestures: string[];
    implausibleGestures: string[];
  }[];
  activeClues: {
    id: string;
    name: string;
    knownTruth: string;
    revealPermission: "already_known" | "may_echo" | "may_reveal" | "forbidden";
  }[];
  continuityHooks: string[];
  recentNarrationOpenings: string[];
  narratorVoice?: {
    genre: string;
    tone: string;
    rhythm: string;
    diction: string[];
    forbiddenStyle: string[];
  };
  freedomGuidance: {
    mayAddSmallPhysicalDetails: boolean;
    mayInventMinorNpcGestures: boolean;
    mayUseSensoryTexture: boolean;
    mayUseBriefMetaphor: boolean;
    mayInventNewFacts: false;
    mayIntroduceAbsentNpcs: false;
    mayChangeDiceOutcome: false;
    mayRevealForbiddenClues: false;
  };
};

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildNarrativeIngredientBundle(
  request: NarrationRequest,
  plan: ResolutionPlan
): NarrativeIngredientBundle {
  const campaign: Campaign | undefined = request.selectedCampaign;
  const scene = request.currentScene;

  const outcomeRaw = plan.roll.result;
  const outcome: NarrativeIngredientBundle["outcome"] =
    outcomeRaw === "success" ? "success"
    : outcomeRaw === "failure" ? "failure"
    : "partial";

  const targetName = inferTargetName(plan, request, campaign);

  // Hard facts: what must be true in this scene
  const hardFacts: string[] = [
    plan.consequence.summary,
    ...plan.mustHappen.filter((f) => !f.includes("mustHappen")),
    plan.consequence.physicalChange,
    plan.consequence.socialChange,
    plan.consequence.emotionalChange,
  ].filter((f): f is string => typeof f === "string" && f.length > 4);

  // Forbidden facts: what must never appear
  const forbiddenFacts: string[] = [
    ...plan.mustNotHappen,
    ...plan.cluePolicy.forbiddenClueIds.map((id) => `No revelar pista: ${id}`),
  ].filter(Boolean);

  // Dramatic forces: active pressures that drive the scene
  const dramaticForces: string[] = [
    plan.consequence.dangerManifestation,
    plan.consequence.dangerReason,
    plan.consequence.cost,
    plan.consequence.complication,
    ...plan.botDirectives.map((bot) => `${bot.name}: ${bot.currentGoal}`),
  ].filter((f): f is string => Boolean(f));

  // Emotional pressures: NPC states that color the scene
  const emotionalPressures: string[] = plan.npcDirectives
    .filter((npc) => npc.canSpeak || npc.stateAfter)
    .map((npc) => `${npc.name}: ${npc.stateAfter ?? npc.stateBefore ?? "presente"}`);

  // Sensory motifs from scene atmosphere
  const sensoryMotifs = inferSensoryMotifs(scene, request.atmosphereTags ?? []);

  // Loaded objects: objects physically present
  const presentObjectIds = plan.validContext.presentObjectIds;
  const loadedObjects = presentObjectIds.map((id) => {
    const obj = campaign?.storyObjects?.find((o) => o.id === id);
    return obj
      ? { id: obj.id, name: obj.name, knownState: obj.status, symbolicWeight: obj.description?.slice(0, 80) }
      : { id, name: id.replace(/_/g, " "), knownState: "present" };
  });

  // Present NPCs with gesture registry
  const presentNpcs = plan.npcDirectives.map((dir) => {
    const npcData: CampaignNPC | undefined = campaign?.npcs.find((n) => n.id === dir.npcId);
    const gestures = getNpcGestures(dir.npcId, dir.name);
    return {
      id: dir.npcId,
      name: dir.name,
      role: npcData?.role,
      currentAttitude: dir.stateAfter ?? dir.stateBefore,
      plausibleGestures: gestures.plausible,
      implausibleGestures: gestures.implausible,
    };
  });

  // Active clues: their reveal permission
  const allClueIds = [...plan.cluePolicy.allowedClueIds, ...plan.cluePolicy.forbiddenClueIds, ...plan.validContext.knownClueIds];
  const activeClues = [...new Set(allClueIds)].slice(0, 6).map((id) => {
    const clue = campaign?.clues.find((c) => c.id === id);
    const isKnown = plan.validContext.knownClueIds.includes(id);
    const isForbidden = plan.cluePolicy.forbiddenClueIds.includes(id);
    const canReveal = plan.cluePolicy.canRevealNewClue && plan.cluePolicy.allowedClueIds.includes(id);
    return {
      id,
      name: clue?.label ?? id.replace(/_/g, " "),
      knownTruth: clue?.text?.slice(0, 120) ?? id,
      revealPermission: (isKnown ? "already_known" : isForbidden ? "forbidden" : canReveal ? "may_reveal" : "may_echo") as NarrativeIngredientBundle["activeClues"][0]["revealPermission"],
    };
  });

  // Continuity hooks: dry consequence/engine outcome echoes for story reference
  const continuityHooks = request.recentSessionLog.slice(0, 3).map((event) => {
    const txt = event.consequenceText ?? event.engineOutcome ?? event.narration ?? "";
    return txt.slice(0, 120);
  }).filter(Boolean);

  // Opening sentences from recent LLM narrations — the LLM must NOT reuse these structures
  const recentNarrationOpenings = request.recentSessionLog
    .slice(0, 4)
    .map((event) => {
      const narr = event.narration ?? "";
      // grab the first sentence (up to first period or 100 chars)
      const end = narr.search(/[.!?]/);
      return (end > 0 ? narr.slice(0, end + 1) : narr.slice(0, 100)).trim();
    })
    .filter((s) => s.length > 10);

  // Narrator voice
  const voice = campaign?.narratorVoice;
  const narratorVoice = voice
    ? {
        genre: voice.genre,
        tone: voice.tone,
        rhythm: voice.rhythm,
        diction: typeof voice.diction === "string" ? [voice.diction] : [],
        forbiddenStyle: voice.forbiddenStyle,
      }
    : undefined;

  return {
    outcome,
    actor: {
      id: plan.actorId,
      name: plan.actorName,
      role: request.activePlayer.character.role,
      kind: plan.actorKind,
    },
    action: {
      label: request.rawAction,
      intent: plan.actionText,
      campaignActionType: request.narrativeContract?.campaignActionType,
      targetKind: plan.validContext.targetKind,
      targetId: plan.validContext.targetId,
      targetName,
    },
    hardFacts,
    forbiddenFacts,
    dramaticForces,
    emotionalPressures,
    sensoryMotifs,
    loadedObjects,
    presentNpcs,
    activeClues,
    continuityHooks,
    recentNarrationOpenings,
    narratorVoice,
    freedomGuidance: {
      mayAddSmallPhysicalDetails: true,
      mayInventMinorNpcGestures: true,
      mayUseSensoryTexture: true,
      mayUseBriefMetaphor: true,
      mayInventNewFacts: false,
      mayIntroduceAbsentNpcs: false,
      mayChangeDiceOutcome: false,
      mayRevealForbiddenClues: false,
    },
  };
}

// ─── Validator ────────────────────────────────────────────────────────────────

export type BundleValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

export function validateNarrationAgainstIngredientBundle(
  narration: string,
  bundle: NarrativeIngredientBundle
): BundleValidationIssue[] {
  const issues: BundleValidationIssue[] = [];
  const lower = narration.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Forbidden phrases
  for (const phrase of FORBIDDEN_NARRATION_PHRASES_BUNDLE) {
    const np = phrase.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (lower.includes(np)) {
      issues.push({ code: "forbidden-phrase", severity: "error", message: `Frase genérica prohibida: "${phrase}"` });
    }
  }

  // Action label used as physical object
  const actionLower = bundle.action.label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (lower.includes(actionLower)) {
    issues.push({ code: "action-label-as-object", severity: "error", message: `La narración usa el label de acción completo como objeto físico: "${bundle.action.label}"` });
  }

  // Must mention at least one hard fact echo
  const hasAnyFact = bundle.hardFacts.some((fact) => {
    const words = fact.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    return words.some((w) => lower.includes(w.normalize("NFD").replace(/[̀-ͯ]/g, "")));
  });
  if (!hasAnyFact && bundle.hardFacts.length > 0) {
    issues.push({ code: "no-hard-fact", severity: "warning", message: "La narración no menciona ningún hecho concreto del motor." });
  }

  // Outcome consistency
  if (bundle.outcome === "failure" && (lower.includes("éxito") || lower.includes("exito") || lower.includes("logra"))) {
    issues.push({ code: "outcome-mismatch", severity: "error", message: "Narración de fallo describe éxito." });
  }
  if (bundle.outcome === "success" && lower.includes("fracasa")) {
    issues.push({ code: "outcome-mismatch", severity: "error", message: "Narración de éxito describe fracaso." });
  }

  // Absent NPCs
  const presentNpcNames = new Set(bundle.presentNpcs.map((n) => n.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")));
  const allKnownNpcs = ["roldán", "roldan", "don roldan", "don roldán"];
  for (const absent of allKnownNpcs) {
    const absentN = absent.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (lower.includes(absentN) && !presentNpcNames.has(absentN)) {
      issues.push({ code: "absent-npc", severity: "warning", message: `NPC posiblemente ausente mencionado: "${absent}"` });
    }
  }

  // Forbidden clues
  for (const clue of bundle.activeClues) {
    if (clue.revealPermission === "forbidden") {
      const clueWords = clue.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter((w) => w.length > 4);
      if (clueWords.some((w) => lower.includes(w))) {
        issues.push({ code: "forbidden-clue", severity: "error", message: `Pista prohibida mencionada: ${clue.name}` });
      }
    }
  }

  // Implausible NPC gestures
  for (const npc of bundle.presentNpcs) {
    for (const gesture of npc.implausibleGestures) {
      const gN = gesture.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (lower.includes(gN)) {
        issues.push({ code: "implausible-gesture", severity: "warning", message: `Gesto implausible para ${npc.name}: "${gesture}"` });
      }
    }
  }

  return issues;
}

// ─── Fallback narration from bundle ──────────────────────────────────────────

function pick<T>(arr: T[], seed: string): T {
  const hash = seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return arr[hash % arr.length];
}

export function buildFallbackNarrationFromBundle(bundle: NarrativeIngredientBundle): string {
  const { actor, action, outcome, hardFacts, loadedObjects, presentNpcs, sensoryMotifs, dramaticForces } = bundle;

  const fact = hardFacts[0] ?? action.intent;
  const obj = loadedObjects[0];
  const motif = pick(sensoryMotifs.length > 0 ? sensoryMotifs : ["la penumbra de la escena"], actor.id);
  const npc = presentNpcs[0];
  const force = dramaticForces[0];
  const target = action.targetName ?? action.targetKind ?? "la prueba";

  if (outcome === "failure") {
    const npcLine = npc ? ` ${pick(npc.plausibleGestures.length > 0 ? npc.plausibleGestures : [`${npc.name} no reacciona`], npc.id)}.` : "";
    const forceText = force ? ` ${force}.` : "";
    return [
      `${actor.name} mueve primero, pero la escena no lo espera.${npcLine}`,
      `${obj ? `${obj.name.charAt(0).toUpperCase() + obj.name.slice(1)} sigue donde estaba` : `${target.charAt(0).toUpperCase() + target.slice(1)} no cede`}: ${fact.endsWith(".") ? fact : `${fact}.`}`,
      forceText || `La ventaja no llegó a formarse.`,
    ].filter(Boolean).join(" ");
  }

  if (outcome === "partial") {
    const cost = bundle.action.campaignActionType ? `Funciona, pero el precio es visible.` : `El resultado llega, pero con una grieta.`;
    return [
      `${actor.name} trabaja sobre ${target} mientras ${motif}.`,
      `${fact.endsWith(".") ? fact : `${fact}.`}`,
      cost,
    ].join(" ");
  }

  // success
  const npcGesture = npc ? ` ${pick(npc.plausibleGestures.length > 0 ? npc.plausibleGestures : [`${npc.name} lo nota`], npc.id)}.` : "";
  return [
    `${actor.name} ${action.targetKind === "object" || action.targetKind === "clue" ? `trabaja sobre ${target} mientras ${motif}` : `actúa en el momento justo`}.`,
    `${fact.endsWith(".") ? fact : `${fact}.`}${npcGesture}`,
  ].join(" ");
}
