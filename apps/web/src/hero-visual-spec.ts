/** Contrato canónico único del héroe. Identidad, vestuario y anatomía se
 * componen acá; cámara, estilo y caché viven en sus capas respectivas. */
export type HeroVisualSpec = {
  gender: string;
  species: string;
  skin: string;
  eyes: string;
  hair: string;
  hairLength: string;
  bangs?: "sin flequillo" | "con flequillo";
  mutation?: "ninguna" | "ojo extra" | "alienígena" | "licantropía parcial";
  scar: string;
  role: string;
  physique: string;
  concept?: string;
};

const mutationPrompt = (mutation: HeroVisualSpec["mutation"]): string => {
  if (mutation === "ojo extra") return "EXPLICIT MUTATION OVERRIDE: exactly THREE open eyes total; one natural third eye centered vertically on the forehead, same iris color as the other two; never two or four eyes";
  if (mutation === "alienígena") return "EXPLICIT MUTATION OVERRIDE: one coherent alien humanoid, elongated non-human cranial structure and subtle symmetrical alien facial anatomy; still one subject, two arms and two legs; never a mask or separate creature";
  if (mutation === "licantropía parcial") return "EXPLICIT TRANSFORMATION OVERRIDE — MID LYCANTHROPE STAGE: original human identity and chosen gender remain recognizable; partially elongated wolf muzzle, symmetrical fur patches, partially pointed wolf ears and clawed hands; one hybrid body only; never ordinary unchanged human, complete wolf, two subjects or split human/wolf";
  return "MUTATION: none; species-normal eyes/anatomy; no alien or lycanthrope traits";
};

function compact(text: string | undefined, max: number): string | undefined {
  const clean = text?.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function composeHeroAppearance(spec: HeroVisualSpec): string {
  // La mutación no solo se antepone: elimina del bloque racial la cláusula que
  // contradice su anatomía. Así el modelo nunca recibe "dos ojos" y "tres ojos".
  const resolvedSpecies = spec.mutation === "ojo extra"
    ? spec.species.replace(/exactly two eyes,?\s*/ig, "")
    : spec.species;
  return [
    // Lo que el usuario eligió (género + colores + largo de pelo) es VERDAD
    // ABSOLUTA: va PRIMERO y con la máxima jerarquía. Solo la anatomía que una
    // mutación física impone (recuento de ojos, hocico) puede alterar la forma,
    // y aun así conserva el género elegido. Nada más lo reinterpreta.
    `ABSOLUTE USER-CHOSEN IDENTITY — HIGHEST PRIORITY, GROUND TRUTH, NEVER OVERRIDE, REINTERPRET OR SWAP: ${compact(spec.gender, 190)}`,
    `EXACT USER COLORS (non-negotiable, do not shift): ${compact(spec.skin, 80)}; ${compact(spec.eyes, 90)}; ${compact(spec.hair, 90)}`,
    `HAIR LENGTH: ${compact(spec.hairLength, 90)}`,
    // La cicatriz va TEMPRANO (antes del corte de 900/980 chars de los wrappers):
    // si el usuario no eligió cicatriz, "piel limpia" debe llegar al modelo o el
    // Frente inventa heridas; si eligió una, debe sobrevivir para renderizarse.
    `SCAR: ${compact(spec.scar, 90)}`,
    "PRIORITY: user-chosen gender & colors are absolute ground truth > mutation anatomy override > species anatomy > role; the chosen gender and colors survive every other rule",
    mutationPrompt(spec.mutation),
    `SPECIES ANATOMY LOCK (must keep the user-chosen gender and colors above): ${compact(resolvedSpecies, 190)}`,
    `GENDER REAFFIRM (same as the absolute identity, never contradicted): ${compact(spec.gender, 190)}`,
    `BANGS: ${spec.bangs === "con flequillo" ? "mandatory visible forehead bangs/fringe, identical in every view" : "no bangs or fringe covering the forehead"}`,
    "CLOTHING: fully dressed adult in opaque medieval clothes covering chest, torso, hips, groin and thighs; no nudity, bare chest, lingerie, loincloth, transparent or fetish armor",
    `ROLE/BUILD: ${compact(spec.role, 70)}, ${compact(spec.physique, 70)}`,
    compact(spec.concept, 100)
  ].filter(Boolean).join(". ");
}
