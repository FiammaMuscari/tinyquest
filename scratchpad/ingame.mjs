// Entra a la pantalla de partida SIN gastar cuota de LLM: la forja se responde con
// una historia canónica de scratchpad/fake-forge.json (el esquema exacto que pide
// generateImprovisedStory). Los retratos se siembran ya resueltos.
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
const forge = await readFile("scratchpad/fake-forge.json", "utf8");

export async function openGame({ width = 1360, height = 700 } = {}) {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
  const p = await b.newPage({ viewport: { width, height } });
  const blocked = [];
  await p.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.includes("/api/gemini/chat") || u.includes("/api/groq/chat")) {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ choices: [{ message: { content: forge } }] }) });
    }
    if (!u.startsWith("http://127.0.0.1:5173") && /pollinations|workers\.dev|googleapis|api\.groq|elevenlabs|amazonaws/i.test(u)) {
      blocked.push(u.slice(0, 60)); return route.abort();
    }
    return route.continue();
  });
  await p.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => {
    const shot = "data:image/svg+xml;utf8," + encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='275'><rect width='220' height='275' fill='#2b2038'/><circle cx='110' cy='92' r='46' fill='#c9a45c'/><rect x='50' y='158' width='120' height='132' rx='42' fill='#c9a45c'/></svg>`);
    localStorage.setItem("tiny-quest:draft-character", JSON.stringify({
      name: "Fiamy", species: "Humano de Juramento", role: "Guardia del Umbral",
      talent: "flame", avatarUrl: shot,
      look: { gender: "femenino", skinTone: "clara", eyeColor: "verde", hairColor: "negro",
              hairLength: "largo", avatarShot: "fullbody", faceUrl: shot, fullBodyUrl: shot }
    }));
  });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.locator("button.startCta").click();
  await p.waitForSelector(".sceneShell, .gameShell, .scenePanel, [class*=scenePanel]", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(2500);
  return { b, p, blocked };
}
