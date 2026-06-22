import type { TinyQuestCampaign } from "../campaigns/campaign.types";
import type { LivingGameState } from "../memory/game-state.types";

export function selectAvailableEndings(campaign: TinyQuestCampaign, state: LivingGameState) {
  return campaign.endings.filter((ending) => {
    const score = state.endingScore[ending.id] ?? 0;
    const dangerOk = (ending.dangerMin === undefined || state.danger >= ending.dangerMin) && (ending.dangerMax === undefined || state.danger <= ending.dangerMax);
    const cluesOk = ending.requiredClues.every((id) => state.discoveredClues[id]?.confirmed || state.discoveredClues[id]?.discovered);
    const objectsOk = ending.requiredObjects.every((id) => state.inventory[id] && state.inventory[id].state !== "perdido");
    return score >= ending.endingScoreRequired && dangerOk && cluesOk && objectsOk;
  });
}
