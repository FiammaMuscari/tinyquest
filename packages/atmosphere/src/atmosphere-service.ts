import { BedrockImageProvider } from "./bedrock-image-provider";
import { ElevenLabsSoundProvider } from "./elevenlabs-sound-provider";
import { LocalStableDiffusionProvider } from "./local-stable-diffusion-provider";
import { MockImageProvider } from "./mock-image-provider";
import { MockSoundProvider } from "./mock-sound-provider";
import type { ImageProvider, SoundProvider } from "./types";

export function createImageProvider(name = "mock"): ImageProvider {
  if (name === "bedrock") return new BedrockImageProvider();
  if (name === "local") return new LocalStableDiffusionProvider();
  return new MockImageProvider();
}

export function createSoundProvider(name = "mock"): SoundProvider {
  if (name === "elevenlabs") return new ElevenLabsSoundProvider();
  return new MockSoundProvider();
}
