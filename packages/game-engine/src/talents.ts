import type { GameRoom, StatKey, Talent, TalentId } from "./types";

// Catálogo único de talentos. El motor es la verdad: acá viven las afinidades
// (bono pasivo a checks del stat afín) y el efecto activo 1/escena. La UI y el
// narrador leen de acá; character-assets.ts solo aporta la imagen.
export const talents: readonly Talent[] = [
  {
    id: "flame",
    name: "Fulgor",
    tagline: "Ímpetu que arrasa lo que se le cruza.",
    affinities: ["body", "courage"],
    passiveBonus: 1,
    passiveDescription: "Tu ímpetu suma a todo lo que exige cuerpo o coraje.",
    activeName: "Embestida",
    activeDescription: "Una arremetida feroz: cargás con todo y el golpe llega donde tiene que llegar.",
    activeEffect: { bonus: 4 }
  },
  {
    id: "shield",
    name: "Custodia",
    tagline: "El muro que no cede cuando todo empuja.",
    affinities: ["focus", "body"],
    passiveBonus: 1,
    passiveDescription: "Tu aguante suma a todo lo que exige foco o cuerpo.",
    activeName: "Muro",
    activeDescription: "Plantás los pies y sostenés la línea: el peligro rebota contra vos sin escalar.",
    activeEffect: { bonus: 2, negateDanger: true }
  },
  {
    id: "arcane",
    name: "Arcano",
    tagline: "Un instante de presciencia antes del gesto.",
    affinities: ["mind", "creativity"],
    passiveBonus: 1,
    passiveDescription: "Tu lucidez suma a todo lo que exige mente o creatividad.",
    activeName: "Presciencia",
    activeDescription: "Ves el desenlace un segundo antes y corregís el gesto: lo que iba a salir mal, sale mejor.",
    activeEffect: { bonus: 1, liftOutcome: true }
  },
  {
    id: "verdant",
    name: "Vínculo",
    tagline: "Nunca actuás sola: el lazo responde.",
    affinities: ["charm", "luck"],
    passiveBonus: 1,
    passiveDescription: "Tu vínculo suma a todo lo que exige carisma o suerte.",
    activeName: "Llamado",
    activeDescription: "Tirás del lazo y algo (o alguien) acude en tu favor justo a tiempo.",
    activeEffect: { bonus: 3 }
  }
] as const;

export const DEFAULT_TALENT_ID: TalentId = "flame";

export function getTalent(id: string | undefined | null): Talent | undefined {
  if (!id) return undefined;
  return talents.find((t) => t.id === id);
}

// Bono pasivo aplicable a ESTE check: solo si el stat elegido es afín al talento.
export function talentPassiveBonus(talent: Talent | undefined, selectedStat: StatKey): number {
  if (!talent) return 0;
  return talent.affinities.includes(selectedStat) ? talent.passiveBonus : 0;
}

// El activo es 1/escena por jugador: disponible si no hay ningún evento de esta
// escena y este actor que ya lo haya activado.
export function isTalentAvailable(room: GameRoom, playerId: string, sceneId: string): boolean {
  return !room.sessionLog.some(
    (event) => event.sceneId === sceneId && event.playerId === playerId && event.talentActivated
  );
}
