export type AtmosphereEnv = {
  imageProvider: "mock" | "bedrock" | "local";
  soundProvider: "mock" | "elevenlabs";
  warnings: string[];
};

export function readAtmosphereEnv(env: Record<string, string | undefined> = import.meta.env): AtmosphereEnv {
  const imageProvider = env.IMAGE_PROVIDER === "bedrock" || env.IMAGE_PROVIDER === "local" ? env.IMAGE_PROVIDER : "mock";
  const soundProvider = env.SOUND_PROVIDER === "elevenlabs" ? "elevenlabs" : "mock";
  const warnings: string[] = [];

  if (imageProvider === "bedrock") {
    for (const key of ["AWS_REGION", "BEDROCK_MODEL_ID_IMAGE"]) {
      if (!env[key]) warnings.push(`Falta ${key}. Se obtiene/configura en AWS Console > Amazon Bedrock.`);
    }
    if (!env.AWS_BEARER_TOKEN_BEDROCK && !env.AWS_ACCESS_KEY_ID) {
      warnings.push("Falta AWS_BEARER_TOKEN_BEDROCK o credenciales AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.");
    }
  }

  if (soundProvider === "elevenlabs" && !env.ELEVENLABS_API_KEY) {
    warnings.push("Falta ELEVENLABS_API_KEY. Se obtiene en ElevenLabs > Profile > API Keys.");
  }

  return { imageProvider, soundProvider, warnings };
}
