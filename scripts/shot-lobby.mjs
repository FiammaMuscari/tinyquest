// Screenshot del lobby con Playwright (Chrome del sistema) para iterar diseño.
// Uso: node scripts/shot-lobby.mjs [outDir]  →  lobby-full.png + lobby-1360.png
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const outDir = process.argv[2] ?? "scripts/.shots";
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });

// Referencia del mockup (1672 ancho) y viewport real de Fiamy (1360×700).
for (const [name, viewport] of [["lobby-full", { width: 1672, height: 941 }], ["lobby-1360", { width: 1360, height: 700 }]]) {
  const page = await browser.newPage({ viewport });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  await page.close();
}
await browser.close();
console.log(`ok → ${outDir}`);
