export interface ImagePlanInput {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  hasReference?: boolean;
  styleCount?: number;
  envModel?: string;
}

export interface ImagePlan {
  model: string;
  multipart: boolean;
  isFace: boolean;
  promptText: string;
  width: number;
  height: number;
  seed: number;
  styleStart: number;
  steps?: number;
}

export function isHeroFaceVariant(prompt: string): boolean;
export function isFastMedallion(prompt: string): boolean;
export function styleInstruction(styleStart: number, styleCount: number): string;
export function planImage(input: ImagePlanInput): ImagePlan;
