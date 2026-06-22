import type { ActionMemory, LivingGameState } from "./game-state.types";

export function getActionMemory(state: LivingGameState, sceneId: string, actionId: string): ActionMemory {
  return state.actionMemory[`${sceneId}:${actionId}`] ?? { sceneId, actionId, uses: 0, exhausted: false };
}

export function updateActionMemory(state: LivingGameState, input: { sceneId: string; actionId: string; result: "success" | "partial" | "failure"; replacementHint?: string }): LivingGameState {
  const key = `${input.sceneId}:${input.actionId}`;
  const current = getActionMemory(state, input.sceneId, input.actionId);
  const uses = current.uses + 1;
  return {
    ...state,
    actionMemory: {
      ...state.actionMemory,
      [key]: {
        ...current,
        uses,
        lastOutcome: input.result,
        exhausted: uses >= 2,
        replacementHint: input.replacementHint ?? current.replacementHint
      }
    }
  };
}
