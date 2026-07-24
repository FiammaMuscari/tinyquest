import { openGame } from "./ingame.mjs";
const { b, p, blocked } = await openGame();
await p.screenshot({ path: "scripts/.shots/game-01.png" });
console.log(await p.evaluate(() => {
  const lobby = document.querySelector(".lobbyLayout");
  return `sigue en lobby: ${Boolean(lobby)}\nalto ${document.documentElement.scrollHeight} / 700\nsecciones: ` +
    [...document.querySelectorAll("section, aside")].map(e => e.className.toString().slice(0,40)).filter(Boolean).slice(0,14).join(" | ");
}));
console.log("bloqueados:", blocked);
await b.close();
