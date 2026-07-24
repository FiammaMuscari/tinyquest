import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
console.log(await p.evaluate(() => {
  const pick = (sel) => [...document.querySelectorAll(sel)].map(e => {
    const r = e.getBoundingClientRect();
    return { cls: e.className.toString().slice(0, 48), y: Math.round(r.top + scrollY), h: Math.round(r.height) };
  });
  const rows = [...document.querySelectorAll(".lobbyStep, .panel, .heroSummaryRow, .worldGrid, .campaignGrid, .lobbyHint, .startHint")]
    .map(e => { const r = e.getBoundingClientRect(); return `${Math.round(r.top+scrollY).toString().padStart(5)}  h=${Math.round(r.height).toString().padStart(4)}  ${e.tagName}.${e.className.toString().slice(0,54)}`; });
  return rows.join("\n") + `\n\nTOTAL ${document.documentElement.scrollHeight}px / viewport 700px`;
}));
await b.close();
