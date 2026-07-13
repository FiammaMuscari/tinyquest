import type { Character, StatKey } from "./types";

const portraitStatOrder: StatKey[] = ["body", "mind", "charm", "creativity", "courage", "focus", "luck"];
export const HERO_PORTRAIT_IDENTITY_VERSION = "hero-v21";

function dominantStat(character: Character): StatKey {
  return portraitStatOrder.reduce((best, stat) => character.stats[stat] > character.stats[best] ? stat : best, portraitStatOrder[0]);
}

/** Firma de todas y solo las opciones que realmente alimentan el prompt del
 * avatar. Cambiar mascota o stats no dominantes no ensucia el par visual. */
export function heroPortraitIdentityKey(character: Character): string {
  return [
    HERO_PORTRAIT_IDENTITY_VERSION,
    character.name,
    character.species,
    character.role,
    character.concept,
    dominantStat(character),
    character.look?.gender,
    character.look?.skinTone,
    character.look?.eyeColor,
    character.look?.hairColor,
    character.look?.hairLength,
    character.look?.scar ?? "sin cicatrices"
  ].map((value) => value?.trim().toLocaleLowerCase() ?? "").join("|");
}

export function heroPortraitNeedsRefresh(character: Character): boolean {
  return !character.look?.faceUrl || !character.look?.fullBodyUrl || character.look.portraitIdentity !== heroPortraitIdentityKey(character);
}
