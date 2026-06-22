import { Server } from "boardgame.io/server";
import { TinyQuestGame } from "./game";

export function createBoardgameServer() {
  return Server({ games: [TinyQuestGame] });
}
