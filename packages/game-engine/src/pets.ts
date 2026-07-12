import type { LegendaryPet } from "./types";

export const legendaryPets: LegendaryPet[] = [
  {
    id: "none",
    name: "Sin mascota",
    species: "ninguna",
    description: "Empezás sin compañera animal. Una criatura puede vincularse más adelante si la historia lo merece.",
    passiveAbility: "Sin bonus pasivo de mascota.",
    activeAbility: "No hay mascota disponible todavía.",
    preferredStat: "focus",
    cooldownTurns: 0
  },
  {
    id: "soul-wyrm",
    name: "Alma Dracónica",
    species: "espíritu dracónico menor",
    description: "Una llama con memoria de dragón que huele mentiras, miedo y juramentos rotos.",
    passiveAbility: "+1 narrativo para resistir fuego, miedo o presencia dracónica.",
    activeAbility: "Aliento del Pacto: agrega +1d4 si la acción usa coraje, fuego o vínculo.",
    preferredStat: "courage",
    cooldownTurns: 2
  },
  {
    id: "grave-moth",
    name: "Polilla de Cripta",
    species: "mensajera feérica de tumbas",
    description: "Detecta maldiciones y nombres borrados en piedra antigua.",
    passiveAbility: "Revela si una pista tiene magia, trampa o mentira noble.",
    activeAbility: "Polvo de Cripta: agrega +1d4 a investigar, purificar o revelar.",
    preferredStat: "mind",
    cooldownTurns: 2
  },
  {
    id: "threshold-hound",
    name: "Sabueso del Umbral",
    species: "guardián espectral de caminos",
    description: "Un compañero de sombra leal que gruñe cuando una traición está cerca.",
    passiveAbility: "Una vez por escena detecta emboscadas, trampas o intenciones falsas.",
    activeAbility: "Mordida Umbral: agrega +1d4 a escapar, rastrear o intimidar.",
    preferredStat: "luck",
    cooldownTurns: 2
  }
];

export function defaultPet() {
  return legendaryPets[0];
}

