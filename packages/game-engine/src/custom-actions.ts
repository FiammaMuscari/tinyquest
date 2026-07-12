import type { SceneActionChoice, StatKey } from "./types";

export const CUSTOM_ACTION_ENERGY_COST = 2;
const CUSTOM_ACTION_PREFIX = "tinyquest:custom:";

export function encodeCustomAction(text: string): string {
  return `${CUSTOM_ACTION_PREFIX}${text.trim()}`;
}

export function decodeCustomAction(action: string): string | undefined {
  if (!action.startsWith(CUSTOM_ACTION_PREFIX)) return undefined;
  const text = action.slice(CUSTOM_ACTION_PREFIX.length).trim();
  return text || undefined;
}

export function createCustomActionChoice(text: string, stat: StatKey): SceneActionChoice {
  const action = text.trim();
  return {
    id: `custom:${action.toLocaleLowerCase().slice(0, 80)}`,
    label: action,
    action,
    recommendedStats: [stat],
    allowedStats: [stat],
    skillTag: "custom",
    category: "investigate",
    riskLevel: "high",
    energyCost: CUSTOM_ACTION_ENERGY_COST,
    possibleOutcomeHint: "La iniciativa personal altera la escena con un coste mayor.",
    permanent: true
  };
}
