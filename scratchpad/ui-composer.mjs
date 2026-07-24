// Por qué la fila "Escribir mi propia acción" se ve rota: quién gana la cascada.
import { openGame } from "./ingame.mjs";
const { b, p } = await openGame();
console.log(await p.evaluate(() => {
  const row = document.querySelector(".customActionRow");
  if (!row) return "no hay customActionRow";
  const label = row.querySelector("label");
  const box = label.querySelector("input");
  const span = label.querySelector("span");
  const cs = getComputedStyle(label);
  const r = (el) => { const x = el.getBoundingClientRect(); return `x=${Math.round(x.x)} w=${Math.round(x.width)} h=${Math.round(x.height)}`; };
  return [
    `row      ${r(row)}`,
    `label    ${r(label)} display=${cs.display} justify=${cs.justifyContent} transform=${cs.textTransform} size=${cs.fontSize} letter=${cs.letterSpacing}`,
    `checkbox ${r(box)}`,
    `span⚡    ${r(span)}`
  ].join("\n");
}));
await b.close();
