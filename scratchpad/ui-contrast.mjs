import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
await p.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
console.log(await p.evaluate(() => {
  const lum = ([r,g,b]) => { const f = c => { c/=255; return c<=.03928 ? c/12.92 : ((c+.055)/1.055)**2.4; }; return .2126*f(r)+.7152*f(g)+.0722*f(b); };
  const parse = s => (s.match(/\d+(\.\d+)?/g)||[0,0,0]).slice(0,3).map(Number);
  const bgOf = el => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor; const a = c.match(/[\d.]+/g); if (a && (a.length < 4 || Number(a[3]) > .75)) return parse(c); e = e.parentElement; } return [10,8,6]; };
  const bad = [];
  for (const el of document.querySelectorAll("p, span, small, li, strong, em, b, h1, h2, h3, h4, button, a")) {
    const t = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ").trim();
    if (!t || t.length < 3) continue;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (!r.width || cs.visibility === "hidden" || Number(cs.opacity) < .5) continue;
    const fg = parse(cs.color), bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;
    if (ratio < need) bad.push(`${ratio.toFixed(2)} (min ${need}) ${px}px ${el.tagName}.${el.className.toString().slice(0,26)} "${t.slice(0,40)}"`);
  }
  return bad.length ? [...new Set(bad)].join("\n") : "sin problemas de contraste";
}));
await b.close();
