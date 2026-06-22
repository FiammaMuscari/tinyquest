import type { BotPlayer, GameRoom, Scene, SceneActionChoice } from "./types";
import type { ResolutionPlan } from "./resolution-plan";

export type BotIntent = "protect" | "investigate" | "confront" | "distract" | "comfort" | "doubt" | "retreat" | "accuse" | "guard" | "observe";
export type BotEmotion = "afraid" | "angry" | "guilty" | "loyal" | "suspicious" | "desperate" | "calm" | "focused";

export interface BotPersonalityProfile {
  botId: string;
  name: string;
  archetype: string;
  personality: string;
  fear: string;
  desire: string;
  speechStyle: string;
  defaultIntent: BotIntent;
  defaultEmotion: BotEmotion;
  actionBiases: BotIntent[];
  relationships: Record<string, { trust: number; tension: number; note: string }>;
}

export interface BotMemoryState {
  botId: string;
  seenClueIds: string[];
  suspectedNpcIds: string[];
  protectedNpcIds: string[];
  lastEmotion: BotEmotion;
  lastIntent: BotIntent;
  lastImportantMoment?: string;
}

export type CompanionMomentLike = {
  characterId: string;
  characterName: string;
  action: string;
  emotion: string;
  relevance: "minor" | "major";
  botIntent?: BotIntent;
  botEmotion?: BotEmotion;
  dialogue?: string;
};

const belo: BotPersonalityProfile = {
  botId: "bot-1",
  name: "Belo",
  archetype: "protector",
  personality: "frontal, leal, físico; entiende el peligro antes que las pruebas",
  fear: "que ejecuten a un inocente por demora",
  desire: "mantener vivo a Nicolás hasta que aparezca la verdad",
  speechStyle: "frases cortas, firmes",
  defaultIntent: "protect",
  defaultEmotion: "loyal",
  actionBiases: ["protect", "guard", "confront"],
  relationships: {
    fiamy: { trust: 7, tension: 2, note: "Sigue a Fiamy si Fiamy actúa con decisión." },
    "accused-wolf": { trust: 5, tension: 1, note: "No sabe si Nicolás es inocente, pero no tolera el linchamiento." },
    nicolas: { trust: 5, tension: 1, note: "Lo protege hasta tener una prueba justa." }
  }
};

const miri: BotPersonalityProfile = {
  botId: "bot-2",
  name: "Miri",
  archetype: "investigadora",
  personality: "observadora, desconfiada, rápida para notar contradicciones",
  fear: "que una prueba se contamine o desaparezca",
  desire: "encontrar una contradicción material",
  speechStyle: "precisa, seca",
  defaultIntent: "investigate",
  defaultEmotion: "focused",
  actionBiases: ["investigate", "observe", "doubt"],
  relationships: {
    fiamy: { trust: 6, tension: 3, note: "Confía si Fiamy protege evidencias antes de acusar." },
    "accused-wolf": { trust: 3, tension: 4, note: "No defiende a Nicolás por fe: busca pruebas." },
    nicolas: { trust: 3, tension: 4, note: "Lo preserva como acusado, no como amigo." }
  }
};

export const BOT_PERSONALITY_PROFILES: BotPersonalityProfile[] = [belo, miri];

export function getBotPersonalityProfile(botIdOrName: string): BotPersonalityProfile {
  const key = botIdOrName.toLowerCase();
  return BOT_PERSONALITY_PROFILES.find((profile) => profile.botId === botIdOrName || profile.name.toLowerCase() === key) ?? {
    botId: botIdOrName,
    name: botIdOrName,
    archetype: "apoyo",
    personality: "cauto y colaborador",
    fear: "perder al grupo",
    desire: "ayudar sin romper la escena",
    speechStyle: "breve",
    defaultIntent: "observe",
    defaultEmotion: "calm",
    actionBiases: ["observe", "comfort"],
    relationships: {}
  };
}

export function getBotMemory(memory: Record<string, BotMemoryState> | undefined, botId: string): BotMemoryState {
  const profile = getBotPersonalityProfile(botId);
  return memory?.[botId] ?? { botId, seenClueIds: [], suspectedNpcIds: [], protectedNpcIds: [], lastEmotion: profile.defaultEmotion, lastIntent: profile.defaultIntent };
}

function unique(values: string[]) { return Array.from(new Set(values.filter(Boolean))); }

export function updateBotMemoryAfterTurn(memory: Record<string, BotMemoryState>, turn: { structuredNarration?: { clueReveals?: Array<{ clueId: string }>; dialogue?: Array<{ speakerId: string; intention?: string }> }; unlockedClues?: string[]; action?: string; consequenceText?: string; playerName?: string }) {
  const next = { ...memory };
  for (const profile of BOT_PERSONALITY_PROFILES) {
    const current = getBotMemory(next, profile.botId);
    const text = `${turn.action ?? ""} ${turn.consequenceText ?? ""}`.toLowerCase();
    const seen = [...(turn.unlockedClues ?? []), ...(turn.structuredNarration?.clueReveals?.map((clue) => clue.clueId) ?? [])];
    const suspected = (turn.structuredNarration?.dialogue ?? []).filter((line) => /mentir|dudar|acusar|contradic/i.test(line.intention ?? "")).map((line) => line.speakerId);
    const protectedIds = /nicolás|nicolas|accused-wolf/.test(text) && /protege|proteger|pedrada|turba|piedra/.test(text) ? ["accused-wolf"] : [];
    next[profile.botId] = { ...current, seenClueIds: unique([...current.seenClueIds, ...seen]), suspectedNpcIds: unique([...current.suspectedNpcIds, ...suspected]), protectedNpcIds: unique([...current.protectedNpcIds, ...protectedIds]), lastImportantMoment: turn.consequenceText ?? current.lastImportantMoment };
  }
  return next;
}

function sceneHasNicolasRisk(state: Pick<GameRoom, "dangerClock" | "phase">, scene?: Scene, plan?: ResolutionPlan) {
  const text = `${scene?.title ?? ""} ${scene?.objective ?? ""} ${scene?.danger ?? ""} ${plan?.actionText ?? ""} ${plan?.consequence.summary ?? ""}`.toLowerCase();
  return /nicolás|nicolas|acusado|pedrada|turba|ejecución|ejecucion/.test(text) || (state.dangerClock ?? 0) >= 6;
}

function evidenceAtRisk(scene?: Scene, plan?: ResolutionPlan) {
  const text = `${scene?.title ?? ""} ${scene?.objective ?? ""} ${plan?.actionText ?? ""} ${plan?.consequence.summary ?? ""}`.toLowerCase();
  return /prueba|carta|grillete|campana|sello|mordida|herida|cuerda|contamina|toca|alterar|desaparece/.test(text) || Boolean(plan?.validContext.availableClueIds.length);
}

export function chooseBotIntent(bot: BotPlayer | { id: string; name: string }, state: GameRoom, scene: Scene, plan?: ResolutionPlan): BotIntent {
  const profile = getBotPersonalityProfile(bot.id || bot.name);
  if (profile.name === "Belo") {
    if (sceneHasNicolasRisk(state, scene, plan)) return "protect";
    if ((state.dangerClock ?? 0) >= 4) return "guard";
    return "confront";
  }
  if (profile.name === "Miri") {
    if (evidenceAtRisk(scene, plan)) return "investigate";
    if ((plan?.npcDirectives ?? []).some((npc) => npc.canSpeak)) return "doubt";
    return "observe";
  }
  return profile.defaultIntent;
}

export function chooseBotEmotion(bot: BotPlayer | { id: string; name: string }, state: GameRoom, scene: Scene, plan?: ResolutionPlan): BotEmotion {
  const profile = getBotPersonalityProfile(bot.id || bot.name);
  if ((state.dangerClock ?? 0) >= 8 || plan?.roll.result === "failure") return profile.name === "Belo" ? "desperate" : "afraid";
  if (profile.name === "Belo") return sceneHasNicolasRisk(state, scene, plan) ? "loyal" : "angry";
  if (profile.name === "Miri") return evidenceAtRisk(scene, plan) ? "focused" : "suspicious";
  return profile.defaultEmotion;
}

export function buildBotActionFromIntent(bot: BotPlayer | { id: string; name: string }, intent: BotIntent, emotion: BotEmotion, context: { scene?: Scene; plan?: ResolutionPlan; options?: SceneActionChoice[] } = {}) {
  const profile = getBotPersonalityProfile(bot.id || bot.name);
  const name = profile.name;
  const option = context.options?.find((choice) => {
    if (intent === "protect" || intent === "guard") return choice.category === "defend" || choice.intent === "protect";
    if (intent === "investigate" || intent === "observe") return choice.category === "investigate" || choice.intent === "investigate";
    if (intent === "confront" || intent === "doubt" || intent === "accuse") return choice.category === "talk" || choice.intent === "talk";
    return false;
  });
  if (option) return option.action;
  if (name === "Belo" && (intent === "protect" || intent === "guard")) return `${name} se planta delante de Nicolás y mira las manos de la turba, no la prueba.`;
  if (name === "Belo" && intent === "confront") return `${name} enfrenta a Roldán con voz baja y cuerpo firme para que nadie toque a Nicolás.`;
  if (name === "Miri" && intent === "investigate") return `${name} revisa la prueba sin moverla y busca la contradicción material.`;
  if (name === "Miri" && intent === "doubt") return `${name} clava la mirada en el testigo y marca la frase que no encaja.`;
  if (name === "Miri" && (intent === "guard" || intent === "observe")) return `${name} protege la evidencia con el cuerpo ladeado y observa quién intenta acercarse.`;
  return `${name} actúa con intención ${intent} y emoción ${emotion} sin abandonar al grupo.`;
}

export function buildCompanionMoment(bot: BotPlayer | { id: string; name: string }, intent: BotIntent, emotion: BotEmotion, plan?: ResolutionPlan): CompanionMomentLike {
  const profile = getBotPersonalityProfile(bot.id || bot.name);
  const action = buildBotActionFromIntent(bot, intent, emotion, { plan });
  const dialogue = profile.name === "Belo" ? (intent === "protect" ? "Atrás. Primero respira." : "Decilo de frente.") : profile.name === "Miri" ? (intent === "investigate" ? "No toquen eso." : "Esa frase no cierra.") : "Sigo mirando.";
  return { characterId: profile.botId, characterName: profile.name, action, emotion, relevance: intent === "protect" || intent === "investigate" ? "major" : "minor", botIntent: intent, botEmotion: emotion, dialogue };
}

export function validateBotPersonalityConsistency(botMoment: CompanionMomentLike, profile: BotPersonalityProfile = getBotPersonalityProfile(botMoment.characterId)) {
  const issues: string[] = [];
  const text = `${botMoment.action} ${botMoment.dialogue ?? ""}`.toLowerCase();
  if (/ayuda al grupo|hace algo|se mantiene cerca/.test(text)) issues.push("BOT_GENERIC_MOMENT");
  if (profile.name === "Belo" && /analiza|deduce|calcula|compara la mordida|lee la tinta|examina fino/.test(text)) issues.push("BOT_ROLE_DRIFT");
  if (profile.name === "Miri" && /se planta delante de nicolás|recibe la pedrada|empuja a la turba|tanquea|carga contra/.test(text)) issues.push("BOT_ROLE_DRIFT");
  if (botMoment.botIntent && !profile.actionBiases.includes(botMoment.botIntent) && !(profile.name === "Belo" && botMoment.botIntent === "confront") && !(profile.name === "Miri" && botMoment.botIntent === "doubt")) issues.push("BOT_PERSONALITY_MISMATCH");
  return issues;
}
