import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
console.log(await p.evaluate(() => {
  const shell = document.querySelector(".lobbyLayout") || document.querySelector(".lobbyShell");
  const cs = getComputedStyle(shell);
  const kids = [...shell.children].map(e => {
    const r = e.getBoundingClientRect(), k = getComputedStyle(e);
    return `  ${e.tagName}.${e.className.toString().slice(0,42)} h=${Math.round(r.height)} pad=${k.paddingTop}/${k.paddingBottom} gap=${k.gap}`;
  });
  return `lobbyLayout gap=${cs.gap} pad=${cs.paddingTop}/${cs.paddingBottom} h=${Math.round(shell.getBoundingClientRect().height)}\n` + kids.join("\n");
}));
await b.close();
