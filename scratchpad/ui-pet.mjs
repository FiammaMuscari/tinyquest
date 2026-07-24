import { openGame } from "./ingame.mjs";
const { b, p } = await openGame();
console.log(await p.evaluate(() => {
  const el = [...document.querySelectorAll("span")].find(s => s.textContent.trim() === "Alma Dracónica");
  if (!el) return "no está";
  const out = [];
  let n = el;
  for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    out.push(`${i}: <${n.tagName.toLowerCase()} class="${n.className}"> w=${Math.round(r.width)} scrollW=${n.scrollWidth} ovf=${cs.overflow} textOvf=${cs.textOverflow} ws=${cs.whiteSpace} display=${cs.display} minW=${cs.minWidth} flex=${cs.flex}`);
  }
  return out.join("\n");
}));
await b.close();
