import { getDangerBand } from "./danger";
import type { Campaign, CampaignEnding, GameRoom } from "./types";

export type EndingType = "good" | "heroic" | "bittersweet" | "tragic" | "corrupt" | "false" | "secret";

export type EndingResolution = {
  shouldEnd: boolean;
  endingId: string | null;
  endingType: EndingType | null;
  title: string | null;
  narration: string | null;
  unlockedFutureHook: string | null;
  rewards: string[];
  losses: string[];
  persistentMarks: string[];
  plan?: EndingPlan;
};

// Epílogo composicional: cláusulas secuenciales derivadas del estado real de la partida.
// tier 1 = mejor final … tier 5 = peor. Las cláusulas se muestran/narran en orden.
export type EndingPlan = {
  endingId: string;
  title: string;
  tier: 1 | 2 | 3 | 4 | 5;
  tierLabel: string;
  clauses: string[];
};

export type EndingTurnResolution = {
  ok: boolean;
  turn: unknown;
  narration: string;
  npcDialogue: string;
  concreteChange: string;
  statePatch: unknown;
  nextOptions: unknown[];
  endingResolution: EndingResolution;
  control: { lockNormalActions: boolean; showEnding: boolean };
};

type EndingScore = Partial<Record<"truth" | "mercy" | "corruption" | "sacrifice" | "chaos" | "violence", number>>;
type RouteState = { id?: string; status?: string };
type DiscoveredClue = { id?: string; status?: string };
type InventoryObject = { state?: string };

type EndingDefinitionLike = CampaignEnding & {
  type?: EndingType;
  requires?: {
    confirmedClues?: string[];
    dangerMax?: number;
    objects?: string[];
  };
};

type CampaignLike = Pick<Campaign, "scenes" | "possibleEndings" | "rewards"> & {
  maxRounds?: number;
  walkthrough?: { finalSceneId?: string };
  endings?: EndingDefinitionLike[];
};

type GameStateLike = {
  currentSceneId: string;
  danger: number;
  round: number;
  routeStates?: Record<string, RouteState>;
  availableEndings?: string[];
  discoveredClues?: Record<string, DiscoveredClue>;
  sceneClocks?: Record<string, { currentTicks?: number; value?: number; maxTicks?: number; max?: number }>;
  endingScore?: EndingScore;
  inventory?: Record<string, InventoryObject>;
};

type LastActionLike = {
  statePatch?: { endingScoreDelta?: EndingScore };
};

const emptyEndingResolution: EndingResolution = {
  shouldEnd: false,
  endingId: null,
  endingType: null,
  title: null,
  narration: null,
  unlockedFutureHook: null,
  rewards: [],
  losses: [],
  persistentMarks: []
};

export function isFinalScene(campaign: CampaignLike, sceneId: string): boolean {
  const scene = campaign.scenes.find((candidate) => candidate.id === sceneId);
  const text = `${sceneId} ${scene?.title ?? ""} ${scene?.objective ?? ""}`.toLowerCase();
  return Boolean(
    (scene as { isFinal?: boolean } | undefined)?.isFinal === true ||
    text.includes("juicio") ||
    text.includes("final") ||
    campaign.walkthrough?.finalSceneId === sceneId ||
    campaign.scenes[campaign.scenes.length - 1]?.id === sceneId
  );
}

export function shouldResolveEnding(params: {
  campaign: CampaignLike;
  state: GameStateLike;
  lastAction: LastActionLike;
}): boolean {
  const isFinal = isFinalScene(params.campaign, params.state.currentSceneId);
  if (!isFinal) return false;

  const dangerBand = getDangerBand(params.state.danger);
  const routeStates = params.state.routeStates ?? {};
  const hasFinalRoute =
    routeStates["ruta_final"]?.status === "open" ||
    routeStates["secret_deep_truth"]?.status === "open" ||
    Object.values(routeStates).some((route) => route.status === "open" && (route.id?.includes("secret") || route.id?.includes("final"))) ||
    (params.state.availableEndings?.length ?? 0) > 0;

  const hasDecisiveClues = Object.values(params.state.discoveredClues ?? {})
    .filter((clue) => clue.status === "confirmed").length >= 3;

  const scoreDelta = params.lastAction.statePatch?.endingScoreDelta;
  const explicitFinalSignal = Boolean(scoreDelta?.truth || scoreDelta?.mercy || scoreDelta?.corruption || scoreDelta?.sacrifice);
  const clock = params.state.sceneClocks?.[params.state.currentSceneId];
  const currentTicks = clock?.currentTicks ?? clock?.value ?? 0;
  const maxTicks = clock?.maxTicks ?? clock?.max ?? Number.POSITIVE_INFINITY;

  return (
    params.state.round >= (params.campaign.maxRounds ?? 4) ||
    dangerBand === "critical" ||
    currentTicks >= maxTicks ||
    hasFinalRoute ||
    hasDecisiveClues ||
    explicitFinalSignal
  );
}

export function getEndingType(ending: Pick<CampaignEnding, "id"> & { type?: EndingType }): EndingType {
  if (ending.type) return ending.type;
  const id = ending.id.toLowerCase();
  if (id.includes("secret") || id.includes("bloodline")) return "secret";
  if (id.includes("tragic") || id.includes("purge") || id.includes("collapse")) return "tragic";
  if (id.includes("corrupt")) return "corrupt";
  if (id.includes("false")) return "false";
  if (id.includes("heroic") || id.includes("cost") || id.includes("cursed")) return "heroic";
  if (id.includes("good") || id.includes("saved") || id.includes("mercy")) return "good";
  return "bittersweet";
}

function scoreValue(score: EndingScore | undefined, key: keyof EndingScore): number {
  return score?.[key] ?? 0;
}

export function selectEnding(campaign: CampaignLike, state: GameStateLike): EndingDefinitionLike {
  const score = state.endingScore ?? {};
  const danger = state.danger;
  const endings = (campaign.endings?.length ? campaign.endings : campaign.possibleEndings) as EndingDefinitionLike[];
  const confirmedClues = Object.entries(state.discoveredClues ?? {})
    .filter(([, clue]) => clue.status === "confirmed")
    .map(([id, clue]) => clue.id ?? id);
  const objectStates = state.inventory ?? {};
  const routeStates = state.routeStates ?? {};

  const available = endings.filter((ending) => {
    const requires = ending.requires;
    if (!requires) return true;
    const cluesOk = (requires.confirmedClues ?? []).every((id) => confirmedClues.includes(id));
    const dangerOk = danger <= (requires.dangerMax ?? 10);
    const objectsOk = (requires.objects ?? []).every((id) => objectStates[id] && objectStates[id].state !== "perdido");
    return cluesOk && dangerOk && objectsOk;
  });
  const pool = available.length ? available : endings;
  const findByType = (type: EndingType) => pool.find((ending) => getEndingType(ending) === type) ?? endings.find((ending) => getEndingType(ending) === type);
  const routeSecretOpen = Object.entries(routeStates).some(([id, route]) => route.status === "open" && `${route.id ?? id}`.includes("secret"));

  const secret = pool.find((ending) => ending.id === "secret_deep_truth") ?? pool.find((ending) => getEndingType(ending) === "secret");
  if (secret && scoreValue(score, "truth") >= 3 && confirmedClues.length >= 3 && routeSecretOpen) return secret;
  if (scoreValue(score, "corruption") >= 2) return findByType("corrupt") ?? pool[0];
  if (danger >= 9 || scoreValue(score, "chaos") >= 4) return findByType("tragic") ?? pool[0];
  if (scoreValue(score, "truth") >= 3 && scoreValue(score, "mercy") >= 2) return findByType("good") ?? pool[0];
  if (scoreValue(score, "truth") >= 3 && scoreValue(score, "sacrifice") >= 1) return findByType("heroic") ?? pool[0];
  if (scoreValue(score, "truth") <= 1 && scoreValue(score, "violence") >= 2) return findByType("false") ?? pool[0];
  if (secret && confirmedClues.length >= 3 && routeSecretOpen) return secret;
  return findByType("bittersweet") ?? pool[0];
}

function confirmedClueStateFromRoom(room: GameRoom): Record<string, DiscoveredClue> {
  if (room.livingState?.discoveredClues) {
    return Object.fromEntries(Object.entries(room.livingState.discoveredClues)
      .filter(([, clue]) => clue.discovered)
      .map(([id, clue]) => [id, { id, status: clue.confirmed ? "confirmed" : "discovered" }]));
  }
  const clues = Array.from(new Set([...room.mysteryClues, ...room.memorySummary.clues]));
  return Object.fromEntries(clues.map((text, index) => [`clue-${index + 1}`, { id: `clue-${index + 1}`, status: "confirmed", text }]));
}

function routeStateFromRoom(room: GameRoom): Record<string, RouteState> {
  if (room.livingState?.routeStates) {
    return Object.fromEntries(Object.entries(room.livingState.routeStates).map(([id, route]) => [id, {
      id,
      status: route.status ?? (route.open ? "open" : route.blocked ? "blocked" : "hidden")
    }]));
  }
  const text = [
    ...room.storyFlags,
    ...room.mysteryClues,
    ...room.memorySummary.clues,
    room.memorySummary.currentTwist,
    room.narrativeMemory?.conclusions.currentTheory
  ].join(" ").toLowerCase();
  const routeStates: Record<string, RouteState> = {};
  if (text.includes("ruta final") || text.includes("ending_ready") || text.includes("final")) routeStates.ruta_final = { id: "ruta_final", status: "open" };
  if (text.includes("secret") || text.includes("secreto profundo") || text.includes("verdad bajo la verdad")) routeStates.secret_deep_truth = { id: "secret_deep_truth", status: "open" };
  return routeStates;
}

function endingScoreFromRoom(room: GameRoom): EndingScore {
  if (room.livingState?.endingScore) return room.livingState.endingScore;
  const text = [
    ...room.storyFlags,
    ...room.mysteryClues,
    ...room.memorySummary.clues,
    room.memorySummary.currentTwist,
    room.narrativeMemory?.conclusions.currentTheory
  ].join(" ").toLowerCase();
  return {
    truth: Math.min(4, room.mysteryClues.length + (text.includes("verdad") || text.includes("secreto") ? 1 : 0)),
    mercy: text.includes("misericordia") || text.includes("inocente") ? 2 : 0,
    corruption: text.includes("corrupt") ? 2 : 0,
    sacrifice: text.includes("coste") || text.includes("precio") ? 1 : 0,
    chaos: getDangerBand(room.dangerClock) === "critical" ? 4 : 0,
    violence: text.includes("ejecut") || text.includes("mata") ? 2 : 0
  };
}

const endingTierByType: Record<EndingType, { tier: EndingPlan["tier"]; label: string }> = {
  good: { tier: 1, label: "mejor final" },
  heroic: { tier: 2, label: "victoria con precio" },
  secret: { tier: 2, label: "verdad profunda" },
  bittersweet: { tier: 3, label: "salida agridulce" },
  false: { tier: 4, label: "resolución falsa" },
  corrupt: { tier: 4, label: "victoria corrupta" },
  tragic: { tier: 5, label: "final trágico" }
};

// Construye el epílogo por cláusulas secuenciales, todas derivadas de estado real:
// 1) veredicto (dato de campaña), 2) pruebas conocidas, 3) destino de cada NPC según
// vivo/confianza/hostilidad, 4) tono según endingScore dominante, 5) deuda/peligro final.
export function buildEndingPlan(room: GameRoom, ending: CampaignEnding, endingType: EndingType, losses: string[], futureHook: string | null): EndingPlan {
  const { tier, label } = endingTierByType[endingType] ?? endingTierByType.bittersweet;
  const clauses: string[] = [];

  clauses.push(`${ending.title}. ${ending.description}`);

  const knownTexts = new Set([...room.mysteryClues, ...room.memorySummary.clues]);
  const knownClues = room.campaign.clues.filter((clue) => knownTexts.has(clue.text) || (clue.label && knownTexts.has(clue.label)));
  if (knownClues.length) {
    clauses.push(`Lo que quedó probado: ${knownClues.slice(-3).map((clue) => clue.label ?? clue.text).join("; ")}.`);
  } else {
    clauses.push("El caso cierra sin pruebas firmes: la versión oficial sobrevive a la verdad.");
  }

  const npcStates = room.livingState?.npcStates ?? {};
  const npcClauses: string[] = [];
  for (const npc of room.campaign.npcs) {
    const state = npcStates[npc.id];
    const name = npc.name.split(",")[0];
    if (state?.alive === false) npcClauses.push(`${name} no vio el final de esta historia.`);
    else if ((state?.hostility ?? 0) >= 2) npcClauses.push(`${name} no olvida lo que el grupo le costó.`);
    else if ((state?.trust ?? 0) >= 2) npcClauses.push(`${name} queda del lado del grupo, y lo dirá cuando importe.`);
    if (npcClauses.length >= 3) break;
  }
  clauses.push(...npcClauses);

  const score = room.livingState?.endingScore ?? {};
  const dominant = (Object.entries(score) as Array<[string, number]>).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
  const toneByScore: Record<string, string> = {
    truth: "El grupo eligió la verdad por encima de la comodidad, y esa elección tiene testigos.",
    mercy: "Hubo espacio para la misericordia donde la ley solo pedía un culpable.",
    sacrifice: "Alguien pagó de su bolsillo lo que la historia necesitaba para cerrar.",
    corruption: "Algo se compró en el camino, y las deudas compradas siempre cobran interés.",
    chaos: "El desorden que abrieron no se cierra con el telón: alguien lo heredará."
  };
  if (dominant && toneByScore[dominant]) clauses.push(toneByScore[dominant]);

  if (losses[0]) clauses.push(losses[0]);
  if (futureHook) clauses.push(futureHook);

  return { endingId: ending.id, title: ending.title, tier, tierLabel: label, clauses };
}

export function resolveEndingForRoom(room: GameRoom): EndingResolution {
  const scene = room.campaign.scenes[room.currentSceneIndex];
  if (!scene) return emptyEndingResolution;
  const state: GameStateLike = {
    currentSceneId: scene.id,
    danger: room.dangerClock,
    round: room.roundInScene,
    routeStates: routeStateFromRoom(room),
    availableEndings: room.narrativeMemory?.conclusions.possibleEndings ?? room.campaign.possibleEndings.map((ending) => ending.id),
    discoveredClues: confirmedClueStateFromRoom(room),
    sceneClocks: { [scene.id]: { currentTicks: room.sceneProgress, maxTicks: 2.5 } },
    endingScore: endingScoreFromRoom(room),
    inventory: room.livingState?.inventory ?? Object.fromEntries(room.players.flatMap((player) => player.temporaryItems.map((item) => [item, { state: "intacto" }])))
  };
  const lastAction: LastActionLike = { statePatch: { endingScoreDelta: state.endingScore } };
  if (!shouldResolveEnding({ campaign: { ...room.campaign, maxRounds: room.sessionConfig.maxRoundsPerScene }, state, lastAction })) return emptyEndingResolution;

  const ending = selectEnding(room.campaign, state);
  const endingType = getEndingType(ending);
  const rewards = room.campaign.rewards.map((reward) => reward.name);
  const losses = endingType === "tragic"
    ? ["La crisis se cobra una vida, una verdad o la confianza de quienes quedaban."]
    : endingType === "heroic"
      ? ["La victoria exige un precio persistente para el grupo."]
      : endingType === "secret"
        ? ["La verdad pública queda incompleta: debajo aparece una deuda más antigua."]
        : [];
  const persistentMarks = endingType === "secret"
    ? ["Secreto profundo desbloqueado"]
    : endingType === "corrupt"
      ? ["Marca de corrupción"]
      : rewards;
  const unlockedFutureHook = endingType === "secret"
    ? "Una capa más profunda queda abierta para una campaña futura."
    : null;

  const plan = buildEndingPlan(room, ending, endingType, losses, unlockedFutureHook);
  return {
    shouldEnd: true,
    endingId: ending.id,
    endingType,
    title: ending.title,
    narration: plan.clauses.join("\n\n"),
    unlockedFutureHook,
    rewards,
    losses,
    persistentMarks,
    plan
  };
}
