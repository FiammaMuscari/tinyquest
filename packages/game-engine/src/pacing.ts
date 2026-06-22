import { shouldForceSceneAdvance } from "./danger";
import { getCurrentScene, getRoomScenes } from "./room-state";
import type { GameRoom } from "./types";

export function shouldAdvanceScene(room: GameRoom): boolean {
  const scene = getCurrentScene(room);
  return shouldForceSceneAdvance({
    danger: room.dangerClock,
    round: room.roundInScene,
    maxRounds: scene.maxRounds,
    sceneClockFull: room.sceneProgress >= 2.5,
    walkthroughForcedAdvance: false
  });
}

export function isFinalScene(room: GameRoom): boolean {
  return room.currentSceneIndex >= getRoomScenes(room).length - 1;
}
