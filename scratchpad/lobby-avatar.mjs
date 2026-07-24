// Prueba REAL de dos navegadores contra el relay Go (ws://localhost:8787):
// el invitado tiene que ver la MISMA toma que eligió el anfitrión, aunque no
// pueda descargar el retrato grande.
//
// Requisitos: `npm run dev` en 5173 y `go run ./cmd/server` en 8787.
//
// El caso peor a propósito: la IndexedDB del invitado está vacía y TODO pedido a
// pollinations está bloqueado, o sea que jamás va a poder resolver la URL grande.
// Si igual ve el encuadre correcto, es porque la miniatura viajó por el relay.
import { chromium } from "playwright-core";

const DEV = "http://127.0.0.1:5173";
// URL con pinta de retrato generado (isGeneratedPortraitUrl exige http) para las
// DOS tomas, distintas entre sí: así se nota si aparece la que no corresponde.
const FACE = "https://image.pollinations.ai/prompt/annie-frente?width=512&height=640";
const BODY = "https://image.pollinations.ai/prompt/annie-cuerpo?width=512&height=640";

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });

async function makePage(name) {
  // newContext y NO newPage: dos pages del mismo navegador comparten IndexedDB y
  // localStorage, y entonces el "invitado" tendría la caché de retratos del
  // anfitrión — que es justo la condición que la prueba tiene que descartar.
  const context = await browser.newContext({ viewport: { width: 1360, height: 700 } });
  const page = await context.newPage();
  const denied = [];
  const outside = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    // OJO: los retratos NO salen por el dominio de pollinations. Van por los proxys
    // del propio dev server (/api/cf-image y /api/pollinations, ver portraits.ts:288
    // y :444), que son mismo origen. Filtrar por dominio dejaba pasar la generación
    // real: el invitado resolvía su retrato igual y encima gastaba cuota.
    const isPortraitProxy = url.startsWith(`${DEV}/api/cf-image`) || url.startsWith(`${DEV}/api/pollinations`);
    if (isPortraitProxy || (!url.startsWith(DEV) && !url.startsWith("ws"))) {
      // El invitado tiene que arreglarse con lo que le llegó por el relay.
      outside.push(url.slice(0, 60));
      denied.push(url.slice(0, 48));
      return route.abort();
    }
    return route.continue();
  });
  page.on("console", (m) => { if (m.type() === "error") console.log(`  [${name}] ${m.text().slice(0, 110)}`); });
  await page.goto(DEV, { waitUntil: "domcontentloaded" });
  return { page, denied, outside };
}

// Siembra el personaje. `seedBlobs` solo lo hace el anfitrión: es quien generó el
// retrato y el único que lo tiene en su IndexedDB.
async function seedHero({ page }, { name, shot, seedBlobs }) {
  await page.evaluate(async ({ name, shot, seedBlobs, FACE, BODY }) => {
    if (seedBlobs) {
      const paint = async (label, color) => {
        const canvas = document.createElement("canvas");
        canvas.width = 512; canvas.height = 640;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 640);
        ctx.fillStyle = "#0b0a08"; ctx.font = "bold 64px sans-serif";
        ctx.fillText(label, 40, 340);
        return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      };
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("tiny-quest-portraits", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("portraits");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      // FRENTE amarilla, CUERPO violeta: dos imágenes inconfundibles a simple vista.
      const pairs = [[FACE, await paint("FRENTE", "#e8c65a")], [BODY, await paint("CUERPO", "#8b5cf6")]];
      await new Promise((resolve, reject) => {
        const tx = db.transaction("portraits", "readwrite");
        for (const [url, blob] of pairs) tx.objectStore("portraits").put(blob, url);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    }
    localStorage.setItem("tiny-quest:draft-character", JSON.stringify({
      name, species: "Humano de Juramento", role: "Guardia del Umbral", talent: "flame",
      avatarUrl: shot === "face" ? FACE : BODY,
      look: {
        gender: "femenino", skinTone: "clara", eyeColor: "verde", hairColor: "negro",
        hairLength: "largo", avatarShot: shot, faceUrl: FACE, fullBodyUrl: BODY
      }
    }));
  }, { name, shot, seedBlobs, FACE, BODY });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
}

const host = await makePage("host");
const guest = await makePage("guest");

// El anfitrión elige FRENTE. Es la toma que la party tiene que ver.
await seedHero(host, { name: "Annie", shot: "face", seedBlobs: true });
await seedHero(guest, { name: "ernie", shot: "fullbody", seedBlobs: false });

// La miniatura se calcula sola al montar; le damos aire antes de abrir la sala.
await host.page.waitForTimeout(2500);
const thumbBytes = await host.page.evaluate(() => {
  const draft = JSON.parse(localStorage.getItem("tiny-quest:draft-character") || "{}");
  return { bytes: draft.look?.avatarThumb?.length ?? 0, key: draft.look?.avatarThumbKey ?? null };
});
console.log(`anfitrión: miniatura de ${thumbBytes.bytes} bytes (clave ${thumbBytes.key})`);

await host.page.getByRole("button", { name: /Crear sala/i }).click();
await host.page.waitForSelector(".mpRoomCode, [class*=RoomCode], .mpPlayerList", { timeout: 20000 });
await host.page.waitForTimeout(1200);
const code = (await host.page.evaluate(() => {
  const match = document.body.innerText.match(/\b[A-Z0-9]{6}\b/);
  return match ? match[0] : null;
}));
console.log(`sala: ${code}`);
if (!code) { console.log("no se pudo leer el código"); await browser.close(); process.exit(1); }

await guest.page.getByRole("button", { name: /Unirse con código/i }).click();
await guest.page.waitForTimeout(600);
await guest.page.locator("input").first().fill(code);
await guest.page.getByRole("button", { name: /^Unirse$/i }).first().click();
await guest.page.waitForSelector(".mpPlayerList", { timeout: 20000 });
await guest.page.waitForTimeout(3500);

// Qué ve el invitado en el asiento del anfitrión.
const seen = await guest.page.evaluate(async () => {
  const rows = [...document.querySelectorAll(".mpPlayerRow")];
  const out = [];
  for (const row of rows) {
    const img = row.querySelector("img");
    const label = row.innerText.split("\n")[0];
    if (!img) { out.push(`${label}: SIN IMAGEN`); continue; }
    // Se lee el píxel real dibujado, no el atributo: es la única prueba de qué ve.
    const canvas = document.createElement("canvas");
    canvas.width = 8; canvas.height = 8;
    const ctx = canvas.getContext("2d");
    try { ctx.drawImage(img, 0, 0, 8, 8); } catch { out.push(`${label}: no se pudo leer`); continue; }
    const [r, g, b] = ctx.getImageData(4, 1, 1, 1).data;
    const kind = src => src.startsWith("data:image/jpeg") ? "miniatura" : src.startsWith("data:") ? "placeholder" : src.startsWith("blob:") ? "blob de caché" : "otro";
    out.push(`${label}: ${kind(img.src)} · rgb(${r},${g},${b}) · ${img.naturalWidth}x${img.naturalHeight}\n    src=${img.src.slice(0, 96)}`);
  }
  return out.join("\n");
});
console.log("--- lo que ve el invitado ---");
console.log(seen);
console.log("(FRENTE = amarillo ~e8c65a · CUERPO = violeta ~8b5cf6)");
console.log(`pedidos de retrato del invitado (todos cortados): ${guest.outside.length}`);
for (const u of [...new Set(guest.outside)].slice(0, 6)) console.log(`  ${u}`);

await guest.page.screenshot({ path: "scripts/.shots/lobby-guest.png" });
await host.page.screenshot({ path: "scripts/.shots/lobby-host.png" });
await browser.close();
