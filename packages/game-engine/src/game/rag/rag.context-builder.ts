import type { LivingGameState } from "../memory/game-state.types";
import type { RagIndex } from "./rag.indexer";
import { searchRag } from "./rag.search";

export function buildRagContext(index: RagIndex, state: LivingGameState) {
  const discoveredClues = Object.values(state.discoveredClues).filter((clue) => clue.discovered || clue.confirmed).map((clue) => clue.id);
  const inventory = Object.values(state.inventory).filter((item) => item.state !== "perdido").map((item) => item.id);
  const npcs = Object.values({ ...state.npcStates, ...state.secondaryNPCStates }).filter((npc) => npc.present && npc.alive).map((npc) => npc.id);
  return searchRag(index, {
    campaignId: state.campaignId,
    sceneId: state.currentSceneId,
    clueIds: discoveredClues,
    objectIds: inventory,
    npcIds: npcs,
    tags: [state.currentSceneId],
    text: state.lastTurns.map((turn) => `${turn.actionId} ${turn.concreteChange}`).join(" "),
    limit: 7
  });
}
