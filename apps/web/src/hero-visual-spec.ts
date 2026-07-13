/** Contrato canónico único del héroe. Identidad, vestuario y anatomía se
 * componen acá; cámara, estilo y caché viven en sus capas respectivas. */
export type HeroVisualSpec = {
  gender: string;
  species: string;
  skin: string;
  eyes: string;
  hair: string;
  hairLength: string;
  scar: string;
  role: string;
  physique: string;
  concept?: string;
};

function compact(text: string | undefined, max: number): string | undefined {
  const clean = text?.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function composeHeroAppearance(spec: HeroVisualSpec): string {
  return [
    `GENDER/BODY: ${compact(spec.gender, 190)}`,
    `COLORS: ${compact(spec.skin, 80)}; ${compact(spec.eyes, 90)}; ${compact(spec.hair, 90)}`,
    `HAIR LENGTH: ${compact(spec.hairLength, 90)}`,
    "CLOTHING: fully dressed adult in opaque layered medieval under-tunic and outer clothes covering chest, torso, hips, groin and thighs; no nudity, bare chest, lingerie, loincloth, transparent or fetish armor",
    `SCAR: ${compact(spec.scar, 90)}`,
    `SPECIES: ${compact(spec.species, 130)}`,
    `ROLE/BUILD: ${compact(spec.role, 70)}, ${compact(spec.physique, 70)}`,
    compact(spec.concept, 100)
  ].filter(Boolean).join(". ");
}
