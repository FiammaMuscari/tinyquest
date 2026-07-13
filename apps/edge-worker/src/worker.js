export { RoomHub } from "./room-hub.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

async function llm(request, env, provider) {
  const groq = provider === "groq";
  const key = groq ? env.GROQ_API_KEY : env.GEMINI_API_KEY;
  if (!key) return json({ error: { message: `Falta ${groq ? "GROQ_API_KEY" : "GEMINI_API_KEY"}` } }, 501);
  const upstream = groq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  const body = await request.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", body);
  const keyHex = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const cacheKey = new Request(`https://tinyquest.internal/llm/${provider}/${keyHex}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return new Response(cached.body, cached);
  const response = await fetch(upstream, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body
  });
  const result = new Response(response.body, response);
  if (response.ok) await caches.default.put(cacheKey, result.clone());
  return result;
}

async function cfImage(request, env, ctx) {
  if (!env.AI) return new Response("Cloudflare Workers AI no configurado", { status: 501 });
  const payload = await request.text();
  let input;
  try { input = JSON.parse(payload); } catch { return new Response("JSON inválido", { status: 400 }); }
  if (typeof input.prompt !== "string" || !input.prompt.trim()) return new Response("prompt requerido", { status: 400 });
  // Caché global por payload: IndexedDB evita repetir dentro de un navegador;
  // esto evita volver a gastar IA en otro dispositivo o después de limpiar datos.
  // Incluye seed y referencias base64, por lo que dos identidades nunca colisionan.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const cacheId = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const cacheKey = new Request(`https://tinyquest.internal/image/${cacheId}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return new Response(cached.body, cached);
  const cacheGenerated = (response) => {
    if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
      ctx?.waitUntil(caches.default.put(cacheKey, response.clone()));
    }
    return response;
  };
  const model = env.CF_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  const quotaError = (error) => /4006|daily free allocation|neurons/i.test(error instanceof Error ? error.message : String(error));
  const fastMedallion = /^TINYQUEST (?:NPC PORTRAIT|CREATURE PORTRAIT|PHENOMENON) V16\b/.test(input.prompt);
  const runSchnell = async () => {
    try {
      const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
        prompt: `${input.prompt.slice(0, 1960)}, no text, no signature, no watermark`,
        width: Math.min(2048, Math.max(256, Number(input.width) || 512)),
        height: Math.min(2048, Math.max(256, Number(input.height) || 512)),
        seed: Number(input.seed) || 0,
        // Los medallones son 448² y se ven como máximo a ~420px: 6 pasos
        // conservan el estilo/rasgos y reducen 25% la latencia frente a 8.
        // El héroe y escenas mantienen 8 pasos porque se inspeccionan en grande.
        steps: fastMedallion ? 6 : 8
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
  const styleImages = Array.isArray(input.styleImages) ? input.styleImages.filter((item) => typeof item?.data === "string").slice(0, 2) : [];
  const runKlein = async (referenceImage) => {
    const form = new FormData();
    const styleStart = referenceImage ? 1 : 0;
    const styleInstruction = styleImages.length
      ? `Images ${styleStart}-${styleStart + styleImages.length - 1} are STYLE REFERENCES ONLY. Copy ONLY their beautiful classic oil technique, graceful knee-up silhouette, elegant natural proportions, delicate medieval costume rendering, soft broken brush edges and restrained tonal background. NEVER copy their person, elf anatomy, gender, face, skin, eye or hair colors, clothing details, weapons or pose; canonical identity overrides every reference.`
      : "";
    const faceVariant = /^TINYQUEST HERO FACE VARIANT V20\b/.test(input.prompt);
    form.append("prompt", referenceImage
      ? faceVariant
        ? `Image 0 is the IMMUTABLE canonical full character and wardrobe master. Copy the EXACT same person, facial geometry, gender presentation, species, anatomy, skin, iris and hair colors, scar, collar, upper garments, armor, jewelry and visible weapon details. Change ONLY camera to a close head-and-shoulders portrait with the face turned exactly 30 degrees, both eyes visible, entire head inside frame. Keep the master's calm alert expression; emotion may move brows, eyelids and mouth muscles naturally but may not alter identity. Never redesign the person or outfit. ${styleInstruction} Simple dark tonal gradient; one character only. ${input.prompt.slice(0, 1180)}`
        : `Image 0 is the IMMUTABLE canonical character and wardrobe master. Copy the exact person and outfit. ${styleInstruction} ${input.prompt.slice(0, 1400)}`
      : `${styleInstruction} Create the NEW character described here without copying the reference subjects: ${input.prompt.slice(0, 1700)}, no text, no signature, no watermark`);
    form.append("width", String(Math.min(1920, Math.max(256, Number(input.width) || 512))));
    form.append("height", String(Math.min(1920, Math.max(256, Number(input.height) || 768))));
    form.append("seed", String(Number(input.seed) || 0));
    if (referenceImage) {
      const bytes = Uint8Array.from(atob(referenceImage), (char) => char.charCodeAt(0));
      form.append("input_image_0", new Blob([bytes], { type: input.referenceType || "image/jpeg" }), "hero-reference.jpg");
    }
    styleImages.forEach((style, index) => {
      const bytes = Uint8Array.from(atob(style.data), (char) => char.charCodeAt(0));
      form.append(`input_image_${styleStart + index}`, new Blob([bytes], { type: style.type || "image/png" }), `style-${index}.png`);
    });
    const serialized = new Response(form);
    let edited;
    try {
      edited = await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b", {
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
    return new Response(output, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  };
  let response;
  if (typeof input.referenceImage === "string" && input.referenceImage) response = await runKlein(input.referenceImage);
  else if (model.includes("flux-2-klein") || styleImages.length) response = await runKlein();
  else response = await runSchnell();
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
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "POST" && url.pathname !== "/api/pollinations") return new Response("Method not allowed", { status: 405 });
    try {
      if (url.pathname === "/api/groq/chat") return llm(request, env, "groq");
      if (url.pathname === "/api/gemini/chat") return llm(request, env, "gemini");
      if (url.pathname === "/api/cf-image") return cfImage(request, env, ctx);
      if (url.pathname === "/api/pollinations") return pollinations(url);
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return json({ error: { message: error instanceof Error ? error.message : "Fallo del relay" } }, 502);
    }
  }
};
