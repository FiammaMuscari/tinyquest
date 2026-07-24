import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
const css = await readFile("apps/web/src/styles/app.css", "utf8");
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 460, height: 160 }, deviceScaleFactor: 3 });
// Servido por el dev server para que /assets/... resuelva igual que en el juego.
await p.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await p.evaluate((css) => {
  const s = document.createElement("style"); s.textContent = css + `
    body{background:#12100e!important;padding:26px!important;display:flex!important;gap:30px!important;align-items:center!important}`;
  document.head.appendChild(s);
  document.body.innerHTML = `
<span class="diceBadge d20"><span class="diceBadgeWrap"><img src="/assets/dice/d20.webp"><strong>17</strong></span><small>d20</small></span>
<span class="diceBadge d4"><span class="diceBadgeWrap"><img src="/assets/dice/d4.webp"><strong>3</strong></span><small>d4</small></span>
<span class="diceBadge d6"><span class="diceBadgeWrap"><img src="/assets/dice/d6.webp"><strong>5</strong></span><small>d6</small></span>
<span class="miniDiceFace d20"><span class="miniDiceImageWrap"><img src="/assets/dice/d20.webp"><strong>17</strong></span><small>d20</small></span>`;
}, css);
await p.waitForTimeout(600);
const broken = await p.evaluate(() => [...document.images].filter(i => !i.naturalWidth).length);
await p.screenshot({ path: "scripts/.shots/dice-after.png" });
await b.close();
console.log("imagenes rotas:", broken);
