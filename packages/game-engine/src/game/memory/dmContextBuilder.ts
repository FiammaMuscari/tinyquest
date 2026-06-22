import type { DmRetrievedContext, GameRoom } from "../../types";
import { getCurrentScene } from "../../room-state";
import { getVisibleActionChoices } from "../../room-state";
import { retrieveForCurrentTurn } from "./retrieval";

export function buildDmContext(room: GameRoom): DmRetrievedContext {
  return retrieveForCurrentTurn(room);
}

export function buildVisibleOptionsForDm(room: GameRoom) {
  const scene = getCurrentScene(room);
  return getVisibleActionChoices(scene, room);
}
