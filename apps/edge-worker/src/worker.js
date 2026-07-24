export { RoomHub } from "./room-hub.js";
import { planImage } from "./image-plan.js";

const pendingLlmRequests = new Map();
const LLM_CACHE_SECONDS = 6 * 60 * 60;

function imageCacheFamily(prompt) {
  const match = prompt.match(/^TINYQUEST\s+(.+?)\s+V(\d+)\b/);
  if (!match) return "scene-v1";
  const kind = match[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${kind}-v${match[2]}`;
}

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

async function llm(request, env, provider, ctx) {
  const groq = provider === "groq";
  const key = groq ? env.GROQ_API_KEY : env.GEMINI_API_KEY;
  if (!key) return json({ error: { message: `Falta ${groq ? "GROQ_API_KEY" : "GEMINI_API_KEY"}` } }, 501);
  const upstream = groq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  let input;
  try { input = await request.json(); } catch { return json({ error: { message: "JSON inválido" } }, 400); }
  // Producción controla el modelo server-side. El bundle del navegador puede
  // pedir uno, pero nunca saltear la configuración/allowlist del deploy.
  input.model = groq ? (env.GROQ_MODEL || input.model) : (env.GEMINI_MODEL || input.model);
  const body = JSON.stringify(input);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const keyHex = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const cacheKey = new Request(`https://tinyquest.internal/llm/${provider}/${keyHex}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-tiny-quest-cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }
  const existing = pendingLlmRequests.get(cacheKey.url);
  const run = existing ?? (async () => {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(20_000)
    });
    const bytes = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    return { bytes, status: response.status, headers };
  })().finally(() => pendingLlmRequests.delete(cacheKey.url));
  pendingLlmRequests.set(cacheKey.url, run);
  const result = await run;
  if (result.status >= 200 && result.status < 300) {
    const cacheHeaders = new Headers(result.headers);
    cacheHeaders.set("cache-control", `public, max-age=${LLM_CACHE_SECONDS}`);
    ctx?.waitUntil(caches.default.put(cacheKey, new Response(result.bytes.slice(0), { status: result.status, headers: cacheHeaders })));
  }
  const clientHeaders = new Headers(result.headers);
  clientHeaders.set("cache-control", "no-store");
  clientHeaders.set("x-tiny-quest-cache", existing ? "coalesced" : "miss");
  return new Response(result.bytes.slice(0), { status: result.status, headers: clientHeaders });
}

async function cfImage(request, env, ctx) {
  if (!env.AI) return new Response("Cloudflare Workers AI no configurado", { status: 501 });
  const payload = await request.text();
  let input;
  try { input = JSON.parse(payload); } catch { return new Response("JSON inválido", { status: 400 }); }
  if (typeof input.prompt !== "string" || !input.prompt.trim()) return new Response("prompt requerido", { status: 400 });
  const heroFaceVariant = /^TINYQUEST HERO FACE (?:VARIANT|DETAIL) V\d+\b/.test(input.prompt);
  const heroBodyV24 = /^TINYQUEST HERO BODY MASTER V24\b/.test(input.prompt);
  const sceneV2 = /^TINYQUEST ENVIRONMENT SCENE V2\b/.test(input.prompt);
  // Frente jamás puede nacer de texto o de una referencia solo estética: sin el
  // Cuerpo canónico se produciría drift de género, colores, cicatriz y anatomía.
  // Fallar antes de invocar AI conserva cuota y deja al cliente con el par previo.
  if (heroFaceVariant && !(typeof input.referenceImage === "string" && input.referenceImage)) {
    return json({ error: { message: "canonical body reference required", stage: "identity-validation" } }, 409);
  }
  if (heroBodyV24 && !/CLEARLY ADULT HERO[\s\S]+straight-on frontal view[\s\S]+both ankles[\s\S]+feet outside/i.test(input.prompt)) {
    return json({ error: { message: "invalid hero framing contract", stage: "prompt-validation" } }, 422);
  }
  if (sceneV2 && !/ZERO people, heroes, NPCs, creatures or silhouettes/i.test(input.prompt)) {
    return json({ error: { message: "invalid environment subject policy", stage: "prompt-validation" } }, 422);
  }
  // Caché global por payload: IndexedDB evita repetir dentro de un navegador;
  // esto evita volver a gastar IA en otro dispositivo o después de limpiar datos.
  // Incluye seed y referencias base64, por lo que dos identidades nunca colisionan.
  const family = imageCacheFamily(input.prompt);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${family}\n${payload}`));
  const cacheId = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const cacheKey = new Request(`https://tinyquest.internal/image/${family}/${cacheId}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("x-tiny-quest-cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }
  const cacheGenerated = (response) => {
    if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
      ctx?.waitUntil(caches.default.put(cacheKey, response.clone()));
    }
    const headers = new Headers(response.headers);
    headers.set("x-tiny-quest-cache", "miss");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
  const quotaError = (error) => /4006|daily free allocation|neurons/i.test(error instanceof Error ? error.message : String(error));
  const styleImages = Array.isArray(input.styleImages) ? input.styleImages.filter((item) => typeof item?.data === "string").slice(0, 2) : [];
  const hasReference = typeof input.referenceImage === "string" && Boolean(input.referenceImage);
  // MODELO, prompt, recortes y pasos vienen de la fuente única compartida con el
  // middleware dev de Vite (image-plan.js) para que local y prod rindan igual.
  const plan = planImage({
    prompt: input.prompt,
    width: input.width,
    height: input.height,
    seed: input.seed,
    hasReference,
    styleCount: styleImages.length,
    envModel: env.CF_IMAGE_MODEL
  });
  const runSchnell = async () => {
    try {
      const result = await env.AI.run(plan.model, {
        prompt: plan.promptText,
        width: plan.width,
        height: plan.height,
        seed: plan.seed,
        // Los medallones son 448² y se ven como máximo a ~420px: 6 pasos
        // conservan el estilo/rasgos y reducen 25% la latencia frente a 8.
        // El héroe y escenas mantienen 8 pasos porque se inspeccionan en grande.
        steps: plan.steps
      });
      if (result instanceof ReadableStream || result instanceof ArrayBuffer || ArrayBuffer.isView(result)) {
        return new Response(result, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
      }
      const encoded = result?.image;
      if (typeof encoded !== "string") return new Response("respuesta sin imagen", { status: 502 });
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      return new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
    } catch (error) {
      return json({ error: { message: error instanceof Error ? error.message : String(error), stage: "flux-1-schnell" } }, quotaError(error) ? 429 : 502);
    }
  };
  const runKlein = async () => {
    const form = new FormData();
    form.append("prompt", plan.promptText);
    form.append("width", String(plan.width));
    form.append("height", String(plan.height));
    form.append("seed", String(plan.seed));
    if (hasReference) {
      const bytes = Uint8Array.from(atob(input.referenceImage), (char) => char.charCodeAt(0));
      form.append("input_image_0", new Blob([bytes], { type: input.referenceType || "image/jpeg" }), "hero-reference.jpg");
    }
    styleImages.forEach((style, index) => {
      const bytes = Uint8Array.from(atob(style.data), (char) => char.charCodeAt(0));
      form.append(`input_image_${plan.styleStart + index}`, new Blob([bytes], { type: style.type || "image/png" }), `style-${index}.png`);
    });
    const serialized = new Response(form);
    let edited;
    try {
      edited = await env.AI.run(plan.model, {
        multipart: { body: serialized.body, contentType: serialized.headers.get("content-type") }
      });
    } catch (error) {
      // La edición de referencia es cara en neuronas. Si se agotó, Schnell
      // conserva el prompt/seed y evita caer al generador de baja calidad.
      if (quotaError(error)) return json({ error: { message: "quality reference quota exhausted", stage: "flux-2-klein" } }, 429);
      return json({ error: { message: error instanceof Error ? error.message : String(error), stage: "flux-2-klein" } }, 502);
    }
    const encoded = edited?.image;
    if (typeof encoded !== "string") return new Response("respuesta de edición sin imagen", { status: 502 });
    const output = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    return new Response(output, { headers: {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
      "x-tiny-quest-identity-source": hasReference ? "canonical-body" : "text",
      "x-tiny-quest-composition": plan.isFace ? "close-portrait-v24" : "reference-edit"
    } });
  };
  const response = plan.multipart ? await runKlein() : await runSchnell();
  return cacheGenerated(response);
}

async function pollinations(url) {
  const target = url.searchParams.get("u") || "";
  let parsed;
  try { parsed = new URL(target); } catch { return new Response("URL inválida", { status: 400 }); }
  if (parsed.protocol !== "https:" || parsed.hostname !== "image.pollinations.ai") {
    return new Response("solo image.pollinations.ai", { status: 400 });
  }
  return fetch(parsed, { cf: { cacheEverything: true, cacheTtl: 31536000 } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required", { status: 426 });
      }
      return env.ROOMS.getByName("tinyquest-global-v1").fetch(request);
    }
    if (!url.pathname.startsWith("/api/")) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      const hashedBundle = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(url.pathname);
      const longLivedPublicAsset = /\.(?:woff2|webp|png|jpe?g|svg|mp3|ogg|wav)$/i.test(url.pathname);
      headers.set("cache-control", url.pathname === "/" || headers.get("content-type")?.includes("text/html")
        ? "no-cache"
        : hashedBundle
          ? "public, max-age=31536000, immutable"
          : longLivedPublicAsset ? "public, max-age=604800" : "public, max-age=3600");
      headers.set("x-content-type-options", "nosniff");
      headers.set("referrer-policy", "strict-origin-when-cross-origin");
      headers.set("x-frame-options", "SAMEORIGIN");
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }
    if (request.method !== "POST" && url.pathname !== "/api/pollinations") return new Response("Method not allowed", { status: 405 });
    try {
      if (url.pathname === "/api/groq/chat") return llm(request, env, "groq", ctx);
      if (url.pathname === "/api/gemini/chat") return llm(request, env, "gemini", ctx);
      if (url.pathname === "/api/cf-image") return cfImage(request, env, ctx);
      if (url.pathname === "/api/pollinations") return pollinations(url);
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return json({ error: { message: error instanceof Error ? error.message : "Fallo del relay" } }, 502);
    }
  }
};
