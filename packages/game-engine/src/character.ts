import { roles } from "./roles";
import { species } from "./species";
import { createAbilityProgression } from "./abilities";
import { defaultPet, legendaryPets } from "./pets";
import { baseStats, clampStats, deriveValues } from "./stats";
import type { Character, Stats } from "./types";

function addStatBonus(stats: Stats, bonus: Partial<Stats>): Stats {
  const next = { ...stats };
  for (const [key, value] of Object.entries(bonus)) {
    next[key as keyof Stats] = (next[key as keyof Stats] ?? 0) + (value ?? 0);
  }
  return next;
}

export function createCharacter(input: Partial<Character> = {}): Character {
  const selectedSpecies = species.find((item) => item.name === input.species) ?? species[0];
  const selectedRole = roles.find((item) => item.name === input.role) ?? roles[0];
  const selectedPet = input.pet ? (legendaryPets.find((pet) => pet.id === input.pet?.id) ?? input.pet) : defaultPet();
  // Si el llamador ya trae stats propios, respetarlos tal cual. Si no, partimos del
  // molde base y SUMAMOS el statBonus de la especie (antes declarado pero nunca aplicado).
  // El molde gasta 7 de los 8 puntos de forja a propósito: el 8º lo aporta el linaje,
  // así el bonus de especie entra sin pasarse del presupuesto (antes daba 9/8 → −1).
  const rolledStats: Stats = input.stats
    ? { ...baseStats, ...(input.stats as Partial<Stats>) }
    : addStatBonus({ ...baseStats, mind: 3, charm: 2, creativity: 2, courage: 2, focus: 2, luck: 2 }, selectedSpecies.statBonus);
  const stats = clampStats(rolledStats);
  const derived = deriveValues(stats);

  return {
    name: input.name ?? "Fiamy",
    species: selectedSpecies.name,
    role: selectedRole.name,
    concept: input.concept ?? "una aventurera marcada por un juramento antiguo",
    visualStyle: input.visualStyle ?? "fantasía dungeon, luz de luna, tesoros, niebla y acero",
    personalityTraits: input.personalityTraits ?? ["curiosa", "dramática", "ingeniosa"],
    specialAbility: input.specialAbility ?? selectedRole.specialAbility,
    weakness: input.weakness ?? selectedSpecies.quirk,
    groupRole: input.groupRole ?? selectedRole.playstyle,
    avatarUrl: input.avatarUrl ?? "/assets/avatars/avatar-1.webp",
    look: input.look ? { avatarShot: "fullbody", ...input.look } : input.look,
    stats,
    ...derived,
    pet: selectedPet,
    abilityProgression: input.abilityProgression ?? createAbilityProgression(selectedRole),
    ...(input.talent ? { talent: input.talent } : {})
  };
}
