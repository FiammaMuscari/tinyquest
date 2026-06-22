import { getDangerBand } from "./danger";
import type { CampaignEnding, GameRoom } from "./types";

export function determineEnding(room: GameRoom): CampaignEnding | undefined {
  const endings = room.campaign.possibleEndings;
  if (!endings.length) return undefined;
  const flags = new Set(room.storyFlags);

  const byId = (id: string) => endings.find((ending) => ending.id === id);
  if (flags.has("forgery_proved") && flags.has("innocent_defended")) return byId("saved-wolf") ?? endings[0];
  if (flags.has("blood_debt_known") || flags.has("moon_magic_traced")) return byId("secret-bloodline") ?? byId("cursed-truth") ?? endings[0];
  if (getDangerBand(room.dangerClock) === "critical") return byId("tragic-purge") ?? endings[endings.length - 1];
  if (room.sceneProgress >= 2.5) return endings[0];
  return endings.find((ending) => ending.id.includes("neutral")) ?? endings[0];
}
