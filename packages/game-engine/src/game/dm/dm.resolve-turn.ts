import { applyStatePatch } from "../memory/game-state.reducer";
import { updateActionMemory } from "../memory/action-memory";
import type { SceneActionDefinition } from "../campaigns/campaign.types";
import type { LivingGameState, StatePatch } from "../memory/game-state.types";
import { buildDeterministicDmFallback } from "./dm.fallback";
import { DmTurnJsonSchema, type DmTurnJson } from "./dm.schema";

const forbidden = [
  "la historia avanza",
  "la escena responde",
  "el tablero se mueve",
  "la verdad se esconde",
  "el grupo sabe que",
  "la teoria que pesa",
  "la accion abre una linea nueva",
  "con dientes apretados",
  "con acero, coraje o pura terquedad",
  "la escena entrega algo"
];

export function validateDmTurnJson(value: unknown, state: LivingGameState): DmTurnJson | null {
  const parsed = DmTurnJsonSchema.safeParse(value);
  if (!parsed.success) return null;
  const lower = parsed.data.narration.toLowerCase();
  if (forbidden.some((phrase) => lower.includes(phrase))) return null;
  for (const item of parsed.data.statePatch.itemUpdates) {
    const update = item as { id?: string; state?: string };
    const current = update.id ? state.inventory[update.id] : undefined;
    if (current?.state === "perdido" && update.state === "intacto") return null;
  }
  return parsed.data;
}

export function resolveDmTurn(input: {
  state: LivingGameState;
  characterName: string;
  sceneId: string;
  action: SceneActionDefinition;
  rollTotal: number;
  difficulty: number;
  result: "success" | "partial" | "failure";
  d6Cost?: number;
  llmJson?: unknown;
}) {
  const valid = input.llmJson ? validateDmTurnJson(input.llmJson, input.state) : null;
  const turn = valid ?? buildDeterministicDmFallback(input);
  let nextState = applyStatePatch(input.state, turn.statePatch as StatePatch);
  nextState = updateActionMemory(nextState, {
    sceneId: input.sceneId,
    actionId: input.action.id,
    result: input.result,
    replacementHint: input.result === "failure" ? input.action.exhaustionReplacementFailure : input.action.exhaustionReplacementSuccess
  });
  nextState = {
    ...nextState,
    turn: nextState.turn + 1,
    lastTurns: [...nextState.lastTurns, {
      turn: nextState.turn + 1,
      sceneId: input.sceneId,
      playerId: input.characterName,
      actionId: input.action.id,
      result: input.result,
      concreteChange: turn.concreteChange
    }].slice(-8)
  };
  return { turn, state: nextState, usedFallback: !valid };
}
