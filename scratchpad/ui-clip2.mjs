// Recortes reales en la pantalla de partida: texto cortado por overflow hidden
// o por un contenedor más bajo que su contenido. Solo mide, no toca nada.
import { openGame } from "./ingame.mjs";
const { b, p } = await openGame();
console.log(await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const cutX = el.scrollWidth - el.clientWidth;
    const cutY = el.scrollHeight - el.clientHeight;
    if (cutX < 2 && cutY < 2) continue;
    const scrollable = /auto|scroll/.test(cs.overflowY + cs.overflowX);
    if (scrollable) continue; // con scroll el usuario puede llegar al resto
    if (cs.overflowX === "visible" && cs.overflowY === "visible") continue; // no recorta nada
    if (cs.textOverflow === "ellipsis" && cutY < 2) continue; // recorte declarado, con "…"
    const txt = (el.textContent || "").trim().slice(0, 46).replace(/\s+/g, " ");
    if (!txt) continue;
    out.push(`${el.className || el.tagName} | cortaX=${cutX} cortaY=${cutY} | ovf=${cs.overflow} | "${txt}"`);
  }
  return out.slice(0, 25).join("\n") || "sin recortes";
}));
await b.close();
