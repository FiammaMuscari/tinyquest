import type { Stats } from "./types";

export const baseStats: Stats = {
  body: 1,
  mind: 1,
  charm: 1,
  creativity: 1,
  courage: 1,
  focus: 1,
  luck: 1
};

export function clampStats(stats: Stats): Stats {
  return Object.fromEntries(
    Object.entries(stats).map(([key, value]) => [key, Math.max(1, Math.min(4, Math.round(value)))])
  ) as Stats;
}

export function totalExtraPoints(stats: Stats): number {
  return Object.values(stats).reduce((sum, value) => sum + value, 0) - 7;
}

export function deriveValues(stats: Stats) {
  return {
    vitality: 8 + stats.body + stats.courage,
    energy: 5 + stats.mind + stats.focus,
    spark: stats.creativity + stats.charm,
    defense: 6 + stats.body + stats.focus,
    resolve: 6 + stats.courage + stats.mind
  };
}
