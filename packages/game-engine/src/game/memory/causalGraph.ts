import type { CausalLink, GameEvent, GameRoom } from "../../types";

const relationByOutcome: Record<string, CausalLink["relation"]> = {
  success: "revealed",
  partial_success: "escalated",
  failure: "blocked"
};

export function updateCausalLinks(room: GameRoom, event: GameEvent): CausalLink[] {
  const existing = room.narrativeMemory.causalLinks;
  const links = [...existing];
  const relation = relationByOutcome[event.outcome] ?? "revealed";

  for (const clueId of event.unlockedClues ?? []) {
    const clue = room.campaign.clues.find((item) => item.id === clueId);
    links.push({
      cause: event.actionId ?? event.actionLabel ?? event.action,
      effect: clueId,
      relation: "revealed",
      description: clue?.text ?? `${event.playerName} reveló ${clueId}.`
    });
  }

  if (event.outcome !== "success") {
    links.push({
      cause: event.actionId ?? event.actionLabel ?? event.action,
      effect: `danger-${event.turnNumber ?? event.turn}`,
      relation,
      description: event.consequenceText ?? event.engineOutcome ?? "La acción abrió una complicación."
    });
  }

  return links.slice(-24);
}
