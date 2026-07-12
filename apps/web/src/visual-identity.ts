// ADN del avatar protagonista original aprobado. NPCs, criaturas y escenas deben
// acercarse A ESTE estilo; nunca al revés.
export const TINY_QUEST_VISUAL_STYLE = "Create a new fantasy character of the EXACT CANONICAL SPECIES stated in the identity, in a dark fantasy semi-realistic painterly style, with the look of premium RPG concept art and splash art. The illustration must be cinematic, elegant, and highly detailed, with species-accurate refined facial features, expressive eyes, natural hair or species-appropriate head anatomy, intricate medieval costume or armor when applicable, rich textures, soft painterly oil brushwork, dramatic moody lighting, subtle magical glow, deep shadows, and an atmospheric background such as ancient ruins, misty halls, or a mystical forest. The overall mood must feel noble, mysterious, magical, and polished, with a dark jewel-toned palette and a sophisticated fantasy aesthetic. Preserve non-human anatomy exactly; never normalize an elf, dwarf, dragon-marked being, undead, animal or creature into an ordinary human. Delicate medieval oil-painting finish. Absolutely no anime, no manga, no cartoon, no oversized eyes, no cel shading, no glossy CGI, no porcelain doll face, no 3D render, no text, no signature, no watermark";

export const TINY_QUEST_SCENE_STYLE = "Create a dark fantasy semi-realistic painterly scene with the look of premium RPG concept art and splash art. Wide cinematic composition, elegant highly detailed environment, ancient ruins, misty halls or mystical forest, rich textures, soft painterly oil brushwork, dramatic moody lighting, subtle magical glow, deep shadows, atmospheric perspective, dark jewel-toned palette and sophisticated fantasy aesthetic. EMPTY landscape and architecture, no portrait composition, no close-up face, no focal person, no characters, no silhouettes, no creatures, no anime, no cartoon, no text, no watermark";

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
  return `${TINY_QUEST_VISUAL_STYLE}, three-quarter shot from the waist up, face clearly visible, closer camera: ${name}, ${appearance?.trim() || "figura enigmática con un secreto"}. Setting: ${styleHint}. Dark blurred painted background. Treat every explicitly selected skin, eye and hair color as a NON-NEGOTIABLE identity constraint: reproduce each color literally, never replace it with a fantasy stereotype, lighting effect or racial default. Preserve exact stated anatomy and eye count; keep the entire head visible without changing the painting style.`;
}

export function creaturePortraitPrompt(name: string, appearance: string | undefined, styleHint = "fantasy adventure"): string {
  return `${TINY_QUEST_VISUAL_STYLE}. Mythical or non-human being: ${name}. ${anatomyFidelityRules(appearance)} Render its actual species and silhouette, not a human wearing a costume. Do not make it humanoid unless the canonical appearance explicitly says humanoid or anthropomorphic. Show the complete head, face and identifying anatomy, plus enough body to understand its real shape. Setting: ${styleHint}. Dark blurred background`;
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
    constraints.push("EXTREME ARIDITY: all usable water is hidden deep underground or inside sealed machinery. Absolutely no exposed water outdoors: no pools, fountains, canals, rivers, lakes, puddles, wet pavement, rain or decorative blue water surfaces. Show dry cracked mineral ground, ash, dust, sealed pipes, pumps and moisture-proof technology instead.");
  }
  if (/traje sellador|cielo abierto/.test(source)) constraints.push("Any person outdoors must wear a fully functional sealed survival suit; no exposed casual clothing under the hostile sky.");
  return constraints.join(" ");
}
