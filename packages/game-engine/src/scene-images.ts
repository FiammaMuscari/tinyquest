import type { GameRoom } from "./types";

/** Momento narrativo estable que justifica una imagen nueva. No usa IO ni texto
 * del LLM como verdad: deriva solo de hechos que el motor ya confirmó. */
export function sceneImageBeat(room: GameRoom): string | null {
  const scene = room.campaign.scenes[room.currentSceneIndex];
  if (!scene) return null;
  if (room.sessionComplete) return `Final de la historia: ${room.finalEnding?.title ?? "el destino queda sellado"}.`;

  const decisiveFact = [...room.narrativeMemory.facts]
    .reverse()
    .find((fact) => fact.sceneId === scene.id && fact.confirmed && (fact.type === "clue" || fact.type === "combat" || fact.type === "event"));
  if (decisiveFact) return `Hecho confirmado que domina la escena: ${decisiveFact.text.slice(0, 220)}.`;

  if (room.dangerClock >= 7) {
    const threat = room.campaign.threats?.[0]?.name ?? room.campaign.enemies[0]?.name ?? "la amenaza";
    return `Crisis visible: ${threat} presiona la escena; peligro ${room.dangerClock} de 10.`;
  }
  return null;
}
