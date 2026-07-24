import { openGame } from "./ingame.mjs";
const { b, p } = await openGame();
const shot = async (sel, name) => {
  const el = p.locator(sel).first();
  if (!await el.count()) return console.log("no existe:", sel);
  await el.screenshot({ path: `scripts/.shots/${name}.png` });
};
await shot(".journeyClocks", "z-clocks");
await shot(".actionComposer", "z-composer");
await shot(".turnQueue", "z-queue");
console.log(await p.evaluate(() => {
  const out = [];
  for (const c of document.querySelectorAll(".journeyClock")) {
    const name = c.querySelector(".clockName");
    const r = name.getBoundingClientRect();
    const pips = c.querySelectorAll(".clockPips i");
    out.push(`"${name.textContent}" (${name.textContent.length} chars) alto=${Math.round(r.height)}px lineas=${Math.round(r.height / parseFloat(getComputedStyle(name).lineHeight))} pips=${pips.length}`);
  }
  const rail = document.querySelector(".turnQueue").getBoundingClientRect();
  return out.join("\n") + `\nrail ancho=${Math.round(rail.width)}px`;
}));
await b.close();
