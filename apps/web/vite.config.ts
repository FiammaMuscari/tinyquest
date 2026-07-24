import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import crypto from "node:crypto";
// FUENTE ÚNICA compartida con el Worker de prod: mismo modelo/prompt/pasos en
// local que en remoto para poder testear-verificar-pushear sin sorpresas.
import { planImage } from "../edge-worker/src/image-plan.js";

function llmProxyPlugin(): Plugin {
  const responseCache = new Map<string, string>();
  const pendingRequests = new Map<string, Promise<{ status: number; body: string }>>();
  return {
    name: "tiny-quest-llm-proxy",
    configureServer(server) {
      const rootEnvDir = path.resolve(__dirname, "../..");
      const env = loadEnv(server.config.mode, rootEnvDir, "");

      const register = (route: string, upstream: string, apiKey: string | undefined, keyHint: string) => {
        server.middlewares.use(route, async (request, response) => {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method not allowed");
            return;
          }
          if (!apiKey) {
            response.statusCode = 400;
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ error: { message: `Missing ${keyHint} in .env.local` } }));
            return;
          }

          const chunks: Buffer[] = [];
          request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          request.on("end", async () => {
            const body = Buffer.concat(chunks).toString("utf8");
            const cacheKey = crypto.createHash("sha256").update(`${route}:${body}`).digest("hex");
            const cached = responseCache.get(cacheKey);
            if (cached) {
              response.statusCode = 200;
              response.setHeader("Content-Type", "application/json");
              response.setHeader("X-Tiny-Quest-Cache", "hit");
              response.end(cached);
              return;
            }

            try {
              const pending = pendingRequests.get(cacheKey) ?? fetch(upstream, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                  },
                  body,
                  signal: AbortSignal.timeout(30000)
                }).then(async (upstreamResponse) => ({
                  status: upstreamResponse.status,
                  body: await upstreamResponse.text()
                })).finally(() => pendingRequests.delete(cacheKey));

              pendingRequests.set(cacheKey, pending);
              const result = await pending;
              response.statusCode = result.status;
              response.setHeader("Content-Type", "application/json");
              if (result.status === 200) {
                responseCache.set(cacheKey, result.body);
                if (responseCache.size > 80) {
                  const oldestKey = responseCache.keys().next().value;
                  if (oldestKey) responseCache.delete(oldestKey);
                }
              }
              response.end(result.body);
            } catch (error) {
              response.statusCode = 502;
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : "LLM proxy failed" } }));
            }
          });
        });
      };

      register("/api/groq/chat", "https://api.groq.com/openai/v1/chat/completions", env.GROQ_API_KEY, "GROQ_API_KEY");
      register("/api/gemini/chat", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", env.GEMINI_API_KEY, "GEMINI_API_KEY");

      // Proxy de Pollinations: el navegador corta conexiones largas contra su
      // cola (fetch "Failed to fetch" intermitente en generaciones de 30-90s);
      // servidor-a-servidor es estable. El cliente pide /api/pollinations?u=<url>
      // y la clave de caché sigue siendo la URL original de Pollinations.
      server.middlewares.use("/api/pollinations", async (request, response) => {
        try {
          const query = new URL(request.url ?? "", "http://local").searchParams;
          const target = query.get("u") ?? "";
          if (!target.startsWith("https://image.pollinations.ai/")) {
            response.statusCode = 400;
            response.end("solo image.pollinations.ai");
            return;
          }
          const upstream = await fetch(target, { signal: AbortSignal.timeout(150000) });
          const contentType = upstream.headers.get("content-type") ?? "";
          if (!upstream.ok || !contentType.startsWith("image/")) {
            response.statusCode = upstream.ok ? 502 : upstream.status;
            response.end(`pollinations ${upstream.status} ${contentType}`);
            return;
          }
          response.statusCode = 200;
          response.setHeader("Content-Type", contentType);
          response.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          response.statusCode = 502;
          response.end(error instanceof Error ? error.message : "pollinations proxy failed");
        }
      });

      // Imágenes por Cloudflare Workers AI (rápido y gratis): el cliente manda
      // {prompt, width, height, seed} y recibe los bytes de la imagen. El token
      // vive SOLO acá (server-side). Sin credenciales responde 501 y el cliente
      // sigue con Pollinations como siempre.
      server.middlewares.use("/api/cf-image", async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("Method not allowed");
          return;
        }
        if (!env.CF_ACCOUNT_ID || !env.CF_AI_TOKEN) {
          response.statusCode = 501;
          response.end("Cloudflare Workers AI no configurado");
          return;
        }
        const chunks: Buffer[] = [];
        request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        request.on("end", async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { prompt?: string; width?: number; height?: number; seed?: number; referenceImage?: string; referenceType?: string; styleImages?: Array<{ data: string; type?: string }> };
            if (!body.prompt) {
              response.statusCode = 400;
              response.end("prompt requerido");
              return;
            }
            const faceDetail = /^TINYQUEST HERO FACE (?:VARIANT|DETAIL) V\d+\b/.test(body.prompt);
            if (faceDetail && !body.referenceImage) {
              response.statusCode = 409;
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify({ error: { message: "canonical body reference required", stage: "identity-validation" } }));
              return;
            }
            // MODELO, prompt, recortes y pasos vienen de image-plan.js: la MISMA
            // función que usa el Worker de prod (worker.js). Si local y prod
            // divergen se testea algo que en remoto sale distinto. Antes el dev
            // usaba otro styleInstruction ("beautiful/delicate"), no distinguía
            // faceVariant y forzaba steps 8: por eso el cuerpo salía aniñado.
            const styles = (body.styleImages ?? []).filter((item) => item?.data).slice(0, 2);
            const hasReference = Boolean(body.referenceImage);
            const plan = planImage({
              prompt: body.prompt,
              width: body.width,
              height: body.height,
              seed: body.seed,
              hasReference,
              styleCount: styles.length,
              envModel: env.CF_IMAGE_MODEL
            });
            let upstreamBody: BodyInit;
            let upstreamContentType = "application/json";
            if (plan.multipart) {
              const form = new FormData();
              form.append("prompt", plan.promptText);
              form.append("width", String(plan.width));
              form.append("height", String(plan.height));
              form.append("seed", String(plan.seed));
              if (hasReference) form.append("input_image_0", new Blob([Buffer.from(body.referenceImage as string, "base64")], { type: body.referenceType || "image/jpeg" }), "hero-reference.jpg");
              styles.forEach((style, index) => form.append(`input_image_${plan.styleStart + index}`, new Blob([Buffer.from(style.data, "base64")], { type: style.type || "image/png" }), `style-${index}.png`));
              upstreamBody = form;
              upstreamContentType = ""; // fetch agrega boundary multipart
            } else {
              upstreamBody = JSON.stringify({
                prompt: plan.promptText,
                width: plan.width,
                height: plan.height,
                seed: plan.seed,
                steps: plan.steps
              });
            }
            const upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${plan.model}`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${env.CF_AI_TOKEN}`, ...(upstreamContentType ? { "Content-Type": upstreamContentType } : {}) },
              body: upstreamBody,
              signal: AbortSignal.timeout(45000)
            });
            const contentType = upstream.headers.get("content-type") ?? "";
            if (!upstream.ok) {
              const errorBody = await upstream.text();
              response.statusCode = /4006|daily free allocation|neurons/i.test(errorBody) ? 429 : upstream.status;
              response.end(errorBody);
              return;
            }
            if (contentType.includes("application/json")) {
              // Modelos tipo flux devuelven {result:{image:"<base64>"}}.
              const parsed = await upstream.json() as { result?: { image?: string } };
              const base64 = parsed.result?.image;
              if (!base64) {
                response.statusCode = 502;
                response.end("respuesta sin imagen");
                return;
              }
              response.statusCode = 200;
              response.setHeader("Content-Type", "image/jpeg");
              if (body.referenceImage) {
                response.setHeader("x-tiny-quest-identity-source", "canonical-body");
                response.setHeader("x-tiny-quest-composition", faceDetail ? "close-portrait-v24" : "reference-edit");
              }
              response.end(Buffer.from(base64, "base64"));
              return;
            }
            response.statusCode = 200;
            response.setHeader("Content-Type", contentType || "image/png");
            if (body.referenceImage) {
              response.setHeader("x-tiny-quest-identity-source", "canonical-body");
              response.setHeader("x-tiny-quest-composition", faceDetail ? "close-portrait-v24" : "reference-edit");
            }
            response.end(Buffer.from(await upstream.arrayBuffer()));
          } catch (error) {
            response.statusCode = 502;
            response.end(error instanceof Error ? error.message : "cf-image failed");
          }
        });
      });
    }
  };
}

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [llmProxyPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@tiny-quest/game-engine": path.resolve(__dirname, "../../packages/game-engine/src/index.ts"),
      "@tiny-quest/ai-master": path.resolve(__dirname, "../../packages/ai-master/src/index.ts"),
      "@tiny-quest/atmosphere": path.resolve(__dirname, "../../packages/atmosphere/src/index.ts")
    }
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "../..")]
    },
    // Jugar con amigos por túnel: Vite rechaza Hosts desconocidos (protección
    // DNS-rebind), así que se permiten los dominios de túnel habituales.
    allowedHosts: [".devtunnels.ms", ".ngrok-free.app", ".ngrok.app", ".trycloudflare.com"]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react-vendor";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/zod")) return "validation";
          return undefined;
        }
      }
    }
  }
});
