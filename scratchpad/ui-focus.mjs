import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
const rows = [];
for (let i = 0; i < 8; i++) {
  await p.keyboard.press("Tab");
  rows.push(await p.evaluate(() => {
    const e = document.activeElement; const cs = getComputedStyle(e);
    return `${e.tagName}.${e.className.toString().slice(0,30)} outline=${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} shadow=${cs.boxShadow.slice(0,40)}`;
  }));
}
console.log(rows.join("\n"));
await p.screenshot({ path: "scripts/.shots/ui-focus.png" });
await b.close();
