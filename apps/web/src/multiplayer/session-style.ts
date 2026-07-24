import type { Character } from "@tiny-quest/game-engine";

export const CHAT_COLOR_MIN_CONTRAST = 4.5;
const CHAT_BACKGROUND = "#05090f";

export function normalizeChatColor(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const color = normalizeChatColor(hex);
  if (!color) return 0;
  return 0.2126 * channel(parseInt(color.slice(1, 3), 16))
    + 0.7152 * channel(parseInt(color.slice(3, 5), 16))
    + 0.0722 * channel(parseInt(color.slice(5, 7), 16));
}

export function chatColorContrast(value: string): number {
  const foreground = luminance(value);
  const background = luminance(CHAT_BACKGROUND);
  return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
}

export function validateChatColor(value: string, usedByOthers: string[]): string | null {
  const normalized = normalizeChatColor(value);
  if (!normalized) return "Elige un color hexadecimal válido.";
  if (usedByOthers.some((used) => normalizeChatColor(used) === normalized)) return "Ese color ya pertenece a otro integrante de la party.";
  if (chatColorContrast(normalized) < CHAT_COLOR_MIN_CONTRAST) return "El color necesita más contraste para poder leerse sobre el chat.";
  return null;
}

/** El relay rechaza un Character de más de 64 KB (hub.go, setPlayerAvatar). Dejamos
 * margen: las URLs de retrato son larguísimas y un rechazo tira ABAJO la publicación
 * entera, así que ante la duda se sacrifica la miniatura, no el avatar. */
export const MULTIPLAYER_CHARACTER_MAX_BYTES = 56_000;

/** El servidor conserva este Character como fuente única; jamás decide Frente/Cuerpo. */
export function canonicalMultiplayerCharacter(character: Character): Character {
  const canonical: Character = {
    ...character,
    look: character.look ? { ...character.look } : character.look,
    avatarUrl: character.avatarUrl
  };
  if (JSON.stringify(canonical).length <= MULTIPLAYER_CHARACTER_MAX_BYTES) return canonical;
  // Sin miniatura la sala vuelve al comportamiento viejo (el retrato tarda), pero
  // el asiento se publica igual. Es preferible a quedarse sin actualizar nada.
  if (!canonical.look?.avatarThumb) return canonical;
  const { avatarThumb: _dropped, avatarThumbKey: _droppedKey, ...look } = canonical.look;
  return { ...canonical, look };
}

export function multiplayerAvatarSignature(character: Character): string {
  return JSON.stringify({
    avatarUrl: character.avatarUrl,
    avatarShot: character.look?.avatarShot,
    faceUrl: character.look?.faceUrl,
    fullBodyUrl: character.look?.fullBodyUrl,
    portraitIdentity: character.look?.portraitIdentity,
    portraitNonce: character.look?.portraitNonce,
    // La miniatura es lo que ve la party antes de que el retrato grande llegue a su
    // caché: si cambia hay que republicar, o los demás se quedan con la anterior.
    avatarThumbKey: character.look?.avatarThumbKey
  });
}
