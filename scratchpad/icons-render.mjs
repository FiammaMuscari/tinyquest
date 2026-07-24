import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
const css = await readFile("apps/web/src/styles/app.css", "utf8");
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 520, height: 260 }, deviceScaleFactor: 3 });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await p.evaluate((css) => {
  const s = document.createElement("style");
  s.textContent = css + `body{background:#12100e!important;padding:18px!important}`;
  document.head.appendChild(s);
  const stats = ["body","mind","charm","creativity","courage","focus","luck"];
  const tal = [["flame","Fulgor"],["shield","Custodia"],["arcane","Arcano"],["verdant","Vínculo"]];
  document.body.innerHTML = `<div class="statBarsPanel">
    ${stats.slice(0,3).map(x=>`<div class="statBarRow"><img src="/assets/character/stats/${x}.webp"><span>${x}</span><strong>3</strong></div>`).join("")}
    <div class="talentPicker"><h3>Talentos</h3><div>
    ${tal.map(([id,n],i)=>`<button class="talentOption ${i===0?"selected":""}"><img src="/assets/character/talents/${id}.webp"><span>${n}</span></button>`).join("")}
    </div></div></div>`;
}, css);
await p.waitForTimeout(600);
const broken = await p.evaluate(() => [...document.images].filter(i => !i.naturalWidth).length);
await p.screenshot({ path: "scripts/.shots/icons-after.png" });
await b.close();
console.log("rotas:", broken);
