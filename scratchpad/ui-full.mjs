import { openGame } from "./ingame.mjs";
const { b, p } = await openGame();
await p.screenshot({ path: "scripts/.shots/full-game.png" });
console.log("ok");
await b.close();
