// ADN del avatar protagonista original aprobado. NPCs, criaturas y escenas deben
// acercarse A ESTE estilo; nunca al revés.
export const TINY_QUEST_VISUAL_STYLE = "Classic hand-painted dark-fantasy RPG oil illustration, premium old fantasy novel concept art. Semi-realistic mature refined features, realistic normal-sized eyes, elegant natural anatomy, exact canonical species, soft visible brushwork and broken painted edges, natural species-appropriate surface, intricate medieval fabric leather jewelry or armor when applicable, muted jewel palette, warm side chiaroscuro. Character is the only subject on a simple unobtrusive charcoal-to-black tonal gradient. No anime, manga, cartoon, CGI, doll face, plastic skin, oversized eyes, photorealism, scenery, text, signature or watermark";

export const TINY_QUEST_SCENE_STYLE = "Beautiful hand-painted dark-fantasy RPG environment, semi-realistic oil illustration with old fantasy novel elegance. Wide cinematic composition, visible soft brushwork, subtle canvas texture, atmospheric perspective, warm chiaroscuro, deep shadows, restrained magical glow, refined focal architecture or terrain and looser edges. No anime, cartoon, CGI, photorealism, text or watermark";

const CREATURE_HINT = /\b(animal|mascota|bestia|criatura|no\s*human[oa]|alien(?:[íi]gena)?|extraterrestre|cuadr[úu]pedo|felin[oa]|gat[oa]|minino|perr[oa]|canino|sabueso|lob[oa]|zorr[oa]|os[oa]|drag[óo]n|drac[óo]nic|serpiente|reptil|lagart|salamandra|ave|p[áa]jaro|cuervo|b[úu]ho|halc[óo]n|[áa]guila|caballo|corcel|potro|pegaso|ciervo|conejo|rat[óo]n|murci[ée]lago|ara[ñn]a|insecto|escarabaj|tigre|le[óo]n|pantera|lince|nutria|hur[óo]n|comadreja|mono|simio|quimera|grifo|f[ée]nix|hocico|pelaje|plumas|escamas|colmillos|bigotes|cat|kitten|kitty|feline|hound|wolf|fox|beast|creature|dragon|serpent|feathers|fur|whiskers?)\b/i;
const EXPLICIT_HUMANOID_HINT = /\b(humanoid[ea]?|antropomorf[oa]|forma humana|cuerpo humano|torso humano|b[íi]ped[oa]|human-like|human shaped|anthropomorphic)\b/i;
const HYBRID_HINT = /\b(h[íi]brid[oa]|mestiz[oa]|centaur[oa]?|minotaur[oa]?|s[áa]tir[oa]?|faun[oa]?|sirena|trit[óo]n|lamia|harp[íi]a|quimera|mitad\s+(?:human[oa]|caballo|animal)|half[- ](?:human|horse|beast))\b/i;
const PHENOMENON_HINT = /\b(fen[óo]meno|entidad\s+incorp[óo]rea|sin\s+cuerpo|tormenta|tempestad|vendaval|viento|corrientes?\s+de\s+aire|remolino|niebla\s+(?:viviente|con|que|voraz|devoradora)|nube\s+viviente|llama\s+viviente|portal(?:es)?\s+(?:viviente|dimensional)|grieta\s+dimensional|anomal[íi]a\s+(?:espacial|m[áa]gica|viviente)|maldici[óo]n\s+viviente|living\s+(?:storm|fog|flame)|dimensional\s+rift)\b/i;

export type BeingVisualKind = "humanoid" | "hybrid" | "creature" | "phenomenon";

export function classifyBeingVisual(name: string, appearance?: string, role?: string): BeingVisualKind {
  const description = `${name} ${appearance ?? ""} ${role ?? ""}`;
  if (PHENOMENON_HINT.test(description)) return "phenomenon";
  if (HYBRID_HINT.test(description)) return "hybrid";
  if (CREATURE_HINT.test(description) && !EXPLICIT_HUMANOID_HINT.test(description)) return "creature";
  return "humanoid";
}

export function shouldRenderAsCreature(name: string, appearance?: string): boolean {
  const kind = classifyBeingVisual(name, appearance);
  return kind === "creature" || kind === "hybrid";
}

export function anatomyFidelityRules(appearance?: string): string {
  const exact = appearance?.trim() || "mysterious figure with one memorable visible trait";
  return `Canonical appearance, copy literally and do not simplify: ${exact}. Preserve every stated anatomical trait exactly: species, age, skin, scales, scars, disability, facial asymmetry, horns, limbs and exact eye count. Never normalize unusual anatomy into an ordinary human face.`;
}

function presentationLock(appearance: string | undefined, kind: BeingVisualKind): string {
  const text = appearance ?? "";
  if (kind === "phenomenon") return "IDENTITY TYPE: incorporeal phenomenon, not a person and not a face.";
  if (kind === "creature") return "IDENTITY TYPE: non-human creature or animal; use its real species anatomy rather than human gender stereotypes.";
  const explicit = /\b(mujer|femenin[oa]|hembra|female|woman|hombre\s+afeminado|var[óo]n\s+afeminado|effeminate\s+man|hombre|masculin[oa]|macho|male|man|andr[óo]gin[oa]|intersex(?:ual)?|hermafrodita|no\s+binari[oa]|nonbinary)\b/i.test(text);
  const type = kind === "hybrid" ? "anatomical hybrid" : "humanoid";
  return explicit
    ? `IDENTITY TYPE: ${type}. The explicitly stated gender/presentation is mandatory and must remain visually unambiguous.`
    : `IDENTITY TYPE: ${type}, explicitly androgynous/intersex presentation. Do not silently default to a generic woman or man.`;
}

export function humanoidPortraitPrompt(name: string, appearance: string | undefined, styleHint: string): string {
  return `TINYQUEST NPC PORTRAIT V15. CAMERA: close three-quarter portrait from waist up, face centered, both eyes and entire head visible, no cropped forehead. ${presentationLock(appearance, "humanoid")} CANONICAL IDENTITY: ${name}, ${appearance?.trim() || "figura enigmática con un secreto"}. The image must visibly agree with this canonical description, not merely its mood. Preserve exact species, anatomy, apparent age, gender presentation, face, body type, scars, clothing and eye count. Explicit skin, iris and hair colors are NON-NEGOTIABLE and override fantasy stereotypes. One subject only. ${TINY_QUEST_VISUAL_STYLE}. ${styleHint}.`;
}

export function creaturePortraitPrompt(name: string, appearance: string | undefined, styleHint = "fantasy adventure", kind: "creature" | "hybrid" = "creature"): string {
  const identity = kind === "hybrid"
    ? "IDENTITY TYPE: anatomical hybrid. Show every human and non-human body region in the exact stated arrangement; never collapse it into a normal human."
    : presentationLock(appearance, "creature");
  return `TINYQUEST CREATURE PORTRAIT V15. CAMERA: complete head and enough body to read the real silhouette. ${identity} CANONICAL NON-HUMAN IDENTITY: ${name}. ${anatomyFidelityRules(appearance)} The image must literally agree with the description. Render the actual species, never a human in costume; humanoid only when explicitly stated. One subject only. ${TINY_QUEST_VISUAL_STYLE}. ${styleHint}.`;
}

export function phenomenonPortraitPrompt(name: string, description: string | undefined, styleHint = "fantasy adventure"): string {
  return `TINYQUEST PHENOMENON V15. SQUARE ICON COMPOSITION: the incorporeal threat itself fills the frame. ${presentationLock(description, "phenomenon")} CANONICAL PHENOMENON: ${name}. Literal visible behavior: ${description?.trim() || "an unnatural force distorting its surroundings"}. Show air, particles, light, debris or space physically reacting in the exact described way. Absolutely no human, humanoid, face, head, eyes, portrait or person. Single clear supernatural phenomenon on a simple dark atmospheric field. ${TINY_QUEST_SCENE_STYLE}. ${styleHint}.`;
}

export function sceneStylePrompt(): string {
  return TINY_QUEST_SCENE_STYLE;
}

export function worldImageConstraints(worldName: string, ambience: string, rules: string[]): string {
  const source = `${worldName} ${ambience} ${rules.join(" ")}`.toLowerCase();
  const constraints = [
    `Canonical world identity: ${worldName}. ${ambience}`,
    `World laws override any generic fantasy imagery: ${rules.join(" ")}`
  ];
  if (/agua.*(escond|napa|subterr|escas)|escasez de agua|marea de ceniza/.test(source)) {
    // Prompt positivo: enumerar cosas prohibidas hace que diffusion las dibuje.
    constraints.push("EXTREME ARIDITY. SHOW ONLY bone-dry cracked matte mineral ground, powdery ash, airborne dust, sealed pipes, pumps and moisture-proof machinery. Every outdoor surface is dry, dusty, rough and non-reflective. All usable moisture exists invisibly deep underground inside sealed technology.");
  }
  if (/traje sellador|cielo abierto/.test(source)) constraints.push("Any person outdoors must wear a fully functional sealed survival suit; no exposed casual clothing under the hostile sky.");
  return constraints.join(" ");
}
