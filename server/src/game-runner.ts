import {
  applyNarration,
  campaignById,
  createMultiplayerRoom,
  resolvePlayerAction
} from "@tiny-quest/game-engine";
import { createDungeonMasterProvider } from "@tiny-quest/ai-master";
import type { GameRoom, StatKey } from "@tiny-quest/game-engine";
import type { MultiplayerRoom } from "./room-manager.js";

// One provider per process — reused across all rooms
let _provider: ReturnType<typeof createDungeonMasterProvider> | null = null;
function getMasterProvider() {
  if (!_provider) _provider = createDungeonMasterProvider("groq", process.env);
  return _provider;
}

export function initGameRoom(room: MultiplayerRoom): GameRoom {
  const campaign = campaignById(room.campaignId);
  return createMultiplayerRoom(
    room.host.character,
    room.guest!.character,
    campaign
  );
}

export async function runTurn(
  gameRoom: GameRoom,
  action: string,
  stat: StatKey,
  usePet: boolean
): Promise<{ nextRoom: GameRoom; eventSummary: string }> {
  const resolution = resolvePlayerAction(gameRoom, action, stat, usePet);

  let narration;
  try {
    narration = await getMasterProvider().generateNarration(resolution.narrationRequest);
  } catch {
    // Fallback: build minimal narration without LLM
    narration = buildFallbackNarration(action, resolution.check.outcome);
  }

  const nextRoom = applyNarration(gameRoom, resolution, narration);
  const latestEvent = nextRoom.sessionLog[0];
  const eventSummary = latestEvent?.narration ?? narration.sections?.narration ?? narration.narration ?? action;

  return { nextRoom, eventSummary };
}

function buildFallbackNarration(action: string, outcome: string) {
  const texts: Record<string, string> = {
    success: `La acción "${action}" tuvo éxito. La historia avanza.`,
    partial_success: `La acción "${action}" tuvo éxito parcial. Hay consecuencias.`,
    failure: `La acción "${action}" falló. El peligro aumenta.`
  };
  const narration = texts[outcome] ?? texts.failure;
  return {
    narration,
    narrationTokens: 0,
    playerNarration: narration,
    consequenceText: "",
    npcDialogue: [],
    nextOptions: ["Continuar investigando.", "Tomar una decisión.", "Observar el entorno."],
    plotBeat: undefined,
    sections: { narration, dialogue: "", consequence: "", options: [] },
    memoryUpdate: { facts: [], clues: [], objects: [], npcs: [], locations: [], dangers: [], forbiddenContradictions: [] },
    stateSuggestions: [],
    pacingHint: "continue" as const,
    dialogue: []
  };
}

export function isActivePlayer(gameRoom: GameRoom, playerId: string): boolean {
  const active = gameRoom.players[gameRoom.activePlayerIndex];
  return active?.id === playerId;
}
