import { extractFactsFromOutcome } from "./factExtractor";
import { updateCausalLinks } from "./causalGraph";
import { deriveStoryConclusions } from "./storyConclusions";
import type { CharacterMemory, CombatMemory, GameEvent, GameRoom, NarrativeMemory, StoryObjectMemory } from "../../types";

export function createInitialNarrativeMemory(room: Pick<GameRoom, "campaign">): NarrativeMemory {
  const characters: CharacterMemory[] = room.campaign.npcs.map((npc) => ({
    id: npc.id,
    name: npc.name,
    role: npc.role ?? npc.description,
    status: "hidden",
    knows: npc.whatTheyKnow ?? [],
    hides: npc.whatTheyHide ?? [npc.secret ?? ""].filter(Boolean),
    appearedInScenes: [],
    lastSeenSceneId: undefined,
    suspicion: 0,
    trust: 0
  }));
  const objects: StoryObjectMemory[] = (room.campaign.storyObjects ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    location: item.location,
    holder: item.holder,
    relatedClues: item.relatedClues,
    unlocksActions: item.unlocksActions,
    unlocksEndings: item.unlocksEndings
  }));
  return {
    facts: [],
    characters,
    objects,
    combats: [],
    causalLinks: (room.campaign.causalLinks ?? []).map((link) => ({
      cause: link.cause,
      effect: link.effect,
      relation: link.relation === "contradicted" ? "blocked" : link.relation,
      description: link.description
    })),
    conclusions: {
      currentTheory: room.campaign.hiddenTruth ?? room.campaign.storyHook,
      likelySuspects: [],
      clearedSuspects: [],
      openQuestions: [],
      missingClues: [],
      usefulNextActions: [],
      possibleEndings: room.campaign.possibleEndings.map((ending) => ending.title),
      blockedEndings: []
    },
    recentMotifs: [],
    cachedKeys: []
  };
}

export function updateCharacterMemory(room: GameRoom, event: GameEvent): CharacterMemory[] {
  const scene = room.campaign.scenes.find((item) => item.id === event.sceneId);
  const presentNpcIds = new Set(scene?.npcIds ?? []);
  return room.narrativeMemory.characters.map((npc) => {
    const present = presentNpcIds.has(npc.id);
    const clueSuspicion = (event.unlockedClues ?? [])
      .flatMap((clueId) => room.campaign.clues.find((clue) => clue.id === clueId)?.suspectsAffected ?? [])
      .filter((change) => change.suspectId === npc.id)
      .reduce((sum, change) => sum + change.suspicionChange, 0);
    return {
      ...npc,
      status: present ? "active" : npc.status,
      appearedInScenes: present ? Array.from(new Set([...npc.appearedInScenes, event.sceneId ?? ""])) : npc.appearedInScenes,
      lastSeenSceneId: present ? event.sceneId : npc.lastSeenSceneId,
      suspicion: npc.suspicion + clueSuspicion,
      trust: npc.trust + (event.outcome === "success" && present ? 1 : event.outcome === "failure" && present ? -1 : 0)
    };
  });
}

export function updateObjectMemory(room: GameRoom, event: GameEvent): StoryObjectMemory[] {
  const unlockedObjects = new Set((event.unlockedClues ?? []).flatMap((clueId) => room.campaign.clues.find((clue) => clue.id === clueId)?.unlocksObjects ?? []));
  return room.narrativeMemory.objects.map((item) => ({
    ...item,
    status: unlockedObjects.has(item.id) && item.status === "hidden" ? "found" : item.status
  }));
}

export function updateCombatMemory(room: GameRoom, event: GameEvent): CombatMemory[] {
  const scene = room.campaign.scenes.find((item) => item.id === event.sceneId);
  if (!scene?.hasCombat && !event.combatNote) return room.narrativeMemory.combats;
  const combatId = `${scene?.id ?? event.sceneId}-combat`;
  const previous = room.narrativeMemory.combats.find((combat) => combat.id === combatId);
  const status: CombatMemory["status"] = event.outcome === "success" ? "won" : event.outcome === "failure" ? "escaped" : "active";
  const nextCombat: CombatMemory = {
    id: combatId,
    sceneId: scene?.id ?? event.sceneId ?? room.initialSceneId,
    enemies: scene?.enemyIds ?? [],
    participants: Array.from(new Set([...(previous?.participants ?? []), event.playerName])),
    status,
    damageEvents: [...(previous?.damageEvents ?? []), event.combatNote ?? event.engineOutcome ?? event.actionLabel ?? event.action].slice(-6),
    injuries: previous?.injuries ?? [],
    consequences: [...(previous?.consequences ?? []), event.consequenceText ?? ""].filter(Boolean).slice(-6)
  };
  return [...room.narrativeMemory.combats.filter((combat) => combat.id !== combatId), nextCombat].slice(-8);
}

export function indexTurnResult(room: GameRoom, event: GameEvent): NarrativeMemory {
  const facts = [...room.narrativeMemory.facts, ...extractFactsFromOutcome(room, event)].slice(-60);
  const nextMemory: GameRoom = {
    ...room,
    narrativeMemory: {
      ...room.narrativeMemory,
      facts,
      characters: updateCharacterMemory(room, event),
      objects: updateObjectMemory(room, event),
      combats: updateCombatMemory(room, event),
      causalLinks: updateCausalLinks(room, event),
      recentMotifs: [event.sceneTitle, event.actionLabel ?? event.action, ...(event.unlockedClues ?? [])].filter(Boolean).slice(-12)
    }
  };
  return {
    ...nextMemory.narrativeMemory,
    conclusions: deriveStoryConclusions(nextMemory)
  };
}
