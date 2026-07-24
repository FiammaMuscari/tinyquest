// Verificación de render de los relojes de historia: markup EXACTO que emite
// TurnQueue + el app.css real. No consume cuota de LLM ni de imágenes.
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const out = "scripts/.shots";
await mkdir(out, { recursive: true });

const pips = (filled, segments) =>
  Array.from({ length: segments }, (_, i) => `<i class="${i < filled ? "on" : "off"}"></i>`).join("");

const clock = (kind, name, filled, segments, payoff) => `
  <div class="journeyClock clock-${kind}${payoff ? " clockFired" : ""}">
    <span class="clockName">${name}</span>
    <span class="clockPips">${pips(filled, segments)}</span>
    ${payoff ? `<em class="clockPayoff">${payoff}</em>` : ""}
  </div>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="http://127.0.0.1:5173/src/styles/app.css">
<style>body{margin:0;background:#12100b;} .wrap{width:268px;padding:16px;}</style>
</head><body><div class="wrap"><aside class="panel turnQueue"><div class="journeyPanel">
  <h3>El recorrido</h3>
  <div class="journeyClocks">
    <h4>Lo que corre</h4>
    ${/* Nombres tal como los deja clockLabel() del motor: etiqueta corta, una línea. */ ""}
    ${clock("threat", "La Guardia del Umbral se cierra", 5, 8)}
    ${clock("mystery", "La verdad toma forma", 3, 6)}
    ${clock("opportunity", "Salvar a Nicolás", 2, 6)}
    ${clock("threat", "El Cobrador reclama la deuda", 4, 4, "El Cobrador reclama la deuda en sangre.")}
  </div>
  <div class="journeyLaws"><h4>Leyes de Veldaran</h4>
    <p class="journeyLaw">⚖ La magia sin registro se paga con la mano.</p></div>
</div></aside></div></body></html>`;

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 300, height: 560 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForTimeout(600);

// Medición: los pips deben estar en UNA fila por reloj y no desbordar el carril.
const check = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".journeyClock")].map((el) => {
    const pips = [...el.querySelectorAll(".clockPips i")];
    const tops = new Set(pips.map((p) => Math.round(p.getBoundingClientRect().top)));
    const r = el.getBoundingClientRect();
    return { name: el.querySelector(".clockName").textContent.slice(0, 28), pipRows: tops.size, right: Math.round(r.right), on: el.querySelectorAll(".clockPips i.on").length };
  });
  return { rows, panelRight: Math.round(document.querySelector(".wrap").getBoundingClientRect().right) };
});
console.log(JSON.stringify(check, null, 1));
await page.screenshot({ path: `${out}/clocks.png` });
await browser.close();
