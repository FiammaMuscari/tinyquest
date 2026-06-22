import { createBoardgameServer } from "./boardgame-server";
import { readEnv } from "./env";

const env = readEnv();
const server = createBoardgameServer();

server.run(env.port, () => {
  console.log(`Tiny Quest boardgame.io server listening on ${env.port}`);
});
