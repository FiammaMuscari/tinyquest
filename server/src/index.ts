import { readEnv } from "./env.js";
import { createWsServer } from "./ws-server.js";

const env = readEnv();

createWsServer(env.port, () => {
  const mode = env.groqApiKey ? "Groq AI" : "mock (sin GROQ_API_KEY)";
  console.log(`Tiny Quest WebSocket server en ws://localhost:${env.port} — narración: ${mode}`);
});
