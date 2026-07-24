import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
const calls = [];
p.on("request", r => /groq|gemini|openai|generativelanguage/i.test(r.url()) && calls.push(r.url().slice(0, 80)));
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
// Paso 3: arrancar la campana ya elegida sin tocar nada mas.
const start = p.locator("button", { hasText: /^(Empezar|Jugar|Comenzar|Iniciar|Forjar historia)/i });
const n = await start.count();
console.log("botones de arranque:", n, await start.allTextContents());
await b.close();
