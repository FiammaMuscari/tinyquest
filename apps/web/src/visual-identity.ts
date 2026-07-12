// ADN del avatar protagonista original aprobado. NPCs, criaturas y escenas deben
// acercarse A ESTE estilo; nunca al revés.
export const TINY_QUEST_VISUAL_STYLE = "Delicate medieval dark-fantasy oil illustration, elegant semi-realistic fantasy book art, loose confident visible brushwork, softly modeled expressive face, natural slight facial asymmetry, graceful believable anatomy, subdued earthy palette, dramatic warm rim light and deep cool shadows, strands of hair catching light, simple charcoal-and-oil painted background, refined detail around eyes and medieval costume with broad painterly edges elsewhere. Beautiful restrained hand-painted fantasy concept art, not a photograph. No glossy CGI, no porcelain doll face, no beauty filter, no hyperreal skin pores, no 3D render, ABSOLUTELY NO anime or manga facial proportions, no cartoon, no glamour studio lighting, no text, no signature, no watermark";

export const TINY_QUEST_SCENE_STYLE = "Wide cinematic dark fantasy environment concept painting, EMPTY landscape and architecture, broad matte-painting brushwork, atmospheric perspective, subdued earthy palette, dramatic natural light, layered terrain and readable depth, fantasy book illustration, no portrait composition, no close-up face, no focal person, no characters, no silhouettes, no creatures, no text, no watermark";

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
