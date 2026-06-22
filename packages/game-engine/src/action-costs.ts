import type { SceneActionChoice } from "./types";

export function getActionEnergyCost(choice?: Pick<SceneActionChoice, "category" | "intent" | "riskLevel" | "energyCost">): number {
  if (!choice) return 0;
  if (typeof choice.energyCost === "number") return Math.max(0, choice.energyCost);
  if (choice.riskLevel === "high" || choice.category === "fight" || choice.category === "defend" || choice.intent === "fight" || choice.intent === "protect") return 2;
  if (choice.category === "magic" || choice.category === "pet" || choice.category === "escape" || choice.intent === "magic" || choice.intent === "pet" || choice.intent === "flee") return 1;
  return 0;
}

export function canPayActionEnergy(energy: number, choice?: Pick<SceneActionChoice, "category" | "intent" | "riskLevel" | "energyCost">): boolean {
  return energy >= getActionEnergyCost(choice);
}
