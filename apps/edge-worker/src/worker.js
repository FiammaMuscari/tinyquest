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

async function cfImage(request, env) {
  if (!env.AI) return new Response("Cloudflare Workers AI no configurado", { status: 501 });
  const input = await request.json();
  if (typeof input.prompt !== "string" || !input.prompt.trim()) return new Response("prompt requerido", { status: 400 });
  const model = env.CF_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  const styleImages = Array.isArray(input.styleImages) ? input.styleImages.filter((item) => typeof item?.data === "string").slice(0, 2) : [];
  const runKlein = async (referenceImage) => {
    const form = new FormData();
    const styleStart = referenceImage ? 1 : 0;
    const styleInstruction = styleImages.length
      ? `Images ${styleStart}-${styleStart + styleImages.length - 1} are STYLE REFERENCES ONLY: copy their beautiful classic oil technique, elegant proportions, delicate facial rendering, muted palette and restrained tonal background, but NEVER copy their person, elf anatomy, gender, colors, clothing or pose.`
      : "";
    form.append("prompt", referenceImage
      ? `Image 0 is the canonical character identity. Preserve EXACT face, canonical species and non-human anatomy, skin color, iris color, hair color, scar, medieval clothing, jewelry and weapons. ${styleInstruction} Change ONLY the camera/framing to a distant full-body standing composition, entire head-to-feet figure visible. Use a clean unobtrusive dark tonal gradient background; the character is the only subject. ${input.prompt.slice(0, 1300)}`
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
      return json({ error: { message: error instanceof Error ? error.message : String(error), stage: "flux-2-klein" } }, 502);
    }
    const encoded = edited?.image;
    if (typeof encoded !== "string") return new Response("respuesta de edición sin imagen", { status: 502 });
    const output = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    return new Response(output, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  };
  if (typeof input.referenceImage === "string" && input.referenceImage) {
    return runKlein(input.referenceImage);
  }
  if (model.includes("flux-2-klein") || styleImages.length) return runKlein();
  const result = await env.AI.run(model, {
    prompt: `${input.prompt.slice(0, 1960)}, no text, no signature, no watermark`,
    width: Math.min(2048, Math.max(256, Number(input.width) || 512)),
    height: Math.min(2048, Math.max(256, Number(input.height) || 512)),
    seed: Number(input.seed) || 0,
    steps: 8
  });
  if (result instanceof ReadableStream || result instanceof ArrayBuffer || ArrayBuffer.isView(result)) {
    return new Response(result, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  }
  const encoded = result?.image;
  if (typeof encoded !== "string") return new Response("respuesta sin imagen", { status: 502 });
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method !== "POST" && url.pathname !== "/api/pollinations") return new Response("Method not allowed", { status: 405 });
    try {
      if (url.pathname === "/api/groq/chat") return llm(request, env, "groq");
      if (url.pathname === "/api/gemini/chat") return llm(request, env, "gemini");
      if (url.pathname === "/api/cf-image") return cfImage(request, env);
      if (url.pathname === "/api/pollinations") return pollinations(url);
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return json({ error: { message: error instanceof Error ? error.message : "Fallo del relay" } }, 502);
    }
  }
};
