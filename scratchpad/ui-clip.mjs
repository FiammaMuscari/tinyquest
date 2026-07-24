import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
console.log(await p.evaluate(() => {
  const e = document.querySelector(".heroSpecial");
  const out = [`heroSpecial scrollW=${e.scrollWidth} clientW=${e.clientWidth}`];
  const pr = e.getBoundingClientRect();
  for (const c of e.querySelectorAll("*")) {
    const r = c.getBoundingClientRect();
    if (r.right > pr.right + 1 || r.left < pr.left - 1)
      out.push(`  DESBORDA ${c.tagName}.${c.className.toString().slice(0,40)} left=${Math.round(r.left-pr.left)} right=${Math.round(r.right-pr.right)}`);
  }
  return out.join("\n");
}));
await b.close();
