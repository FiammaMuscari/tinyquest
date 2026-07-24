import { openGame } from "./ingame.mjs";
const { b, p } = await openGame();
console.log(await p.evaluate(() => {
  const m = document.querySelector(".miniMeters");
  const cs = getComputedStyle(m);
  const kids = [...m.children].map(k => `  <${k.tagName.toLowerCase()}> w=${Math.round(k.getBoundingClientRect().width)} scrollW=${k.scrollWidth} "${k.textContent.trim().slice(0,20)}"`);
  const name = m.querySelector(".miniMeterName");
  return [`.miniMeters w=${Math.round(m.getBoundingClientRect().width)} cols=${cs.gridTemplateColumns} gap=${cs.gap}`,
    ...kids,
    name ? `  .miniMeterName w=${Math.round(name.getBoundingClientRect().width)} scrollW=${name.scrollWidth}` : "sin .miniMeterName"].join("\n");
}));
await b.close();
