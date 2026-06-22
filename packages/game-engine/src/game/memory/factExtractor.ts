import type { GameEvent, GameRoom, NarrativeFact } from "../../types";

function tagsFrom(event: GameEvent) {
  return [
    event.result ?? event.outcome,
    event.actionLabel,
    event.chosenStat,
    ...(event.unlockedFlags ?? []),
    ...(event.unlockedClues ?? [])
  ].filter(Boolean) as string[];
}

export function extractFactsFromOutcome(room: GameRoom, event: GameEvent): NarrativeFact[] {
  const sceneId = event.sceneId ?? room.initialSceneId;
  const base = {
    campaignId: room.campaign.id,
    sceneId,
    turnNumber: event.turnNumber ?? event.turn + 1,
    playerId: event.playerId ?? "unknown",
    confirmed: true,
    relatedCharacters: [event.playerName],
    tags: tagsFrom(event)
  };
  const facts: NarrativeFact[] = [{
    ...base,
    id: `${event.id}-event`,
    type: "event",
    text: `${event.playerName}: ${event.actionLabel ?? event.action}. ${event.engineOutcome ?? event.consequenceText ?? event.outcome}`,
    relatedObjects: [],
    relatedClues: event.unlockedClues ?? []
  }];

  for (const clueId of event.unlockedClues ?? []) {
    const clue = room.campaign.clues.find((item) => item.id === clueId);
    facts.push({
      ...base,
      id: `${event.id}-clue-${clueId}`,
      type: "clue",
      text: clue?.text ?? clueId,
      relatedCharacters: [event.playerName, ...(clue?.suspectsAffected?.map((item) => item.suspectId) ?? [])],
      relatedObjects: clue?.unlocksObjects ?? [],
      relatedClues: [clueId],
      tags: [...base.tags, "clue", clueId]
    });
  }

  if (event.combatNote || event.actionLabel?.toLowerCase().includes("bestia")) {
    facts.push({
      ...base,
      id: `${event.id}-combat`,
      type: "combat",
      text: event.combatNote ?? `La acción ${event.actionLabel ?? event.action} alteró la posición de combate.`,
      relatedObjects: [],
      relatedClues: event.unlockedClues ?? [],
      tags: [...base.tags, "combat"]
    });
  }

  return facts;
}
