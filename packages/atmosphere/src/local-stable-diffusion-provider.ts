import type { ImageProvider, SceneImageRequest, SceneImageResponse } from "./types";

export class LocalStableDiffusionProvider implements ImageProvider {
  async generateSceneImage(input: SceneImageRequest): Promise<SceneImageResponse> {
    return {
      imageAssetUrl: input.fallbackImage,
      provider: "local-stable-diffusion",
      description: "Local Stable Diffusion / ComfyUI / AUTOMATIC1111 placeholder. Configure endpoint local en una fase futura."
    };
  }
}
