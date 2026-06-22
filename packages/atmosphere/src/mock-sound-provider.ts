import type { AmbientSoundRequest, AmbientSoundResponse, SoundProvider } from "./types";

export class MockSoundProvider implements SoundProvider {
  async generateAmbientSound(input: AmbientSoundRequest): Promise<AmbientSoundResponse> {
    return {
      audioAssetUrl: input.fallbackAudio,
      provider: "mock",
      mood: input.ambientSoundPrompt
    };
  }
}
