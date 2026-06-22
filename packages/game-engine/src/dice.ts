import type { DiceType, RollResult } from "./types";

const sides: Record<DiceType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d20: 20
};

export function rollDie(dieOrSides: DiceType | 4 | 6 | 8 | 10 | 20): RollResult {
  const die = typeof dieOrSides === "number" ? (`d${dieOrSides}` as DiceType) : dieOrSides;
  return {
    die,
    value: Math.floor(Math.random() * sides[die]) + 1
  };
}

export function rollDice(count: number, dieOrSides: DiceType | 4 | 6 | 8 | 10 | 20): RollResult[] {
  return Array.from({ length: Math.max(0, count) }, () => rollDie(dieOrSides));
}
