import process from "node:process";

const base = (process.env.TINYQUEST_URL ?? process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");

async function expect(path, statuses, init) {
  const startedAt = performance.now();
  const response = await fetch(`${base}${path}`, { redirect: "manual", ...init });
  if (!statuses.includes(response.status)) throw new Error(`${path}: HTTP ${response.status}, esperado ${statuses.join("/")}`);
  console.log(`✓ ${path} → ${response.status} (${Math.round(performance.now() - startedAt)}ms)`);
  return response;
}

const home = await expect("/", [200]);
const html = await home.text();
if (!html.includes("Tiny Quest") || !html.includes("<script")) throw new Error("/: HTML inesperado");

// Verifica routing sin gastar una llamada de IA.
await expect("/api/groq/chat", [405]);
await expect("/api/gemini/chat", [405]);
await expect("/api/cf-image", [405]);
await expect("/api/pollinations", [400]);
await expect("/ws", [426]);

console.log(`Smoke de TinyQuest correcto en ${base}`);
