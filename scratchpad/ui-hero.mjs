import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
console.log(await p.evaluate(() => {
  const panel = document.querySelector(".heroSummary");
  const walk = (e, d = 0) => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    let out = `${"  ".repeat(d)}${e.tagName}.${e.className.toString().slice(0,40)} h=${Math.round(r.height)} pad=${cs.paddingTop}/${cs.paddingBottom} gap=${cs.gap} mg=${cs.marginTop}/${cs.marginBottom}\n`;
    if (d < 3) for (const c of e.children) out += walk(c, d + 1);
    return out;
  };
  return walk(panel);
}));
await b.close();
