import type { ImageProvider, SceneImageRequest, SceneImageResponse } from "./types";

export class MockImageProvider implements ImageProvider {
  async generateSceneImage(input: SceneImageRequest): Promise<SceneImageResponse> {
    return {
      imageAssetUrl: input.fallbackImage,
      provider: "mock",
      description: input.visualPrompt
    };
  }
}
