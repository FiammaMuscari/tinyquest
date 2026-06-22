import type { LivingGameState, RelationshipState } from "./game-state.types";

export function upsertRelationship(state: LivingGameState, relation: RelationshipState): LivingGameState {
  const existing = state.relationshipStates.filter((item) => !(item.fromId === relation.fromId && item.toId === relation.toId && item.relation === relation.relation));
  return { ...state, relationshipStates: [...existing, relation] };
}
