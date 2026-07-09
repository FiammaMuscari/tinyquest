import { shouldForceSceneAdvance } from "./danger";
import { getCurrentScene, getRoomScenes } from "./room-state";
import type { GameRoom } from "./types";

export function shouldAdvanceScene(room: GameRoom): boolean {
  const scene = getCurrentScene(room);
  // Las escenas derivadas de la campaña traen su maxRounds base; en party la
  // sesión lo escala (scalePartySession) y ese techo más alto es el que manda.
  return shouldForceSceneAdvance({
    danger: room.dangerClock,
    round: room.roundInScene,
    maxRounds: Math.max(scene.maxRounds, room.sessionConfig.maxRoundsPerScene ?? 0),
    sceneClockFull: room.sceneProgress >= 2.5,
    walkthroughForcedAdvance: false
  });
}

export function isFinalScene(room: GameRoom): boolean {
  return room.currentSceneIndex >= getRoomScenes(room).length - 1;
}
