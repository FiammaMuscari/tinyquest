export type ServerEnv = {
  port: number;
  groqApiKey: string | undefined;
};

export function readEnv(env = process.env): ServerEnv {
  return {
    port: Number(env.PORT ?? 8787),
    groqApiKey: env.GROQ_API_KEY ?? env.VITE_GROQ_API_KEY
  };
}
