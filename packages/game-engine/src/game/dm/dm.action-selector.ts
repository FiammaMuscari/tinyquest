import type { SceneDefinition } from "../campaigns/campaign.types";
import type { LivingGameState } from "../memory/game-state.types";

export function getAvailableSceneActions(scene: SceneDefinition, state: LivingGameState) {
  return scene.recommendedActions.map((action) => {
    const memory = state.actionMemory[`${scene.id}:${action.id}`];
    if (memory?.exhausted) {
      return { ...action, label: action.exhaustionReplacementSuccess, stakes: "La accion original se agoto; ahora debe transformar la escena." };
    }
    return action;
  });
}
