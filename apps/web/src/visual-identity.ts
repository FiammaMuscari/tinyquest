// ADN del avatar protagonista original aprobado. NPCs, criaturas y escenas deben
// acercarse A ESTE estilo; nunca al revés.
export const TINY_QUEST_VISUAL_STYLE = "Medieval dark-fantasy oil, old novel/RPG art: mature semi-realism, natural anatomy, matte pigment, broken brushwork/canvas, rich textiles/leather/metal, muted jewels, warm chiaroscuro; never anime, CGI, photo or plastic";

export const TINY_QUEST_SCENE_STYLE = "Beautiful hand-painted dark-fantasy RPG environment, semi-realistic oil illustration with old fantasy novel elegance. Wide cinematic composition, visible soft brushwork, subtle canvas texture, atmospheric perspective, warm chiaroscuro, deep shadows, restrained magical glow, refined focal architecture or terrain and looser edges. No anime, cartoon, CGI, photorealism, text or watermark";

export const TINY_QUEST_PAINT_MEDIUM = "MEDIUM: visibly hand-painted matte oil with canvas grain and broken brush edges; never glossy CGI/photo";

/** Reglas comunes deliberadamente cortas: Workers AI corta prompts largos. La
 * identidad/cámara quedan primero y este bloque actúa como control de calidad. */
export const TINY_QUEST_IDENTITY_RULES = "IDENTITY LOCK: exact gender, face, species, age, build, skin, irises, hair, scars and outfit; framing/emotion never changes the person";

export const TINY_QUEST_FACE_QUALITY_RULES = "FACE QUALITY: crisp believable proportions, normal coherent eyes, accurate jaw/nose/mouth, natural asymmetry; face clear and lit, never smudged, melted or over-smoothed";

export const TINY_QUEST_NEGATIVE_RULES = "NO blur, deformity, extra digits/limbs, bad face/hands, cropped head/knees, nudity/bare chest, lingerie, transparent/fetish clothes, mixed gender anatomy, identity drift, wrong colors/hair length or anime";

export type FacialExpression = "neutral-alert" | "focused" | "wary" | "defiant" | "relieved" | "sorrowful" | "frightened";

const EXPRESSION_PROMPTS: Record<FacialExpression, string> = {
  "neutral-alert": "calm alert self-possession, relaxed closed mouth and gently focused brows",
  focused: "quiet concentration, intent eyes and a subtly tightened brow",
  wary: "controlled wary tension, watchful eyes and guarded mouth",
  defiant: "restrained defiance, steady direct eyes and a firm natural jaw",
  relieved: "subtle believable relief, softened eyes and the faintest natural smile",
  sorrowful: "contained sorrow, heavy attentive eyes and a quiet unsmiling mouth",
  frightened: "controlled credible fear, widened attentive eyes and tense lips, never theatrical"
};

/** Emoción visual derivada solo del beat/rol público. Es determinista: el mismo
 * hecho produce la misma cara y no convierte cada turno en una imagen nueva. */
export function inferFacialExpression(context = ""): FacialExpression {
  const text = context.toLowerCase();
  if (/fracaso|fall[óo]|derrota|herid|muerte|muert|p[ée]rdida|culpa|duelo|failure|failed|sorrow|grief|loss|wound/.test(text)) return "sorrowful";
  if (/terror|p[áa]nico|atrapad|huir|acecha|horror|fright|panic|trapped/.test(text)) return "frightened";
  if (/victoria|triunf|salv[óo]|rescat|alivio|success|victory|relief|rescued/.test(text)) return "relieved";
  if (/combate|duelo|enemig|amenaza|desaf[íi]|resist|guardi[aá]n|warrior|combat|enemy|defy/.test(text)) return "defiant";
  if (/pista|secreto|investig|archivo|ritual|clave|misterio|clue|secret|investigat|riddle/.test(text)) return "focused";
  if (/peligro|crisis|traici|miente|sospech|vigil|danger|crisis|betray|suspect|watch/.test(text)) return "wary";
  return "neutral-alert";
}

export function facialExpressionPrompt(expression: FacialExpression): string {
  return `EXPRESSION LOCK: ${EXPRESSION_PROMPTS[expression]}. Identity unchanged; only brows, eyelids and mouth move naturally.`;
}

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
  const expression = facialExpressionPrompt(inferFacialExpression(`${appearance ?? ""} ${styleHint}`));
  return `TINYQUEST NPC PORTRAIT V18. ${TINY_QUEST_PAINT_MEDIUM}. CAMERA LOCK: one single NPC in a strict three-quarter portrait at 25-35 degrees; entire head visible, with shoulders and upper torso; both eyes clear and unobstructed. No profile, full body or cropped head. FULLY CLOTHED in opaque layered medieval garments covering chest and torso. ${presentationLock(appearance, "humanoid")} CANONICAL IDENTITY: ${name}, ${appearance?.trim() || "figura enigmática con un secreto"}. ${TINY_QUEST_IDENTITY_RULES}. Skin, iris, scars and hair colors/length are NON-NEGOTIABLE. ${expression} DISTINCT NPC SILHOUETTE: readable face, costume outline and one memorable trait. ${TINY_QUEST_FACE_QUALITY_RULES}. ${TINY_QUEST_VISUAL_STYLE}. ${styleHint}. ${TINY_QUEST_NEGATIVE_RULES}. No text, signature or watermark.`;
}

export function creaturePortraitPrompt(name: string, appearance: string | undefined, styleHint = "fantasy adventure", kind: "creature" | "hybrid" = "creature"): string {
  const identity = kind === "hybrid"
    ? "IDENTITY TYPE: anatomical hybrid. Show every human and non-human body region in the exact stated arrangement; never collapse it into a normal human."
    : presentationLock(appearance, "creature");
  return `TINYQUEST CREATURE PORTRAIT V18. ${TINY_QUEST_PAINT_MEDIUM}. ONE SUBJECT ONLY: complete head and enough body to read the real species silhouette. ${identity} CANONICAL NON-HUMAN IDENTITY: ${name}. ${anatomyFidelityRules(appearance)} Render the actual species, never a human in costume. Use its real anatomical structure, posture and locomotion. No human face, hands, upright posture, clothes, rider or pack unless explicitly requested. No duplicated anatomy, extra heads or extra limbs. ${TINY_QUEST_VISUAL_STYLE}. ${styleHint}. ${TINY_QUEST_NEGATIVE_RULES}. No text, signature or watermark.`;
}

export function phenomenonPortraitPrompt(name: string, description: string | undefined, styleHint = "fantasy adventure"): string {
  return `TINYQUEST PHENOMENON V17. SQUARE ICON COMPOSITION: the incorporeal threat itself fills the frame. ${presentationLock(description, "phenomenon")} CANONICAL PHENOMENON: ${name}. Literal visible behavior: ${description?.trim() || "an unnatural force distorting its surroundings"}. Show air, particles, light, debris or space physically reacting in the exact described way. Absolutely no human, humanoid, face, head, eyes, portrait or person. Single clear supernatural phenomenon on a simple dark atmospheric field. ${TINY_QUEST_SCENE_STYLE}. ${styleHint}.`;
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
