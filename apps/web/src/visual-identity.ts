// ADN del avatar protagonista original aprobado. NPCs, criaturas y escenas deben
// acercarse A ESTE estilo; nunca al revés.
export const TINY_QUEST_VISUAL_STYLE = "Classic hand-painted dark-fantasy RPG oil illustration, premium old fantasy novel concept art. Semi-realistic mature refined features, realistic normal-sized eyes, elegant natural anatomy, exact canonical species, soft visible brushwork and broken painted edges, natural species-appropriate surface, intricate medieval fabric leather jewelry or armor when applicable, muted jewel palette, warm side chiaroscuro. Character is the only subject on a simple unobtrusive charcoal-to-black tonal gradient. No anime, manga, cartoon, CGI, doll face, plastic skin, oversized eyes, photorealism, scenery, text, signature or watermark";

export const TINY_QUEST_SCENE_STYLE = "Beautiful hand-painted dark-fantasy RPG environment, semi-realistic oil illustration with old fantasy novel elegance. Wide cinematic composition, visible soft brushwork, subtle canvas texture, atmospheric perspective, warm chiaroscuro, deep shadows, restrained magical glow, refined focal architecture or terrain and looser edges. No anime, cartoon, CGI, photorealism, text or watermark";

const CREATURE_HINT = /\b(animal|bestia|criatura|no\s*human[oa]|cuadr[úu]pedo|felin[oa]|gat[oa]|minino|perr[oa]|canino|sabueso|lob[oa]|zorr[oa]|os[oa]|drag[óo]n|drac[óo]nic|serpiente|reptil|lagart|salamandra|ave|p[áa]jaro|cuervo|b[úu]ho|halc[óo]n|[áa]guila|caballo|corcel|potro|ciervo|conejo|rat[óo]n|murci[ée]lago|ara[ñn]a|insecto|escarabaj|tigre|le[óo]n|pantera|lince|nutria|hur[óo]n|comadreja|mono|simio|quimera|grifo|f[ée]nix|hocico|pelaje|plumas|escamas|colmillos|bigotes|cat|kitten|kitty|feline|hound|wolf|fox|beast|creature|dragon|serpent|feathers|fur|whiskers?)\b/i;
const EXPLICIT_HUMANOID_HINT = /\b(humanoid[ea]?|antropomorf[oa]|forma humana|cuerpo humano|torso humano|b[íi]ped[oa]|human-like|human shaped|anthropomorphic)\b/i;

export function shouldRenderAsCreature(name: string, appearance?: string): boolean {
  const description = `${name} ${appearance ?? ""}`;
  return CREATURE_HINT.test(description) && !EXPLICIT_HUMANOID_HINT.test(description);
}

export function anatomyFidelityRules(appearance?: string): string {
  const exact = appearance?.trim() || "mysterious figure with one memorable visible trait";
  return `Canonical appearance, copy literally and do not simplify: ${exact}. Preserve every stated anatomical trait exactly: species, age, skin, scales, scars, disability, facial asymmetry, horns, limbs and exact eye count. Never normalize unusual anatomy into an ordinary human face.`;
}

export function humanoidPortraitPrompt(name: string, appearance: string | undefined, styleHint: string): string {
  return `CAMERA: close three-quarter portrait from waist up, both eyes and entire head visible. CANONICAL IDENTITY: ${name}, ${appearance?.trim() || "figura enigmática con un secreto"}. Preserve exact species, anatomy, age, scars, clothing and eye count. Explicit skin, iris and hair colors are NON-NEGOTIABLE and override fantasy stereotypes. ${TINY_QUEST_VISUAL_STYLE}. ${styleHint}.`;
}

export function creaturePortraitPrompt(name: string, appearance: string | undefined, styleHint = "fantasy adventure"): string {
  return `CAMERA: complete head and enough body to read the real silhouette. CANONICAL NON-HUMAN IDENTITY: ${name}. ${anatomyFidelityRules(appearance)} Render the actual species, never a human in costume; humanoid only when explicitly stated. ${TINY_QUEST_VISUAL_STYLE}. ${styleHint}.`;
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
