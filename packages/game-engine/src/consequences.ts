import { rollDie } from "./dice";
import type { ConsequenceResult } from "./types";

const table = [
  "Pierdes 1 energia: el esfuerzo deja a tu personaje sin aire en el peor momento.",
  "Peligro +2: una patrulla, trampa o testigo hostil gana posicion.",
  "La ruta cambia: el acceso directo queda cerrado y obliga a buscar otra entrada.",
  "La prueba queda incompleta: sirve para sospechar, pero no alcanza para acusar sin otro paso.",
  "Un objeto clave se rompe; conserva valor como prueba, pero ya no sirve como herramienta.",
  "La amenaza gana tiempo: se aleja, deja un rastro y obliga a elegir entre perseguir o proteger la escena."
];

export function rollConsequence(): ConsequenceResult {
  const roll = rollDie("d6");
  return {
    roll,
    text: table[roll.value - 1],
    dangerDelta: roll.value === 2 || roll.value === 6 ? 1 : 0,
    energyDelta: roll.value === 1 ? -1 : 0,
    vitalityDelta: roll.value === 5 ? -1 : 0,
    clue: roll.value === 4 ? "La prueba necesita una segunda confirmacion." : undefined
  };
}
