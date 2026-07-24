// Verifica en un navegador real que buildPortraitThumb produce una miniatura que
// (a) conserva la proporción de la toma original y (b) entra en el tope del relay.
import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });

console.log(await page.evaluate(async () => {
  const mod = await import("/src/portraits.ts");
  const url = "https://image.pollinations.ai/prompt/prueba?width=512&height=640";

  // Semilla: un retrato falso 512x640 metido en la MISMA IndexedDB que usa el juego.
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 640;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 512, 640);
  grad.addColorStop(0, "#d4af37"); grad.addColorStop(1, "#12100b");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 640);
  ctx.fillStyle = "#75eadb"; ctx.beginPath(); ctx.arc(256, 200, 90, 0, 7); ctx.fill();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));

  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open("tiny-quest-portraits", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("portraits");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("portraits", "readwrite");
    tx.objectStore("portraits").put(blob, url);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });

  const thumb = await mod.buildPortraitThumb(url);
  if (!thumb) return "buildPortraitThumb devolvió null";
  const img = new Image();
  img.src = thumb;
  await img.decode();
  const key = mod.portraitThumbKey(url);
  return [
    `miniatura ${img.naturalWidth}x${img.naturalHeight} (original 512x640)`,
    `proporción original=${(512 / 640).toFixed(3)} miniatura=${(img.naturalWidth / img.naturalHeight).toFixed(3)}`,
    `peso=${thumb.length} bytes (tope ${mod.AVATAR_THUMB_MAX_BYTES})`,
    `clave=${key} estable=${key === mod.portraitThumbKey(url)} distinta de otra url=${key !== mod.portraitThumbKey(url + "x")}`,
    `sin caché devuelve null: ${await mod.buildPortraitThumb("https://image.pollinations.ai/prompt/inexistente") === null}`
  ].join("\n");
}));

await browser.close();
