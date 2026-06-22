export type ServerEnv = {
  masterProvider: "groq";
  port: number;
};

export function readEnv(env = process.env): ServerEnv {
  return {
    masterProvider: "groq",
    port: Number(env.PORT ?? 8787)
  };
}
