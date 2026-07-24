import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1360, height: 700 } });
// Cortafuegos: NADA de generacion de imagenes ni de LLM. Si algo intenta salir,
// queda registrado y se aborta — asi no gastamos cuota solo por mirar la UI.
const blocked = [];
await p.route("**/*", (route) => {
  const u = route.request().url();
  // Solo origenes EXTERNOS: bloquear por substring pisaba modulos locales de Vite
  // (packages/atmosphere/...bedrock...) y rompia la app.
  const external = !u.startsWith("http://127.0.0.1:5173");
  if ((external && /pollinations|cloudflare|workers\.dev|generativelanguage|googleapis|api\.groq|elevenlabs|amazonaws/i.test(u))
      || u.startsWith("http://127.0.0.1:5173/api/")) {
    blocked.push(u.slice(0, 70)); return route.abort();
  }
  return route.continue();
});
await p.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
await p.evaluate(() => {
  // Heroe con look COMPLETO y retratos ya resueltos: asi lookComplete() da true y
  // no dispara el pipeline de retratos.
  const shot = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='275'><rect width='220' height='275' fill='#241b33'/><circle cx='110' cy='95' r='46' fill='#c9a45c'/><rect x='52' y='160' width='116' height='130' rx='40' fill='#c9a45c'/></svg>`);
  localStorage.setItem("tiny-quest:draft-character", JSON.stringify({
    name: "Fiamy", species: "Humano de Juramento", role: "Guardia del Umbral",
    talent: "flame", avatarUrl: shot,
    look: { gender: "femenino", skinTone: "clara", eyeColor: "verde", hairColor: "negro",
            hairLength: "largo", avatarShot: "fullbody", faceUrl: shot, fullBodyUrl: shot }
  }));
});
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.locator("button.startCta").click();
await p.waitForTimeout(2500);
await p.screenshot({ path: "scripts/.shots/game-01.png" });
await p.screenshot({ path: "scripts/.shots/game-full.png", fullPage: true });
console.log(await p.evaluate(() => {
  const d = document.documentElement;
  const cols = [...document.querySelectorAll("main > *, .gameLayout > *, [class*=Column]")]
    .map(e => { const r = e.getBoundingClientRect(); return `  ${e.tagName}.${e.className.toString().slice(0,44)} ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top+scrollY)}`; });
  return `alto total ${d.scrollHeight}px / viewport 700\ncolumnas:\n` + cols.join("\n");
}));
await b.close();
console.log("bloqueados:", [...new Set(blocked)]);
