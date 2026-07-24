import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);

const audit = () => p.evaluate(() => {
  const out = { tiny: [], noLabel: [], noFocus: [], imgNoAlt: [], overlap: [] };
  for (const el of document.querySelectorAll("button, a[href], [role=button], input, select")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const name = (el.getAttribute("aria-label") || el.textContent || el.title || "").trim();
    const tag = `${el.tagName}.${el.className.toString().slice(0,34)}`;
    if (r.width < 24 || r.height < 24) out.tiny.push(`${tag} ${Math.round(r.width)}x${Math.round(r.height)} "${name.slice(0,24)}"`);
    if (!name) out.noLabel.push(tag);
    const cs = getComputedStyle(el);
    if (cs.outlineStyle === "none" && !cs.boxShadow.includes("rgb")) out.noFocus.push(tag);
  }
  for (const img of document.images) {
    if (!img.hasAttribute("alt")) out.imgNoAlt.push(img.src.split("/").slice(-2).join("/"));
  }
  return out;
});
const r = await audit();
for (const [k, v] of Object.entries(r)) if (v.length) console.log(`\n## ${k} (${v.length})\n` + [...new Set(v)].slice(0,10).join("\n"));
await b.close();
