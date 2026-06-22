import { rollDie } from "./dice";
import type { CheckResult, StatKey, Stats } from "./types";

export function shouldGrantCreativeBonus(action: string, selectedStat: StatKey, usePet = false): boolean {
  const text = action.toLowerCase();
  return selectedStat === "creativity" || usePet || text.includes("mascota usada:");
}

export function resolveCheck(stats: Stats, selectedStat: StatKey, difficulty: number, action: string, usePet = false): CheckResult {
  const d20 = rollDie("d20");
  const creativeBonus = shouldGrantCreativeBonus(action, selectedStat, usePet) ? rollDie("d4") : undefined;
  const rollBreakdown = calculateRollTotal({
    d20: d20.value,
    statModifier: stats[selectedStat],
    d4Bonus: creativeBonus?.value ?? 0,
    flatBonus: 0,
    penalties: 0
  });
  const total = rollBreakdown.total;
  const outcome = total >= difficulty ? "success" : total >= difficulty - 2 ? "partial_success" : "failure";

  return {
    outcome,
    total,
    difficulty,
    d20,
    creativeBonus,
    rollBreakdown
  };
}

export function calculateRollTotal(input: { d20: number; statModifier: number; d4Bonus?: number; flatBonus?: number; penalties?: number }) {
  const d4Bonus = input.d4Bonus ?? 0;
  const flatBonus = input.flatBonus ?? 0;
  const penalties = input.penalties ?? 0;
  return {
    d20: input.d20,
    statModifier: input.statModifier,
    d4Bonus,
    flatBonus,
    penalties,
    total: input.d20 + input.statModifier + d4Bonus + flatBonus - penalties
  };
}
