import type { TinyQuestCampaign } from "../campaigns/campaign.types";
import type { LivingGameState } from "../memory/game-state.types";
import type { RagChunk } from "../rag/rag.types";

export function buildDmContextPack(input: { campaign: TinyQuestCampaign; state: LivingGameState; ragChunks: RagChunk[] }) {
  const { campaign, state, ragChunks } = input;
  const actionMemory = Object.values(state.actionMemory).filter((item) => item.sceneId === state.currentSceneId);
  return {
    campaign: { id: campaign.id, title: campaign.title, theme: campaign.theme, realSecret: campaign.realSecret, hiddenThreat: campaign.hiddenThreat },
    liveState: {
      sceneId: state.currentSceneId,
      round: state.round,
      turn: state.turn,
      danger: state.danger,
      clues: Object.values(state.discoveredClues).filter((clue) => clue.discovered || clue.confirmed),
      inventory: Object.values(state.inventory),
      npcs: Object.values({ ...state.npcStates, ...state.secondaryNPCStates }).filter((npc) => npc.present || npc.hostility > 0 || npc.trust > 0),
      factions: Object.values(state.factionStates).filter((faction) => faction.alert > 0 || faction.hostility > 0),
      routes: Object.values(state.routeStates).filter((route) => route.open || route.blocked || route.discovered),
      actionMemory,
      lastTurns: state.lastTurns.slice(-4)
    },
    rag: ragChunks.map((chunk) => ({ kind: chunk.kind, title: chunk.title, tags: chunk.tags, text: chunk.text.slice(0, 1200) }))
  };
}
