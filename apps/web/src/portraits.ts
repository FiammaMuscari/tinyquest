import { useCallback, useEffect, useState } from "react";
import { anatomyFidelityRules, classifyBeingVisual, creaturePortraitPrompt, humanoidPortraitPrompt, phenomenonPortraitPrompt, sceneStylePrompt, shouldRenderAsCreature, TINY_QUEST_VISUAL_STYLE, worldImageConstraints } from "./visual-identity";

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
// ─── Estilo: los prompts de abajo SON las claves del cache de Fiamy ──────────
// ROLLBACK Fase 0 (2026-07-11): la unificación STYLE_DNA re-clavó todas las URLs
// y las imágenes de referencia de Fiamy "desaparecieron" (seguían en IndexedDB
// bajo las claves viejas). Los templates volvieron a su texto EXACTO original.
// Si algún día se rehace la Fase 0, debe incluir MIGRACIÓN de caché (copiar los
// blobs de la URL vieja a la nueva en IndexedDB) y el ok explícito de Fiamy.

// El LLM imagina el aspecto (appearance) y este prompt lo pinta. Seed determinística
// por nombre → mismo personaje, mismo retrato durante toda la partida. `seedNonce`
// permite "reimaginar": nueva cara para la misma identidad.
// MISMO TRAZO en las dos tomas: la raíz del prompt es idéntica palabra por palabra
// y solo cambia el ENCUADRE — frente = primer plano 3/4; cuerpo = de cabeza a
// rodillas. Cuerpo se deriva además desde Frente por img2img en el Worker.
const heroPromptRoot = TINY_QUEST_VISUAL_STYLE;
const heroPromptTail = (name: string, styleHint: string) =>
  ` Character: ${name}. ${styleHint}. COLOR LOCK: exact selected skin, iris and hair colors, unaffected by species or lighting. Same canonical clothing, weapons, jewelry and scars in both shots. Simple dark tonal gradient only.`;

export function characterPortraitUrl(name: string, appearance: string | undefined, styleHint: string, seedNonce = 0): string {
  // MISMAS dimensiones y seed que el cuerpo: mismo tensor de ruido inicial → la
  // mayor consistencia de personaje posible sin img2img (kontext es de pago).
  // El marco 4:5 de la UI recorta el sobrante con cover anclado arriba.
  // Mantener EXACTO el prompt aprobado del avatar: recupera las imágenes previas
  // desde IndexedDB y evita convertir al protagonista al estilo de los NPC.
  // IDENTIDAD PRIMERO: Flux Schnell pondera con más fuerza el inicio. Poner el
  // estilo antes hacía que obedeciera "pintado" pero ignorara pelo/ojos/piel.
  const prompt = `TINYQUEST HERO MASTER V16. CAMERA MANDATORY: close three-quarter profile portrait, head and torso, face turned exactly 30 degrees from camera, both eyes visible, entire head and shoulders visible. This 30-degree three-quarter face angle is mandatory, never straight-on. IDENTITY AND WARDROBE LOCK: ${appearance?.trim() || "mysterious fantasy hero"}. ${heroPromptRoot}.${heroPromptTail(name, styleHint)}`;
  const seed = (nameHash(name) + seedNonce * 7919) % 100000;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&model=flux&seed=${seed}`;
}

// Imagen de cuerpo hasta las rodillas: MISMO personaje que el retrato de frente.
// La receta de consistencia es seed idéntica + prompt idéntico palabra por palabra
// (mismo estilo, misma descripción, mismo fondo) cambiando SOLO el encuadre:
// "close portrait" → "knee-up standing". No tocar el estilo acá — si
// diverge del prompt de characterPortraitUrl, flux pinta OTRO personaje.
export function fullBodyPortraitUrl(name: string, appearance: string | undefined, styleHint: string, seedNonce = 0): string {
  // Plano americano estricto: revela ropa/armas sin malgastar resolución en pies
  // ni alejar tanto el rostro. El Worker usa Frente como input_image_0 y cambia
  // SOLO el encuadre; no vuelve a inventar persona ni vestuario.
  const prompt = `TINYQUEST HERO KNEE-UP V16. CAMERA MANDATORY: medium-long three-quarter-length standing shot from the top of the head through BOTH KNEES. Knees touch the lower frame edge. Show torso, waist, hips and upper legs. DO NOT show lower legs, ankles, boots, feet or floor. Face remains turned exactly 30 degrees with both eyes visible. IDENTITY AND WARDROBE LOCK: ${appearance?.trim() || "mysterious fantasy hero"}. ${heroPromptRoot}.${heroPromptTail(name, styleHint)} SAME PERSON AND PIXEL-FAITHFUL OUTFIT AS MASTER REFERENCE.`;
  const seed = (nameHash(name) + seedNonce * 7919) % 100000;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&model=flux&seed=${seed}`;
}

// Arquetipos de linaje/oficio PRE-GENERADOS y guardados como assets fijos
// (apps/web/public/assets/archetypes): no se regeneran en cada partida y son la
// base visual del linaje/oficio elegido. Clave = "kind:nombre exacto". Un
// arquetipo nuevo sin asset cae al generador por URL (abajo).
const ARCHETYPE_ASSETS: Record<string, string> = {
  "lineage:Humano de Juramento": "/assets/archetypes/lineage-human-oath.webp",
  "lineage:Elfo del Velo": "/assets/archetypes/lineage-duskelder.webp",
  "lineage:Enano de Runafosa": "/assets/archetypes/lineage-rune-dwarf.webp",
  "lineage:Mediano del Camino": "/assets/archetypes/lineage-road-halfling.webp",
  "lineage:Marcado por Dragón": "/assets/archetypes/lineage-dragon-marked.webp",
  "lineage:Tocado por la Tumba": "/assets/archetypes/lineage-grave-touched.webp",
  "role:Guardia del Umbral": "/assets/archetypes/role-umbral-guard.webp",
  "role:Oráculo de Almas": "/assets/archetypes/role-soul-oracle.webp",
  "role:Cerrajera de Ruinas": "/assets/archetypes/role-ruin-locksmith.webp",
  "role:Juramentado de Ceniza": "/assets/archetypes/role-ash-oath.webp",
  "role:Diplomática de Sangre": "/assets/archetypes/role-blood-diplomat.webp",
  "role:Vinculador de Reliquias": "/assets/archetypes/role-relic-binder.webp",
  "role:Sombra del Gremio": "/assets/archetypes/role-guild-shadow.webp",
  "role:Arquera del Alba": "/assets/archetypes/role-dawn-archer.webp"
};

// Imagen de arquetipo para las cards de linaje/oficio del designer: un vistazo
// de "de qué va" cada opción. Usa el asset fijo si existe; si no, lo genera
// (misma URL/seed con la que se pre-generó, para que coincida al guardarlo).
export function archetypeImageUrl(kind: "lineage" | "role", name: string, description: string): string {
  const asset = ARCHETYPE_ASSETS[`${kind}:${name}`];
  if (asset) return asset;
  const style = kind === "lineage"
    ? "Fantasy race archetype character portrait, atmospheric bust illustration"
    : "Fantasy adventurer profession illustration, iconic pose with tools of the trade";
  const prompt = `${style}: ${name}. ${description}. Dark moody painted background, rich detail, no text`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=384&height=384&nologo=true&model=flux&seed=${nameHash(kind + name) % 100000}`;
}

/** El arquetipo de linaje elegido, como imagen de referencia estable (base visual
 * del héroe). Vacío si el linaje aún no tiene asset pre-generado. */
export function lineageArchetypeAsset(speciesName: string): string | undefined {
  return ARCHETYPE_ASSETS[`lineage:${speciesName}`];
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
export function storySceneImageUrl(storyTitle: string, worldName: string, era: string, sceneHint?: string, ambience = "", worldRules: string[] = []): string {
  // Fondo de PAISAJE/AMBIENTE, SIN personajes: encima se composita el retrato
  // REAL del héroe (el Frente/Cuerpo que eligió el jugador) con fundido elíptico.
  // Prompt idéntico al original: los fondos ya cacheados siguen siendo válidos.
  const where = sceneHint?.trim() ? ` Setting detail: ${sceneHint}.` : "";
  const laws = worldImageConstraints(worldName, ambience, worldRules);
  const prompt = `CLEAN ENVIRONMENT MATTE-PAINTING BACKGROUND PLATE FOR FILM COMPOSITING. ABANDONED EVACUATED GHOST CITY OR WILDERNESS, before inhabitants arrive. ABSOLUTE WORLD CONSTRAINTS: ${laws}. ${sceneStylePrompt()}. Wide establishing shot of a dramatic location for the tale "${storyTitle}" in ${worldName} (${era}).${where} Show the vacant architecture, terrain, sky and atmosphere as a clean background plate. The environment must visibly demonstrate every world law.`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1120&height=480&nologo=true&model=flux&seed=${nameHash(storyTitle) % 100000}`;
}

// Imagen de escena VIVA durante la partida: se genera con la historia real y se
// renueva al cambiar de escena. El jugador elige el encuadre: lugar, héroe o ambiente.
export type SceneImageMode = "place" | "hero" | "mood";
export function liveSceneImageUrl(mode: SceneImageMode, campaignTitle: string, sceneTitle: string, objective: string, worldName: string, era: string, heroLine: string, ambience = "", worldRules: string[] = [], beat?: string): string {
  const base = mode === "hero"
    ? `Fantasy story illustration: the hero (${heroLine}) inside the scene "${sceneTitle}", taking action. ${objective}.`
    : mode === "mood"
      ? `Atmospheric fantasy ambience illustration, abstract cinematic mood for "${sceneTitle}". ${objective}.`
      : `Fantasy environment concept art, atmospheric wide view of "${sceneTitle}". ${objective}.`;
  const identity = mode === "hero" ? ` ${anatomyFidelityRules(heroLine)}` : "";
  const laws = worldImageConstraints(worldName, ambience, worldRules);
  const storyBeat = beat?.trim() ? `CURRENT CONFIRMED STORY BEAT: ${beat.trim()} ` : "";
  const subjectPolicy = mode === "hero"
    ? "SINGLE-SUBJECT FILM COMPOSITE: one canonical hero alone dominates the subject layer."
    : "CLEAN ENVIRONMENT MATTE-PAINTING BACKGROUND PLATE: abandoned, evacuated and empty before inhabitants arrive; architecture and terrain exclusively.";
  const prompt = `${storyBeat}ABSOLUTE WORLD CONSTRAINTS: ${laws}. ${subjectPolicy} ${sceneStylePrompt()}. ${base}${identity} World: ${worldName} (${era}). Tale: ${campaignTitle}. Show the confirmed beat visually without inventing new people, objects or facts. World laws override visual clichés and objective text. Match character and environment light/color when hero mode is active. ${subjectPolicy}`;
  const seed = nameHash(campaignTitle + sceneTitle + mode + (beat ?? "")) % 100000;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=576&nologo=true&model=flux&seed=${seed}`;
}

// Retrato de la mascota: template propio de criatura (cuerpo entero), URL distinta
// de la del héroe — la compañera tiene SU imagen, no se mezcla en el retrato.
// Template original (clave de cache). La criatura se pinta como bestia — el
// ruteo por aspecto vive en beingPortraitUrl (un gato NPC entra por acá).
export function petPortraitUrl(name: string, description: string): string {
  const prompt = creaturePortraitPrompt(name, description);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=448&height=448&nologo=true&model=flux&seed=${nameHash(name) % 100000}`;
}

// Delata si un personaje NO es humano sino un animal/criatura por su aspecto: sus
// retratos deben pintarse como bestia, no como persona. Se chequea SOLO sobre
// nombre + aspecto/descripción (nunca el styleHint del mundo, que puede decir
// "Marcado por Dragón" sin que el personaje sea un dragón).
export function looksLikeCreature(...texts: Array<string | undefined>): boolean {
  const [name = "", ...description] = texts;
  return shouldRenderAsCreature(name, description.filter(Boolean).join(" "));
}

// Retrato de un personaje del elenco (NPC o enemigo): humano por defecto, pero si
// su aspecto lo delata como animal/criatura usa el prompt de bestia. Punto único
// para que cast, portada y prefetch coincidan en la MISMA URL (misma caché).
export function beingPortraitUrl(name: string, appearance: string | undefined, styleHint: string): string {
  return beingPortraitUrlWithContext(name, appearance, styleHint);
}

export type BeingPortraitContext = { description?: string; role?: string };

/** Retrato canónico de cualquier entidad. `appearance` manda sobre la anatomía y
 * `description` aporta la función visible; ambas viajan juntas para que la imagen
 * no contradiga la ficha que ve la jugadora. */
export function beingPortraitUrlWithContext(name: string, appearance: string | undefined, styleHint: string, context: BeingPortraitContext = {}): string {
  const description = context.description?.trim();
  const exact = appearance?.trim();
  const visualSpec = [
    exact,
    description && description !== exact ? `NARRATIVE DESCRIPTION TO MATCH VISUALLY: ${description}` : undefined
  ].filter(Boolean).join(". ") || undefined;
  const kind = classifyBeingVisual(name, visualSpec, context.role);
  const prompt = kind === "phenomenon"
    ? phenomenonPortraitPrompt(name, visualSpec, styleHint)
    : kind === "creature" || kind === "hybrid"
      ? creaturePortraitPrompt(name, visualSpec, styleHint, kind)
      : humanoidPortraitPrompt(name, visualSpec, styleHint);
  // Los NPC se muestran como medallones: 448² conserva detalle incluso en el
  // lightbox, reduce ~23% los píxeles respecto de 512² y no malgasta tiempo en
  // piernas que el recorte circular nunca muestra.
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=448&height=448&nologo=true&model=flux&seed=${nameHash(name) % 100000}`;
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

/** Cachea arte derivado (por ejemplo la portada ya compuesta) en el mismo
 * almacén persistente que las generaciones. La clave lleva un namespace para
 * no confundirse con una URL de proveedor. */
export async function getCachedImage(key: string): Promise<string | null> {
  const blob = await idbGet(`derived:${key}`).catch(() => undefined);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function cacheImage(key: string, blob: Blob): Promise<string> {
  await idbPut(`derived:${key}`, blob);
  return URL.createObjectURL(blob);
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

// ─── Vía rápida: Cloudflare Workers AI (proxy /api/cf-image del dev server) ──
// La clave de caché sigue siendo la URL de Pollinations (NO cambia): de ella se
// extraen prompt/tamaño/seed y se intenta generar en CF (~2-5s). Si el proxy no
// está configurado (501) se apaga para la sesión; ante cualquier fallo se cae a
// Pollinations como siempre. Las imágenes ya cacheadas no se regeneran nunca.
let cfImageAvailable = true;
let cfImageQuotaBlockedUntil = 0;
const portraitReferences = new Map<string, string>();
const portraitStyleReferences = new Map<string, string[]>();
const styleReferencePayloads = new Map<string, Promise<{ data: string; type: string }>>();

class QualityImageQuotaError extends Error {
  constructor(readonly retryAt: number) {
    super("TINYQUEST_QUALITY_IMAGE_QUOTA_EXHAUSTED");
  }
}

function nextUtcMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/** Declara que una variante debe editarse desde otra imagen canónica. Se llama
 * antes de montar el <img>, evitando que una carrera dispare text-to-image. */
export function linkPortraitReference(targetUrl: string, referenceUrl: string): void {
  portraitReferences.set(targetUrl, referenceUrl);
}

/** Referencias estéticas aprobadas; nunca reemplazan identidad/colores. */
export function linkPortraitStyleReferences(targetUrl: string, styleUrls: string[]): void {
  portraitStyleReferences.set(targetUrl, [...styleUrls]);
}


async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function styleReferencePayload(styleUrl: string): Promise<{ data: string; type: string }> {
  const cached = styleReferencePayloads.get(styleUrl);
  if (cached) return cached;
  const pending = fetch(styleUrl).then(async (result) => {
    if (!result.ok) throw new Error(`style reference HTTP ${result.status}`);
    const blob = await result.blob();
    return { data: await blobToBase64(blob), type: blob.type || "image/png" };
  });
  pending.catch(() => styleReferencePayloads.delete(styleUrl));
  styleReferencePayloads.set(styleUrl, pending);
  return pending;
}

async function fetchViaCloudflare(url: string, referenceUrl?: string, styleUrls: string[] = []): Promise<Blob | null> {
  if (!cfImageAvailable || !url.startsWith("https://image.pollinations.ai/")) return null;
  // No caer a Sana mientras la cuota de calidad está agotada. Al llegar el
  // reset diario UTC se rehabilita solo, sin recargar ni degradar el retrato.
  if (Date.now() < cfImageQuotaBlockedUntil) throw new QualityImageQuotaError(cfImageQuotaBlockedUntil);
  try {
    const parsed = new URL(url);
    const prompt = decodeURIComponent(parsed.pathname.replace(/^\/prompt\//, ""));
    if (!prompt) return null;
    const width = Number(parsed.searchParams.get("width") ?? "512");
    const height = Number(parsed.searchParams.get("height") ?? "512");
    // CAMBIO DE PROVEEDOR (2026-07-11): Pollinations RETIRÓ flux — su único
    // modelo hoy es "sana" (calidad muy inferior) y la cola por IP es de 1
    // pedido (todo lo demás rebota 429). El estilo aprobado por Fiamy ES flux,
    // así que la vía principal pasa a Cloudflare flux-1-schnell (steps 8, ~3s)
    // para TODOS los tamaños; Pollinations queda solo de último recurso.
    // Las claves de caché no cambian: lo ya generado sigue intacto.
    const seed = Number(parsed.searchParams.get("seed") ?? "0");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50_000);
    try {
      const referencePayload = referenceUrl ? (async () => {
        const referenceSrc = await loadPortrait(referenceUrl, { priority: true });
        const referenceBlob = await fetch(referenceSrc).then((result) => result.blob());
        return { image: await blobToBase64(referenceBlob), type: referenceBlob.type || "image/jpeg" };
      })() : Promise.resolve({ image: undefined, type: undefined });
      // Las referencias locales se leen/convierten en paralelo con la generación
      // de Frente y quedan memoizadas para reimaginados posteriores.
      const [reference, styleImages] = await Promise.all([
        referencePayload,
        Promise.all(styleUrls.map(styleReferencePayload))
      ]);
      const response = await fetch("/api/cf-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, width, height, seed, referenceImage: reference.image, referenceType: reference.type, styleImages }),
        signal: controller.signal
      });
      if (response.status === 501 || response.status === 404 || response.status === 405) {
        cfImageAvailable = false;
        return null;
      }
      if (response.status === 429) {
        cfImageQuotaBlockedUntil = nextUtcMidnight();
        throw new QualityImageQuotaError(cfImageQuotaBlockedUntil);
      }
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return null;
      return blob;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    // No cachear una imagen inferior cuando se agota la cuota del proveedor de
    // calidad. El hook conserva la imagen anterior y reintenta más tarde.
    if (error instanceof QualityImageQuotaError) throw error;
    return null;
  }
}

// Pollinations corta conexiones LARGAS de navegador de forma intermitente
// ("Failed to fetch" tras 30-90s de cola, medido 2026-07-11): el dev server
// hace de puente estable (/api/pollinations). Si el proxy no existe (build
// estático), se cae al fetch directo de siempre. La clave de caché NO cambia.
let pollinationsProxyAvailable = true;
function portraitFetchTarget(url: string): string {
  if (pollinationsProxyAvailable && url.startsWith("https://image.pollinations.ai/")) {
    return `/api/pollinations?u=${encodeURIComponent(url)}`;
  }
  return url;
}

async function fetchPortraitBlob(url: string, priority: boolean): Promise<Blob> {
  const fast = await fetchViaCloudflare(url, portraitReferences.get(url), portraitStyleReferences.get(url));
  if (fast) return fast;
  let lastError: unknown = new Error("portrait fetch failed");
  // Pollinations 2026-07: cola por IP de UN solo pedido — cualquier extra rebota
  // con 429 al instante (otra pestaña, la portada, un reintento cruzado). Un 429
  // NO es un fallo real: es "esperá tu turno" — se espera 20s y se reintenta
  // hasta 8 veces extra sin quemar la serie normal de reintentos.
  const delays = [...RETRY_DELAYS_MS];
  const MAX_429_WAITS = 8;
  let waits429 = 0;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const delay = delays[attempt];
    if (delay > 0) await sleep(delay);
    await acquireSlot(priority);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const target = portraitFetchTarget(url);
        const response = await fetch(target, { signal: controller.signal });
        if (target !== url && (response.status === 404 || response.status === 405)) {
          // Sin proxy (p. ej. preview estático): directo de acá en adelante.
          pollinationsProxyAvailable = false;
          throw new Error("proxy no disponible");
        }
        if (!response.ok) throw new Error(`portrait HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error(`portrait content-type ${blob.type}`);
        return blob;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      lastError = error;
      if (String(error).includes("HTTP 429") && waits429 < MAX_429_WAITS) {
        waits429 += 1;
        delays.push(20_000);
      }
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
        .catch((error) => {
          if (!alive) return;
          setState((prev) => ({ src: prev.src, status: "failed" }));
          if (error instanceof QualityImageQuotaError) {
            const delay = Math.max(BACKGROUND_RETRY_MS, error.retryAt - Date.now() + 1_000);
            timer = window.setTimeout(() => alive && run(roundsLeft), delay);
          } else if (roundsLeft > 0) {
            timer = window.setTimeout(() => alive && run(roundsLeft - 1), BACKGROUND_RETRY_MS);
          }
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
