import { openGame } from "./ingame.mjs";
const { b, p } = await openGame();
await p.locator(".turnQueue").first().screenshot({ path: "scripts/.shots/rail.png" });
console.log(await p.evaluate(() => {
  const rail = document.querySelector(".turnQueue");
  return `rail alto=${Math.round(rail.getBoundingClientRect().height)} contenido=${rail.scrollHeight} sobra=${rail.scrollHeight - rail.clientHeight}px sin ver`;
}));
await b.close();
