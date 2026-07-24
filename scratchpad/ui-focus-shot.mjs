import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
for (let i = 0; i < 4; i++) await p.keyboard.press("Tab"); // llega al CTA crema
await p.screenshot({ path: "scripts/.shots/ui-focus-cta.png", clip: { x: 100, y: 460, width: 1200, height: 130 } });
for (let i = 0; i < 1; i++) await p.keyboard.press("Tab"); // tarjeta de mundo
await p.evaluate(() => document.activeElement.scrollIntoView({ block: "center" }));
await p.waitForTimeout(300);
const r = await p.evaluate(() => { const b = document.activeElement.getBoundingClientRect(); return { x: Math.max(0,b.x-20), y: Math.max(0,b.y-20), width: Math.min(600,b.width+40), height: Math.min(320,b.height+40) }; });
await p.screenshot({ path: "scripts/.shots/ui-focus-card.png", clip: r });
await b.close();
console.log("ok");
