import type { DmRetrievedContext, GameRoom } from "../../types";
import { deriveStoryConclusions } from "./storyConclusions";

export function retrieveForCurrentTurn(room: GameRoom): DmRetrievedContext {
  const scene = room.campaign.scenes[room.currentSceneIndex];
  const sceneId = scene?.id ?? room.initialSceneId;
  const sceneClueIds = new Set(scene?.clueIds ?? []);
  const discoveredClues = new Set(room.mysteryClues);
  const relevantClues = room.campaign.clues.filter((clue) => sceneClueIds.has(clue.id) || discoveredClues.has(clue.id));
  const relevantCharacters = room.narrativeMemory.characters.filter((npc) =>
    npc.status === "active" || npc.lastSeenSceneId === sceneId || scene?.npcIds.includes(npc.id)
  );
  const relevantObjects = room.narrativeMemory.objects.filter((object) =>
    object.status !== "hidden" || object.relatedClues.some((clueId) => discoveredClues.has(clueId))
  );
  const relevantFacts = room.narrativeMemory.facts.filter((fact) =>
    fact.sceneId === sceneId ||
    fact.relatedClues.some((clueId) => discoveredClues.has(clueId)) ||
    relevantCharacters.some((npc) => fact.relatedCharacters.includes(npc.id) || fact.relatedCharacters.includes(npc.name))
  ).slice(-10);
  const causalLinks = room.narrativeMemory.causalLinks.filter((link) =>
    relevantFacts.some((fact) => fact.id.includes(link.effect) || fact.id.includes(link.cause)) ||
    room.storyFlags.includes(link.cause) ||
    room.storyFlags.includes(link.effect)
  ).slice(-8);
  const conclusions = deriveStoryConclusions(room);
  const sceneTurns = room.sessionLog.filter((event) => event.sceneId === sceneId);
  const repeatedActions = Array.from(
    sceneTurns.reduce((map, event) => {
      const label = event.actionLabel ?? event.action;
      const current = map.get(label);
      map.set(label, {
        label,
        count: (current?.count ?? 0) + 1,
        latestOutcome: event.outcome
      });
      return map;
    }, new Map<string, { label: string; count: number; latestOutcome: typeof room.sessionLog[number]["outcome"] }>())
  ).map(([, value]) => value).filter((item) => item.count > 1).slice(0, 5);

  return {
    relevantFacts,
    relevantClues,
    relevantObjects,
    relevantCharacters,
    recentTurns: room.sessionLog.slice(0, 3),
    causalLinks,
    currentTheory: conclusions.currentTheory,
    openQuestions: conclusions.openQuestions,
    possibleEndings: conclusions.possibleEndings,
    blockedEndings: conclusions.blockedEndings,
    forbiddenContradictions: [
      ...room.memorySummary.forbiddenContradictions,
      ...conclusions.clearedSuspects.map((name) => `${name} no debe narrarse como culpable confirmado.`),
      ...relevantObjects.filter((object) => object.status === "broken" || object.status === "destroyed").map((object) => `${object.name} no puede usarse como objeto intacto.`)
    ].slice(-12),
    recentMotifsToAvoid: room.narrativeMemory.recentMotifs.slice(-8),
    sceneTurnCount: sceneTurns.length,
    repeatedActions
  };
}
