export type MusicState = "calm" | "neutral" | "chase" | "sadness" | "mystery" | "day" | "night";

export type AdaptiveMusicInput = {
  danger: number;
  phase?: string;
  sceneText: string;
  narrativeText?: string;
  outcome?: string;
};

export const MUSIC_PRESETS: Record<MusicState, { label: string; playbackRate: number; volumeScale: number }> = {
  calm: { label: "Calma", playbackRate: 0.9, volumeScale: 0.78 },
  neutral: { label: "Aventura", playbackRate: 1, volumeScale: 0.9 },
  chase: { label: "Persecución", playbackRate: 1.12, volumeScale: 1 },
  sadness: { label: "Tristeza", playbackRate: 0.82, volumeScale: 0.76 },
  mystery: { label: "Misterio", playbackRate: 0.94, volumeScale: 0.84 },
  day: { label: "Día", playbackRate: 1.03, volumeScale: 0.88 },
  night: { label: "Noche", playbackRate: 0.87, volumeScale: 0.8 }
};

export function deriveMusicState(input: AdaptiveMusicInput): MusicState {
  const text = `${input.sceneText} ${input.narrativeText ?? ""}`.toLowerCase();
  if (/muri[oó]|muerte|duelo|luto|p[ée]rdida|triste|llora|sacrificio|despedida|familia rota/.test(text)) return "sadness";
  if (input.danger >= 7 || /persecuci[oó]n|huir|escapar|correr|cacer[ií]a|combate|cl[ií]max/.test(`${input.phase ?? ""} ${text}`)) return "chase";
  if (/medianoche|noche|luna|oscuridad|nocturn/.test(text)) return "night";
  if (/amanecer|mediod[ií]a|pleno d[ií]a|sol alto|ma[ñn]ana/.test(text)) return "day";
  if (/misterio|secreto|pista|investig|sospech|enigma|portal|desconocid/.test(text)) return "mystery";
  if (input.danger <= 2 && (input.outcome === "success" || /calma|descanso|refugio|segur/.test(text))) return "calm";
  return "neutral";
}
