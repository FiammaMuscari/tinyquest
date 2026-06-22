import type { ImageProvider, SceneImageRequest, SceneImageResponse } from "./types";

export class BedrockImageProvider implements ImageProvider {
  async generateSceneImage(input: SceneImageRequest): Promise<SceneImageResponse> {
    const missing = ["AWS_REGION", "BEDROCK_MODEL_ID_IMAGE"].filter((key) => !import.meta.env?.[key]);
    if (missing.length > 0) {
      return {
        imageAssetUrl: input.fallbackImage,
        provider: "mock",
        description: `Faltan variables para Bedrock Image: ${missing.join(", ")}. Consiguelas en AWS Console > Amazon Bedrock > Model access / API keys.`
      };
    }

    return {
      imageAssetUrl: input.fallbackImage,
      provider: "mock",
      description: "BedrockImageProvider placeholder: no genera assets pagos en MVP."
    };
  }
}
