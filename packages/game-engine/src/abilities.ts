import type { AbilityProgression, Role } from "./types";

export function createAbilityProgression(role: Role): AbilityProgression {
  return {
    id: `${role.id}-track`,
    name: `Camino: ${role.name}`,
    currentSkill: role.specialAbility,
    nextUpgrade: `Mejora ${role.mainStat}: usar ${role.specialAbility.toLowerCase()} tambien reduce 1 punto de peligro.`,
    scaling: `Escala con ${role.mainStat} y ${role.secondaryStat}.`,
    unlockCondition: "Completa 2 escenas o logra 2 exitos usando la habilidad principal.",
    level: 1,
    progress: 0,
    progressTarget: 2
  };
}
