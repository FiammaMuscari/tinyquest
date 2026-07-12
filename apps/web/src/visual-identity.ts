// ADN del avatar protagonista original aprobado. NPCs, criaturas y escenas deben
// acercarse A ESTE estilo; nunca al revés.
export const TINY_QUEST_VISUAL_STYLE = "Create a beautiful fantasy character of the EXACT CANONICAL SPECIES stated in the identity. Classic hand-painted dark fantasy RPG character art, semi-realistic oil painting with the romantic elegance of an old fantasy novel illustration. THE CHARACTER IS THE ONLY SUBJECT AND MUST DOMINATE THE IMAGE. Graceful silhouette and elongated but believable natural proportions; delicate, mature, refined facial features; luminous expressive realistically sized eyes; loose individual hair strands or species-appropriate head anatomy; intricate medieval fabric, leather, jewelry or armor. The eyes and face are sensitively finished while clothing becomes slightly looser, with visible soft oil strokes, subtle texture, feathered edges, gentle warm chiaroscuro and a thin rim of light. BACKGROUND CONTRACT: only a clean, simple, unobtrusive dark neutral gradient behind the character, softly fading from charcoal to near-black; no visible brush marks, no scenery, no forest, no ruins, no hall, no objects, no shapes, no texture, no decorative light. Noble, mysterious, magical and beautiful, like a premium classic RPG concept painting rather than a modern glossy render. Preserve non-human anatomy exactly; never normalize an elf, dwarf, dragon-marked being, undead, animal or creature into an ordinary human. Absolutely no anime, no manga, no cartoon, no oversized eyes, no cel shading, no glossy CGI, no plastic or porcelain doll face, no 3D render, no photorealism, no text, no signature, no watermark";

export const TINY_QUEST_SCENE_STYLE = "Beautiful hand-painted dark fantasy RPG environment, semi-realistic oil illustration with the romantic elegance of an old fantasy novel. Wide cinematic composition built from large abstract charcoal, deep olive and smoky jewel-toned shapes; visible soft oil strokes, subtle canvas texture, feathered edges, misty atmospheric perspective, gentle warm chiaroscuro, deep quiet shadows and restrained magical glow. Refined focal architecture or terrain surrounded by looser impressionistic brushwork, never glossy or hyper-digital. EMPTY landscape and architecture, no portrait composition, no close-up face, no focal person, no characters, no silhouettes, no creatures, no anime, no cartoon, no CGI, no photorealism, no text, no watermark";

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
