import { rollDie } from "./dice";
import type { Enemy, StatKey, Stats } from "./types";

export type CombatAction = "attack" | "defend" | "help" | "pet" | "escape" | "negotiate";
export type CombatOutcome = "hit" | "strong_hit" | "miss" | "defended" | "enemy_action";

export type CombatResult = {
  outcome: CombatOutcome;
  attackTotal?: number;
  damage?: number;
  d20?: ReturnType<typeof rollDie>;
  damageDie?: ReturnType<typeof rollDie>;
  damageBreakdown?: {
    damageRoll: number;
    damageBonus: number;
    damageTotal: number;
    damageReason: string;
  };
  defenseReduction?: number;
  note: string;
};

export function resolveAttack(stats: Stats, selectedStat: StatKey, enemy: Enemy): CombatResult {
  const d20 = rollDie(20);
  const attackTotal = d20.value + stats[selectedStat];
  if (attackTotal >= enemy.defense + 5) {
    const damageDie = rollDie(8);
    const damageTotal = damageDie.value + stats[selectedStat];
    return { outcome: "strong_hit", d20, damageDie, attackTotal, damage: damageTotal, damageBreakdown: { damageRoll: damageDie.value, damageBonus: stats[selectedStat], damageTotal, damageReason: `Golpe fuerte contra ${enemy.name}.` }, note: `Golpe fuerte contra ${enemy.name}.` };
  }
  if (attackTotal >= enemy.defense) {
    const damageDie = rollDie(6);
    const damageTotal = damageDie.value + stats[selectedStat];
    return { outcome: "hit", d20, damageDie, attackTotal, damage: damageTotal, damageBreakdown: { damageRoll: damageDie.value, damageBonus: stats[selectedStat], damageTotal, damageReason: `Impacto contra ${enemy.name}.` }, note: `Impacto contra ${enemy.name}.` };
  }
  return { outcome: "miss", d20, attackTotal, note: `${enemy.name} evita o resiste el ataque.` };
}

export function resolveDefense(stats: Stats, selectedStat: StatKey): CombatResult {
  const die = rollDie(4);
  const stat = selectedStat === "body" || selectedStat === "focus" ? selectedStat : "focus";
  return { outcome: "defended", damageDie: die, defenseReduction: die.value + stats[stat], note: "La defensa reduce el próximo daño recibido." };
}

export function chooseEnemyMove(enemy: Enemy, playerVitality: number): CombatAction {
  if (enemy.vitality <= 3) return "negotiate";
  if (playerVitality <= 4) return "attack";
  if (enemy.dangerLevel >= 3) return "defend";
  return "attack";
}
