import { createCharacter } from "./character";
import type { Campaign, Character, StatKey } from "./types";

// El temple de la quest: cada historia exige más de una stat (la templa, +1) y
// descuida otra (la oxida, -1). Determinístico y sin LLM: se calcula de las
// allowedStats de las escenas — la más pedida bendice, la menos pedida castiga.
export type QuestTemper = { blessed: StatKey; strained: StatKey };

const statOrder: StatKey[] = ["body", "mind", "charm", "creativity", "courage", "focus", "luck"];

export function getQuestTemper(campaign: Campaign): QuestTemper {
  const counts = new Map<StatKey, number>(statOrder.map((stat) => [stat, 0]));
  for (const scene of campaign.scenes) {
    for (const stat of scene.allowedStats ?? []) counts.set(stat, (counts.get(stat) ?? 0) + 1);
  }
  let blessed: StatKey = statOrder[0];
  let strained: StatKey = statOrder[0];
  for (const stat of statOrder) {
    if ((counts.get(stat) ?? 0) > (counts.get(blessed) ?? 0)) blessed = stat;
    if ((counts.get(stat) ?? 0) < (counts.get(strained) ?? 0)) strained = stat;
  }
  if (blessed === strained) {
    // Campaña pareja en exigencias: desempate estable por hash del id.
    let hash = 0;
    for (let i = 0; i < campaign.id.length; i += 1) hash = (hash * 31 + campaign.id.charCodeAt(i)) >>> 0;
    blessed = statOrder[hash % statOrder.length];
    strained = statOrder[(hash + 3) % statOrder.length];
  }
  return { blessed, strained };
}

// Copia templada del personaje para ESTA partida; el draft del jugador no se toca.
export function applyQuestTemper(character: Character, campaign: Campaign): Character {
  const { blessed, strained } = getQuestTemper(campaign);
  const stats = { ...character.stats };
  stats[blessed] = Math.min(4, stats[blessed] + 1);
  stats[strained] = Math.max(1, stats[strained] - 1);
  return createCharacter({ ...character, stats });
}
