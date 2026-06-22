import type { AmbientSoundRequest, AmbientSoundResponse, SoundProvider } from "./types";

export class ElevenLabsSoundProvider implements SoundProvider {
  async generateAmbientSound(input: AmbientSoundRequest): Promise<AmbientSoundResponse> {
    if (!import.meta.env?.ELEVENLABS_API_KEY) {
      return {
        audioAssetUrl: input.fallbackAudio,
        provider: "mock",
        mood: "Falta ELEVENLABS_API_KEY. Se obtiene en ElevenLabs > Profile / API Keys. Usando audio mock."
      };
    }

    return {
      audioAssetUrl: input.fallbackAudio,
      provider: "mock",
      mood: "ElevenLabsSoundProvider placeholder: no genera audio pago en MVP."
    };
  }
}
