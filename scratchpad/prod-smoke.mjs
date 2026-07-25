// Humo de producción: que la app arranque de verdad en el worker desplegado.
// Se cortan los proxys de retrato para no gastar cuota de imágenes en la prueba.
import { chromium } from "playwright-core";
const URL = "https://tinyquest.fiammamuscari.workers.dev";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1360, height: 700 } });
const errors = [];
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (url.includes("/api/cf-image") || url.includes("/api/pollinations")) return route.abort();
  return route.continue();
});
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("ERR_FAILED")) errors.push(m.text().slice(0, 140)); });
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);
console.log(`título: ${await page.title()}`);
console.log(`lang: ${await page.evaluate(() => document.documentElement.lang)}`);
console.log(`botones visibles: ${(await page.evaluate(() => [...document.querySelectorAll("button")].filter(b => b.offsetParent).map(b => b.innerText.trim().split("\n")[0]).filter(Boolean))).slice(0, 6).join(" · ")}`);
console.log(`errores de página: ${errors.length}`);
for (const e of [...new Set(errors)].slice(0, 5)) console.log(`  ${e}`);
await page.screenshot({ path: "scripts/.shots/prod.png" });
await browser.close();
