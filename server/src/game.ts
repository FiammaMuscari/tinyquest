import { INVALID_MOVE } from "boardgame.io/core";
import type { Game } from "boardgame.io";
import type { GameRoom, StatKey } from "@tiny-quest/game-engine";
import { applyNarration, createSoloRoom, resolvePlayerAction } from "@tiny-quest/game-engine";
import { createDungeonMasterProvider } from "@tiny-quest/ai-master";

export type TinyQuestState = {
  room: GameRoom;
};

export const TinyQuestGame: Game<TinyQuestState> = {
  name: "tiny-quest",
  setup: () => ({ room: createSoloRoom() }),
  turn: {
    minMoves: 1,
    maxMoves: 1
  },
  moves: {
    submitAction: ({ G }, action: string, selectedStat: StatKey) => {
      const provider = createDungeonMasterProvider("groq", process.env);
      const resolution = resolvePlayerAction(G.room, action, selectedStat);

      void provider.generateNarration(resolution.narrationRequest).then((narration) => {
        G.room = applyNarration(G.room, resolution, narration);
      });

      return INVALID_MOVE;
    }
  }
};
