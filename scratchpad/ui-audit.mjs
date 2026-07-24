import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 }, deviceScaleFactor: 1 });
const errs = [];
p.on("console", m => m.type() === "error" && errs.push(m.text().slice(0, 160)));
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await p.screenshot({ path: "scripts/.shots/ui-01-lobby.png" });
const info = await p.evaluate(() => {
  const d = document.documentElement;
  const over = [...document.querySelectorAll("body *")]
    .filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== "auto" && getComputedStyle(e).overflowX !== "scroll")
    .slice(0, 8).map(e => `${e.tagName}.${e.className}`.slice(0, 70));
  return { pageScrollH: d.scrollHeight, viewportH: window.innerHeight, overflowX: d.scrollWidth > d.clientWidth, over,
    buttons: [...document.querySelectorAll("button")].slice(0, 14).map(x => x.textContent.trim().slice(0, 30)) };
});
console.log(JSON.stringify(info, null, 1));
console.log("errores consola:", errs);
await b.close();
