export type SceneImageRequest = {
  sceneId: string;
  sceneTitle: string;
  visualPrompt: string;
  atmosphereTags: string[];
  fallbackImage: string;
};

export type SceneImageResponse = {
  imageAssetUrl: string;
  provider: "mock" | "bedrock" | "local-stable-diffusion";
  description: string;
};

export type AmbientSoundRequest = {
  sceneId: string;
  sceneTitle: string;
  ambientSoundPrompt: string;
  atmosphereTags: string[];
  fallbackAudio: string;
};

export type AmbientSoundResponse = {
  audioAssetUrl: string;
  provider: "mock" | "elevenlabs";
  mood: string;
};

export interface ImageProvider {
  generateSceneImage(input: SceneImageRequest): Promise<SceneImageResponse>;
}

export interface SoundProvider {
  generateAmbientSound(input: AmbientSoundRequest): Promise<AmbientSoundResponse>;
}
