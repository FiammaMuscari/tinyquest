import type { GameRoom } from "./types";

/** Momento narrativo estable que justifica una imagen nueva. No usa IO ni texto
 * del LLM como verdad: deriva solo de hechos que el motor ya confirmó. */
export function sceneImageBeat(room: GameRoom): string | null {
  const scene = room.campaign.scenes[room.currentSceneIndex];
  if (!scene) return null;
  if (room.sessionComplete) return `Final de la historia: ${room.finalEnding?.title ?? "el destino queda sellado"}.`;

  // Cada turno produce un fact `event`; usarlo aquí regeneraba una imagen por
  // tirada aunque el tableau siguiera igual. Solo pista nueva o combate visible
  // justifican un nuevo asset dentro de la misma escena.
  const decisiveFact = [...room.narrativeMemory.facts]
    .reverse()
    .find((fact) => fact.sceneId === scene.id && fact.confirmed && (fact.type === "clue" || fact.type === "combat"));
  if (decisiveFact) {
    const outcome = decisiveFact.tags?.find((tag) => tag === "success" || tag === "partial_success" || tag === "failure");
    const visualKind = decisiveFact.type === "clue" ? "pista" : "combate";
    return `Hecho confirmado (${visualKind}) que domina la escena: ${decisiveFact.text.slice(0, 220)}.${outcome ? ` Resultado confirmado: ${outcome}.` : ""}`;
  }

  if (room.dangerClock >= 7) {
    const threat = room.campaign.threats?.[0]?.name ?? room.campaign.enemies[0]?.name ?? "la amenaza";
    // Una sola clave visual para toda la banda 7-10: subir 7→8 no cambia por sí
    // solo lo que se ve ni debe quemar otra generación.
    return `Crisis visible: ${threat} presiona la escena; peligro crítico.`;
  }
  return null;
}
