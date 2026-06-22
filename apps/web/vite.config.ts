import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import crypto from "node:crypto";

function groqProxyPlugin(): Plugin {
  const responseCache = new Map<string, string>();
  const pendingRequests = new Map<string, Promise<{ status: number; body: string }>>();
  return {
    name: "tiny-quest-groq-proxy",
    configureServer(server) {
      const rootEnvDir = path.resolve(__dirname, "../..");
      const env = loadEnv(server.config.mode, rootEnvDir, "");
      server.middlewares.use("/api/groq/chat", async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end("Method not allowed");
          return;
        }

        const apiKey = env.GROQ_API_KEY;
        if (!apiKey) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: { message: "Missing GROQ_API_KEY in .env.local" } }));
          return;
        }

        const chunks: Buffer[] = [];
        request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        request.on("end", async () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const cacheKey = crypto.createHash("sha256").update(body).digest("hex");
          const cached = responseCache.get(cacheKey);
          if (cached) {
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json");
            response.setHeader("X-Tiny-Quest-Cache", "hit");
            response.end(cached);
            return;
          }

          try {
            const pending = pendingRequests.get(cacheKey) ?? fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${apiKey}`,
                  "Content-Type": "application/json"
                },
                body,
                signal: AbortSignal.timeout(22000)
              }).then(async (groqResponse) => ({
                status: groqResponse.status,
                body: await groqResponse.text()
              })).finally(() => pendingRequests.delete(cacheKey));

            pendingRequests.set(cacheKey, pending);
            const groqResult = await pending;
            response.statusCode = groqResult.status;
            response.setHeader("Content-Type", "application/json");
            if (groqResult.status === 200) {
              responseCache.set(cacheKey, groqResult.body);
              if (responseCache.size > 80) {
                const oldestKey = responseCache.keys().next().value;
                if (oldestKey) responseCache.delete(oldestKey);
              }
            }
            response.end(groqResult.body);
          } catch (error) {
            response.statusCode = 502;
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : "Groq proxy failed" } }));
          }
        });
      });
    }
  };
}

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [groqProxyPlugin(), react(), tailwindcss()],
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
    }
  }
});
