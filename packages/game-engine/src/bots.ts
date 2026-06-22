import { canPayActionEnergy } from "./action-costs";
import { buildBotActionFromIntent, chooseBotEmotion, chooseBotIntent, getBotPersonalityProfile } from "./bot-personality";
import { createCharacter } from "./character";
import { getCurrentScene, getVisibleActionChoices } from "./room-state";
import type { BotPlayer, GameRoom, Scene, StatKey, WorldTheme } from "./types";

const botNames = ["Belo", "Miri", "Toc"];
const botAvatars = ["/assets/avatars/avatar-3.webp", "/assets/avatars/avatar-4.webp", "/assets/avatars/avatar-5.webp"];
const concepts = [
  "un guardia que sospecha de toda invitación noble",
  "una vidente que escucha fantasmas en las cerraduras",
  "un explorador con una reliquia viva y miedo secreto a las traiciones"
];

export function createBotPlayers(count = 2): BotPlayer[] {
  return botNames.slice(0, count).map((name, index) => ({
    id: `bot-${index + 1}`,
    name,
    type: "bot",
    character: createCharacter({
      name,
      role: index === 0 ? "Guardia del Umbral" : index === 1 ? "Oráculo de Almas" : "Cerrajera de Ruinas",
      species: index === 0 ? "Humano de Juramento" : index === 1 ? "Elfo del Velo" : "Mediano del Camino",
      concept: concepts[index],
      avatarUrl: botAvatars[index]
    }),
    temporaryItems: []
  }));
}

export function chooseBotStat(bot: BotPlayer, scene: Scene): StatKey {
  return [...scene.allowedStats].sort((a, b) => bot.character.stats[b] - bot.character.stats[a])[0];
}

export type BotActionDecision = {
  label: string;
  intent: string;
  suggestedStat: StatKey;
  reason: string;
  allowedByState: boolean;
};

export function chooseBotAction(gameState: GameRoom, bot: BotPlayer): BotActionDecision {
  const scene = getCurrentScene(gameState);
  if (bot.status === "dead" || bot.character.vitality <= 0) {
    return { label: `${bot.name} no puede actuar.`, intent: "none", suggestedStat: "courage", reason: "El bot está caído o muerto.", allowedByState: false };
  }
  const options = getVisibleActionChoices(scene, gameState).filter((option) => canPayActionEnergy(bot.character.energy, option));
  const personalityIntent = chooseBotIntent(bot, gameState, scene);
  const personalityEmotion = chooseBotEmotion(bot, gameState, scene);
  const profile = getBotPersonalityProfile(bot.id || bot.name);
  const crisis = gameState.dangerClock >= 10 || gameState.phase === "climax";
  const coherentOptions = crisis
    ? options.filter((option) => option.id.startsWith("crisis-") || option.category === "defend" || option.category === "fight" || option.actionType === "revelar_prueba")
    : options;
  const role = bot.character.role.toLowerCase();
  const protective = profile.name === "Belo" || role.includes("guardia") || bot.character.concept.toLowerCase().includes("protege");
  const mystical = profile.name === "Miri" || role.includes("oráculo") || bot.character.concept.toLowerCase().includes("fantasma");
  const defend = coherentOptions.find((option) => option.category === "defend" || option.intent === "protect");
  const fight = coherentOptions.find((option) => option.category === "fight" || option.intent === "fight");
  const talk = coherentOptions.find((option) => option.category === "talk" || option.intent === "talk");
  const investigate = coherentOptions.find((option) => option.category === "investigate" || option.intent === "investigate" || (mystical && option.intent === "magic"));
  const evidenceProtect = coherentOptions.find((option) => /carta|grillete|sello|campana|prueba|evidencia/i.test(`${option.label} ${option.action}`));
  const preferred = (crisis && protective ? defend : undefined) ?? (crisis ? (fight ?? talk ?? defend) : undefined) ?? (protective ? defend : undefined) ?? (mystical ? investigate : undefined) ?? investigate ?? talk ?? fight ?? coherentOptions[0];
  const personalityPreferred = profile.name === "Belo"
    ? ((gameState.dangerClock >= 4 ? defend : undefined) ?? (personalityIntent === "confront" ? talk : undefined) ?? defend)
    : profile.name === "Miri"
      ? (evidenceProtect ?? investigate ?? talk)
      : undefined;
  const finalPreferred = personalityPreferred ?? preferred;
  if (!finalPreferred) {
    return { label: buildBotActionFromIntent(bot, personalityIntent, personalityEmotion, { scene }), intent: personalityIntent, suggestedStat: "courage", reason: "No hay acción visible pagable; usa personalidad.", allowedByState: true };
  }
  return {
    label: finalPreferred.action,
    intent: personalityIntent,
    suggestedStat: finalPreferred.recommendedStats[0] ?? chooseBotStat(bot, scene),
    reason: `${profile.name} actúa como ${profile.archetype}: ${personalityIntent}/${personalityEmotion}.`,
    allowedByState: true
  };
}

export function chooseVisibleBotAction(bot: BotPlayer, scene: Scene, room: GameRoom): string {
  const decision = chooseBotAction(room, bot);
  if (decision.allowedByState) return decision.label;
  const options = getVisibleActionChoices(scene, room).filter((option) => canPayActionEnergy(bot.character.energy, option));
  const role = bot.character.role.toLowerCase();
  const concept = bot.character.concept.toLowerCase();
  const protective = role.includes("guardia") || concept.includes("guardia") || concept.includes("protege");
  const impulsive = concept.includes("arriesgada") || concept.includes("miedo secreto");
  const highDanger = room.dangerClock >= 7;
  const combatActive = Boolean(scene.hasCombat) || scene.danger.toLowerCase().includes("combate");
  const unlockedByClue = options.find((option) => option.requiredClues?.length || option.requiredFlags?.some((flag) => room.storyFlags.includes(flag)));
  const defend = options.find((option) => option.category === "defend" || option.intent === "protect");
  const fight = options.find((option) => option.category === "fight" || option.intent === "fight");
  const flee = options.find((option) => option.category === "escape" || option.intent === "flee");
  const talk = options.find((option) => option.category === "talk" || option.intent === "talk");
  const investigate = options.find((option) => option.category === "investigate" || option.intent === "investigate" || option.intent === "magic");
  const pet = options.find((option) => option.category === "pet" || option.intent === "pet");
  const preferred =
    (combatActive && protective ? defend : undefined) ??
    (combatActive && impulsive ? fight : undefined) ??
    (combatActive ? (fight ?? defend) : undefined) ??
    (highDanger ? (defend ?? flee ?? talk) : undefined) ??
    unlockedByClue ??
    investigate ??
    talk ??
    pet ??
    options[0];
  if (!preferred) return `${bot.name} observa la escena y ayuda al grupo sin tomar riesgos innecesarios.`;
  return preferred.action;
}

export function generateBotAction(bot: BotPlayer, scene: Scene, stat: StatKey, theme?: WorldTheme): string {
  const risky = Math.random() > 0.72;
  const motif = theme?.toneTags[0] ?? "misterio";
  if (risky) {
    return `${bot.name} intenta una maniobra arriesgada usando ${stat}: convertir ${motif} en ventaja antes de que el peligro suba.`;
  }
  const choice = scene.actionChoices[0];
  return `${bot.name} elige "${choice.label}" y usa ${stat} siguiendo el tono de ${theme?.title ?? "la aventura"}: ${scene.objective.toLowerCase()}.`;
}
