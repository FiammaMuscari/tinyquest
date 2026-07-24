// FUENTE ÚNICA de la decisión de generación de imagen, compartida por el Worker
// de Cloudflare (prod, `worker.js`) y el middleware dev de Vite (local,
// `apps/web/vite.config.ts`). El TRANSPORTE difiere (binding `env.AI.run` vs
// REST de Cloudflare), pero el MODELO, el texto del prompt, el style instruction,
// los recortes y los pasos salen todos de acá para que local y prod rindan la
// MISMA imagen. Nunca duplicar esta lógica en un solo lado: si divergen, se
// testea algo en local que en prod sale distinto. Ver docs/refactor-map.md.

export function isHeroFaceVariant(prompt) {
  return /^TINYQUEST HERO FACE (?:VARIANT|DETAIL) V\d+\b/.test(prompt);
}

export function isFastMedallion(prompt) {
  return /^TINYQUEST (?:NPC PORTRAIT|CREATURE PORTRAIT) V(?:17|18)\b/.test(prompt)
    || /^TINYQUEST PHENOMENON V17\b/.test(prompt);
}

// Style references: SOLO técnica de óleo medieval maduro. Rechaza explícitamente
// el look plastilina/muñeco/beauty-render que salía con flux-1-schnell.
export function styleInstruction(styleStart, styleCount) {
  if (!styleCount) return "";
  return `Images ${styleStart}-${styleStart + styleCount - 1} are STYLE REFERENCES ONLY. Copy ONLY their mature medieval oil technique: dry matte pigment, visible canvas tooth, rough broken brush strokes, believable asymmetry, normal-sized eyes, natural proportions, hand-painted costume and restrained tonal background. Reject anime, doll-face, beauty-render and glossy digital smoothness. NEVER copy their person, elf anatomy, gender, face, skin, eye/hair colors, clothes, weapons or pose; canonical identity overrides every reference.`;
}

function kleinPromptText(prompt, hasReference, isFace, styleText) {
  if (hasReference) {
    return isFace
      ? `Image 0 is the IMMUTABLE canonical full character, wardrobe AND painting-style master. OUTPUT COMPOSITION OVERRIDES THE REFERENCE FRAMING: repaint a NEW intimate square close three-quarter portrait, never return, crop, zoom or preserve the full-body composition. Entire head, both eyes, shoulders, collar and upper torso dominate the frame; head is large and near camera; waist, hips, legs and feet are outside frame. Copy the EXACT same recognizable person, facial geometry, adult visual gender, species, eye count, anatomy, skin, iris and hair colors/LENGTH, fringe, collar, upper garments, armor and jewelry. Copy Image 0's exact pigment density, brush scale, canvas grain, lighting, contrast and finish; never simplify, genericize, smooth, abstract or lower detail. Keep upper torso fully clothed in the exact opaque medieval layers. Change camera/composition only; never redesign identity or outfit. Paint substantially MORE facial, eye, hair and textile detail than Image 0. SKIN DEFAULT: keep the skin clean and unmarked; only render a scar if the identity spec explicitly names one, and never invent scars, wounds, cuts, bruises or blemishes. ${styleText} Matte medieval oil; simple dark gradient; one character. ${prompt.slice(0, 900)}`
      : `Image 0 is the IMMUTABLE canonical character and wardrobe master. Copy the exact person and outfit. ${styleText} ${prompt.slice(0, 1400)}`;
  }
  return `${styleText} Create the NEW character described here without copying the reference subjects: ${prompt.slice(0, 1700)}, no text, no signature, no watermark`;
}

function clamp(value, min, max, fallback) {
  return Math.min(max, Math.max(min, Number(value) || fallback));
}

// Decide TODO: modelo, si es multipart (klein) o JSON (schnell), texto final del
// prompt, dimensiones, seed, pasos y el índice donde arrancan las style images.
export function planImage({ prompt, width, height, seed, hasReference, styleCount = 0, envModel }) {
  const isFace = isHeroFaceVariant(prompt);
  const kleinDefault = typeof envModel === "string" && envModel.includes("flux-2-klein");
  const useKlein = Boolean(hasReference) || styleCount > 0 || kleinDefault;
  const styleStart = hasReference ? 1 : 0;
  const styleText = styleInstruction(styleStart, styleCount);
  if (useKlein) {
    return {
      model: "@cf/black-forest-labs/flux-2-klein-4b",
      multipart: true,
      isFace,
      promptText: kleinPromptText(prompt, Boolean(hasReference), isFace, styleText),
      width: clamp(width, 256, 1920, 512),
      height: clamp(height, 256, 1920, 768),
      seed: Number(seed) || 0,
      styleStart
    };
  }
  return {
    model: envModel || "@cf/black-forest-labs/flux-1-schnell",
    multipart: false,
    isFace,
    promptText: `${prompt.slice(0, 1960)}, no text, no signature, no watermark`,
    width: clamp(width, 256, 2048, 512),
    height: clamp(height, 256, 2048, 512),
    seed: Number(seed) || 0,
    steps: isFastMedallion(prompt) ? 6 : 8,
    styleStart
  };
}
