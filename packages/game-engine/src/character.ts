import { roles } from "./roles";
import { species } from "./species";
import { createAbilityProgression } from "./abilities";
import { defaultPet, legendaryPets } from "./pets";
import { baseStats, clampStats, deriveValues } from "./stats";
import type { Character, Stats } from "./types";

export function createCharacter(input: Partial<Character> = {}): Character {
  const selectedSpecies = species.find((item) => item.name === input.species) ?? species[0];
  const selectedRole = roles.find((item) => item.name === input.role) ?? roles[0];
  const selectedPet = input.pet ? (legendaryPets.find((pet) => pet.id === input.pet?.id) ?? input.pet) : defaultPet();
  const stats = clampStats({
    ...baseStats,
    mind: 3,
    charm: 2,
    creativity: 3,
    courage: 2,
    focus: 2,
    luck: 2,
    ...(input.stats as Partial<Stats>)
  });
  const derived = deriveValues(stats);

  return {
    name: input.name ?? "Fiamy",
    species: selectedSpecies.name,
    role: selectedRole.name,
    concept: input.concept ?? "una aventurera marcada por un juramento antiguo y seguida por un Alma Dracónica",
    visualStyle: input.visualStyle ?? "fantasía dungeon, luz de luna, tesoros, niebla y acero",
    personalityTraits: input.personalityTraits ?? ["curiosa", "dramática", "ingeniosa"],
    specialAbility: input.specialAbility ?? selectedRole.specialAbility,
    weakness: input.weakness ?? selectedSpecies.quirk,
    groupRole: input.groupRole ?? selectedRole.playstyle,
    avatarUrl: input.avatarUrl ?? "/assets/avatars/avatar-1.webp",
    stats,
    ...derived,
    pet: selectedPet,
    abilityProgression: input.abilityProgression ?? createAbilityProgression(selectedRole)
  };
}

