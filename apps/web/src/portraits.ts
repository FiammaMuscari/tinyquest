import { useCallback, useEffect, useState } from "react";

// ─── Retratos generados por IA, con caché persistente ────────────────────────
// Pollinations (gratis, sin key) genera la imagen a partir de un prompt en la URL.
// Problema histórico: el servicio es lento/intermitente y un <img> que falla una
// vez perdía el retrato para siempre. Acá el flujo es:
//   URL determinística → IndexedDB (blob guardado) → si no está, fetch con cola
//   de concurrencia + reintentos → se guarda el blob → object URL para el <img>.
// Resultado: cada personaje se genera UNA sola vez y queda guardado en el navegador.

const DB_NAME = "tiny-quest-portraits";
const STORE = "portraits";
// Medido 2026-07-06: una generación fresca tarda 20-90s bajo carga, y Pollinations
// encola por IP — dos descargas en paralelo hacen que AMBAS superen el timeout.
// Por eso: de a UNA, timeout generoso, y el hook reintenta en segundo plano.
const FETCH_TIMEOUT_MS = 120_000;
const RETRY_DELAYS_MS = [0, 5_000, 15_000];
const MAX_CONCURRENT_FETCHES = 1;
const BACKGROUND_RETRY_MS = 30_000; // tras agotar la serie, el hook vuelve a intentar
const BACKGROUND_RETRY_ROUNDS = 8;

export function nameHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash;
}

// DIMENSIONES MÍNIMAS DE GENERACIÓN (calidad en desktop): retratos ≥512px de lado,
// arte de mundos/escenas ≥896px de ancho. Nunca pedir menos: la imagen se muestra
// hasta 2x en pantallas grandes y el upscale se nota. Cambiar dims cambia la URL
// (invalida esa caché) — hacerlo solo a propósito.
// El LLM imagina el aspecto (appearance) y este prompt lo pinta. Seed determinística
// por nombre → mismo personaje, mismo retrato durante toda la partida. `seedNonce`
// permite "reimaginar": nueva cara para la misma identidad.
// MISMO TRAZO en las dos tomas: la raíz del prompt es idéntica palabra por palabra
// y solo cambia el ENCUADRE — frente = plano 3/4 (cintura hacia arriba, 4:5);
// cuerpo = figura entera de lejos (2:3). Si el estilo diverge, flux pinta otro personaje.
const heroPromptRoot = "Fantasy RPG book character illustration, dark moody lighting, natural proportions, detailed painting";
const heroPromptTail = (name: string, appearance: string | undefined, styleHint: string) =>
  `: ${name}, ${appearance?.trim() || "figura enigmática con un secreto"}. Setting: ${styleHint}. Dark blurred background`;

export function characterPortraitUrl(name: string, appearance: string | undefined, styleHint: string, seedNonce = 0): string {
  const prompt = `${heroPromptRoot}, three-quarter shot from the waist up, face clearly visible${heroPromptTail(name, appearance, styleHint)}`;
  const seed = (nameHash(name) + seedNonce * 7919) % 100000;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=640&nologo=true&model=flux&seed=${seed}`;
}

// Imagen de cuerpo entero del héroe: MISMO personaje que el retrato de frente.
// La receta de consistencia es seed idéntica + prompt idéntico palabra por palabra
// (mismo estilo, misma descripción, mismo fondo) cambiando SOLO el encuadre:
// "half body" → "full body standing, head to toe". No tocar el estilo acá — si
// diverge del prompt de characterPortraitUrl, flux pinta OTRO personaje.
export function fullBodyPortraitUrl(name: string, appearance: string | undefined, styleHint: string, seedNonce = 0): string {
  // "wide shot from a distance… space above and below" fuerza cuerpo ENTERO de
  // lejos (sin esto flux devolvía un frente 3/4); "portrait" queda fuera porque
  // empuja al encuadre de busto. 512×768: a menos resolución flux deforma cuerpos.
  const prompt = `${heroPromptRoot}, wide full body shot from a distance, entire figure visible from head to feet with space above the head and below the feet, standing pose${heroPromptTail(name, appearance, styleHint)}`;
  const seed = (nameHash(name) + seedNonce * 7919) % 100000;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=768&nologo=true&model=flux&seed=${seed}`;
}

// Imagen de arquetipo para las cards de linaje/oficio del designer: un vistazo
// de "de qué va" cada opción. Seed por kind+nombre → cacheada para siempre.
export function archetypeImageUrl(kind: "lineage" | "role", name: string, description: string): string {
  const style = kind === "lineage"
    ? "Fantasy race archetype character portrait, atmospheric bust illustration"
    : "Fantasy adventurer profession illustration, iconic pose with tools of the trade";
  const prompt = `${style}: ${name}. ${description}. Dark moody painted background, rich detail, no text`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=384&height=384&nologo=true&model=flux&seed=${nameHash(kind + name) % 100000}`;
}

// Arte de mundo para las cards del lobby: paisaje/mapa pintado que caracteriza al
// mundo. Seed por id → misma imagen siempre, cacheada como cualquier retrato.
export function worldCardImageUrl(worldId: string, name: string, era: string, tagline: string): string {
  const prompt = `Epic fantasy illustrated world vista and map of ${name} (${era}): ${tagline}. Painted atlas style, dramatic light, rich detail, atmospheric, no text, no letters`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=896&height=504&nologo=true&model=flux&seed=${nameHash(worldId) % 100000}`;
}

// Ilustración de escena de la historia forjada: el mundo elegido CON los personajes
// creados interactuando. No es edición de la imagen del mundo (img2img no existe en
// el tier gratis): es una generación nueva que hereda mundo + elenco, cacheada por
// título. Cero uso de Gemini — las imágenes van siempre por Pollinations.
export function storySceneImageUrl(storyTitle: string, worldName: string, era: string, castLine: string): string {
  const prompt = `Epic fantasy story illustration, cinematic wide shot in the world of ${worldName} (${era}): the tale "${storyTitle}". Characters together in a tense scene: ${castLine}. Painted, dramatic light, rich detail, no text`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1120&height=480&nologo=true&model=flux&seed=${nameHash(storyTitle) % 100000}`;
}

// Imagen de escena VIVA durante la partida: se genera con la historia real y se
// renueva al cambiar de escena. El jugador elige el encuadre: lugar, héroe o ambiente.
export type SceneImageMode = "place" | "hero" | "mood";
export function liveSceneImageUrl(mode: SceneImageMode, campaignTitle: string, sceneTitle: string, objective: string, worldName: string, era: string, heroLine: string): string {
  const base = mode === "hero"
    ? `Fantasy story illustration: the hero (${heroLine}) inside the scene "${sceneTitle}", taking action. ${objective}.`
    : mode === "mood"
      ? `Atmospheric fantasy ambience illustration, abstract cinematic mood for "${sceneTitle}". ${objective}.`
      : `Fantasy environment concept art, atmospheric wide view of "${sceneTitle}". ${objective}.`;
  const prompt = `${base} World: ${worldName} (${era}). Tale: ${campaignTitle}. Painted, dramatic light, rich detail, no text`;
  const seed = nameHash(campaignTitle + sceneTitle + mode) % 100000;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=576&nologo=true&model=flux&seed=${seed}`;
}

// Retrato de la mascota: template propio de criatura (cuerpo entero), URL distinta
// de la del héroe — la compañera tiene SU imagen, no se mezcla en el retrato.
export function petPortraitUrl(name: string, description: string): string {
  const prompt = `Fantasy RPG magical creature companion portrait, adorable but epic, full body, dark moody lighting, detailed illustration: ${name}, ${description}. Dark blurred background`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&model=flux&seed=${nameHash(name) % 100000}`;
}

export function isGeneratedPortraitUrl(url: string | undefined): url is string {
  return typeof url === "string" && url.startsWith("http");
}

// ─── IndexedDB mínima (sin dependencias) ──────────────────────────────────────
let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function idbGet(key: string): Promise<Blob | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key: string, blob: Blob): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(blob, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ─── Cola de descargas con reintentos ─────────────────────────────────────────
let activeFetches = 0;
const waitingForSlot: Array<() => void> = [];

// `priority` salta la cola: el retrato del héroe que la jugadora está mirando
// se pinta antes que los prefetch del elenco.
async function acquireSlot(priority: boolean): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches += 1;
    return;
  }
  await new Promise<void>((resolve) => (priority ? waitingForSlot.unshift(resolve) : waitingForSlot.push(resolve)));
  activeFetches += 1;
}

function releaseSlot(): void {
  activeFetches -= 1;
  waitingForSlot.shift()?.();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPortraitBlob(url: string, priority: boolean): Promise<Blob> {
  let lastError: unknown = new Error("portrait fetch failed");
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    await acquireSlot(priority);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`portrait HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error(`portrait content-type ${blob.type}`);
        return blob;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
    } finally {
      releaseSlot();
    }
  }
  throw lastError;
}

// ─── API pública ──────────────────────────────────────────────────────────────
const readyObjectUrls = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

export function loadPortrait(url: string, options: { priority?: boolean } = {}): Promise<string> {
  const ready = readyObjectUrls.get(url);
  if (ready) return Promise.resolve(ready);
  const pending = inFlight.get(url);
  if (pending) return pending;
  const promise = (async () => {
    let blob = await idbGet(url).catch(() => undefined);
    if (!blob) {
      blob = await fetchPortraitBlob(url, options.priority ?? false);
      await idbPut(url, blob).catch(() => undefined); // sin persistencia sigue funcionando en memoria
    }
    const objectUrl = URL.createObjectURL(blob);
    readyObjectUrls.set(url, objectUrl);
    return objectUrl;
  })();
  // Si falla del todo, se borra el registro: el próximo mount lo vuelve a intentar solo.
  promise.catch(() => inFlight.delete(url));
  inFlight.set(url, promise);
  return promise;
}

export type PortraitStatus = "idle" | "loading" | "ready" | "failed";

// Hook para <img>: mantiene la imagen anterior mientras llega la nueva (sin parpadeo),
// reporta estado para animar "forjando retrato" y expone retry manual. Si la serie
// de descargas falla (servicio saturado), sigue reintentando solo cada 30s mientras
// el componente esté montado: el retrato "llega tarde" en vez de no llegar nunca.
export function useGeneratedPortrait(url: string | undefined, options: { priority?: boolean } = {}): { src: string | null; status: PortraitStatus; retry: () => void } {
  const { priority = false } = options;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ src: string | null; status: PortraitStatus }>({ src: null, status: url ? "loading" : "idle" });
  useEffect(() => {
    if (!url) {
      setState({ src: null, status: "idle" });
      return;
    }
    let alive = true;
    let timer: number | undefined;
    const run = (roundsLeft: number) => {
      setState((prev) => ({ src: prev.src, status: "loading" }));
      loadPortrait(url, { priority })
        .then((src) => alive && setState({ src, status: "ready" }))
        .catch(() => {
          if (!alive) return;
          setState((prev) => ({ src: prev.src, status: "failed" }));
          if (roundsLeft > 0) timer = window.setTimeout(() => alive && run(roundsLeft - 1), BACKGROUND_RETRY_MS);
        });
    };
    run(BACKGROUND_RETRY_ROUNDS);
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [url, attempt, priority]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}

// Spinner de carga como data-URI (SVG animado con SMIL): fondo gris + arco girando.
// Sirve como src de cualquier <img> mientras la IA pinta la imagen real.
const spinnerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#23262e"/><circle cx="64" cy="64" r="22" fill="none" stroke="#8b90a0" stroke-width="7" stroke-dasharray="96 42" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 64 64" to="360 64 64" dur="0.9s" repeatCount="indefinite"/></circle></svg>`;
export const loadingSpinnerDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(spinnerSvg)}`;

// Medallón procedural como data-URI: sirve de placeholder/fallback en cualquier
// <img> existente (hereda el CSS del selector img) mientras la IA pinta el real.
export function medallionDataUri(name: string): string {
  const hash = nameHash(name || "?");
  const hue = hash % 360;
  const hue2 = (hue + 40 + (hash % 60)) % 360;
  const initial = (name.replace(/^(el|la|los|las|un|una)\s+/i, "").trim()[0] ?? "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><radialGradient id="g" cx="35%" cy="30%" r="85%"><stop offset="0%" stop-color="hsl(${hue}, 55%, 38%)"/><stop offset="100%" stop-color="hsl(${hue2}, 60%, 14%)"/></radialGradient></defs><rect width="128" height="128" fill="url(#g)"/><circle cx="64" cy="50" r="19" fill="rgba(8,10,16,.55)"/><path d="M24 106 Q64 72 104 106 L104 128 L24 128 Z" fill="rgba(8,10,16,.55)"/><text x="64" y="78" text-anchor="middle" font-size="42" font-weight="900" font-family="Georgia, serif" fill="#fff3d8">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
