import type { GameRoom, StoryConclusions } from "../../types";

export function deriveStoryConclusions(room: GameRoom): StoryConclusions {
  const clueIds = new Set(room.mysteryClues);
  const flagIds = new Set(room.storyFlags);
  const memory = room.narrativeMemory;
  const clearedSuspects = memory.characters.filter((npc) => npc.suspicion < 0).map((npc) => npc.name);
  const likelySuspects = memory.characters.filter((npc) => npc.suspicion > 1).map((npc) => npc.name);
  const missingClues = room.campaign.clues.filter((clue) => !clueIds.has(clue.id)).map((clue) => clue.label ?? clue.text);
  const possibleEndings = room.campaign.possibleEndings
    .filter((ending) => !memory.conclusions.blockedEndings.includes(ending.id))
    .map((ending) => ending.title);
  const blockedEndings = memory.conclusions.blockedEndings;

  let currentTheory = room.memorySummary.currentTwist || room.campaign.hiddenTruth || room.campaign.storyHook;
  if (flagIds.has("fake_claws_seen") || clueIds.has("fake-claws")) {
    currentTheory = "El acusado no parece culpable: alguien fabricó el ataque para dirigir la condena.";
  }
  if (flagIds.has("moon_magic_traced") || clueIds.has("moon-ritual-tool")) {
    currentTheory = "La falsificación tiene origen mágico y una mano humana detrás.";
  }
  if (flagIds.has("blood_debt_known") || clueIds.has("blood-debt-letter")) {
    currentTheory = "La traición viene de una casa de la aldea, no de la bestia acusada.";
  }

  return {
    currentTheory,
    likelySuspects,
    clearedSuspects,
    openQuestions: room.memorySummary.unresolvedThreads.slice(-4),
    missingClues: missingClues.slice(0, 4),
    usefulNextActions: room.campaign.scenes[room.currentSceneIndex]?.multipleChoiceOptions.map((option) => option.label).slice(0, 3) ?? [],
    possibleEndings,
    blockedEndings
  };
}
