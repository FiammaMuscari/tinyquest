import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "tinyquest-visual-"));
const source = await readFile(new URL("../apps/web/src/visual-identity.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
await writeFile(join(dir, "visual-identity.mjs"), js);
const visual = await import(`file://${join(dir, "visual-identity.mjs")}`);

test("una criatura sigue siendo no humana salvo indicación humanoide explícita", () => {
  assert.equal(visual.shouldRenderAsCreature("Syr", "dragón de seis patas y tres ojos"), true);
  assert.equal(visual.shouldRenderAsCreature("Syr", "dragón humanoide bípedo de tres ojos"), false);
});

test("clasifica humanos, híbridos, criaturas y fenómenos sin convertir todo en una mujer", () => {
  assert.equal(visual.classifyBeingVisual("Mara", "mujer humana anciana"), "humanoid");
  assert.equal(visual.classifyBeingVisual("Asterión", "híbrido minotauro con cabeza bovina"), "hybrid");
  assert.equal(visual.classifyBeingVisual("Nácar", "dragón de seis patas"), "creature");
  assert.equal(visual.classifyBeingVisual("Viento de los Portales", "corrientes de aire que abren grietas dimensionales", "amenaza"), "phenomenon");
  assert.equal(visual.classifyBeingVisual("Oria", "mujer guardiana de los portales"), "humanoid");
});

test("un fenómeno incorpóreo jamás recibe cara humana", () => {
  const prompt = visual.phenomenonPortraitPrompt("Viento de los Portales", "corrientes de aire que arrastran objetos");
  assert.match(prompt, /incorporeal phenomenon, not a person and not a face/i);
  assert.match(prompt, /Absolutely no human, humanoid, face, head, eyes, portrait or person/i);
});

test("si falta género humano, fija una presentación andrógina en vez de inventar mujer", () => {
  const prompt = visual.humanoidPortraitPrompt("Iriel", "elfo adulto con túnica gris", "luna roja");
  assert.match(prompt, /explicitly androgynous\/intersex presentation/i);
  assert.match(prompt, /Do not silently default to a generic woman or man/i);
});

test("el retrato prioriza rostro completo y anatomía literal", () => {
  const prompt = visual.humanoidPortraitPrompt("Iria", "anciana de tres ojos con cicatriz", "luna roja");
  assert.match(prompt, /entire head visible|face centered|no cropped forehead/i);
  assert.match(prompt, /exact eye count|anciana de tres ojos/i);
});

test("los colores elegidos son restricciones no negociables", () => {
  const prompt = visual.humanoidPortraitPrompt("Fiamy", "EXACT SKIN COLOR: warm olive tan skin. EXACT IRIS COLOR: clear green irises. EXACT HAIR COLOR: true black hair", "aventura");
  assert.match(prompt, /colors\/length are NON-NEGOTIABLE/i);
  assert.match(prompt, /warm olive tan skin.*clear green irises.*true black hair/i);
});

test("criaturas no se humanizan por defecto y comparten el estilo visual", () => {
  const prompt = visual.creaturePortraitPrompt("Nacar", "quimera escamada de cuatro alas");
  assert.match(prompt, /actual species, never a human in costume/i);
  assert.match(prompt, /Medieval dark-fantasy oil.*old novel\/RPG art/i);
  assert.match(prompt, /Preserve every stated anatomical trait exactly: species.*broken brushwork\/canvas/is);
  assert.match(prompt, /Never normalize unusual anatomy into an ordinary human face/i);
  assert.match(prompt, /never anime, CGI, photo or plastic/i);
});

test("la expresión cambia con el hecho sin mutar la geometría facial", () => {
  assert.equal(visual.inferFacialExpression("Pista descubierta en el archivo"), "focused");
  assert.equal(visual.inferFacialExpression("Resultado confirmado: failure"), "sorrowful");
  assert.equal(visual.inferFacialExpression("La amenaza inicia combate"), "defiant");
  const prompt = visual.facialExpressionPrompt("wary");
  assert.match(prompt, /controlled wary tension/i);
  assert.match(prompt, /Identity unchanged/i);
  assert.match(prompt, /brows, eyelids and mouth move naturally/i);
});

test("el prompt maestro bloquea género, rostro, colores y artefactos", () => {
  const prompt = visual.humanoidPortraitPrompt("Iriel", "hombre elfo adulto de ojos verdes", "guardián del umbral");
  assert.match(prompt.slice(0, 180), /visibly hand-painted matte oil/i);
  assert.match(prompt, /exact gender, face, species, age, build, skin, irises, hair, scars and outfit/is);
  assert.match(prompt, /gender\/presentation is mandatory and must remain visually unambiguous/i);
  assert.match(prompt, /FACE QUALITY: crisp believable proportions/i);
  assert.match(prompt, /NO blur.*extra digits\/limbs.*nudity\/bare chest.*mixed gender anatomy.*wrong colors\/hair length/is);
  assert.match(prompt, /DISTINCT NPC SILHOUETTE/i);
});

test("el arte de portada es un ambiente y nunca hereda lenguaje de retrato", () => {
  const prompt = visual.sceneStylePrompt();
  assert.match(prompt, /hand-painted dark-fantasy RPG environment/i);
  assert.doesNotMatch(prompt, /expressive face|skin pores|character portrait/i);
});

test("Marea de Ceniza prohíbe agua expuesta en imágenes exteriores", () => {
  const rules = visual.worldImageConstraints("La Marea de Ceniza", "el agua se bombea de napas kilométricas", ["El agua limpia vale más que la sangre", "Nadie sobrevive a cielo abierto sin traje sellador"]);
  assert.match(rules, /SHOW ONLY bone-dry cracked matte mineral ground/i);
  assert.match(rules, /Every outdoor surface is dry, dusty, rough and non-reflective/i);
  assert.match(rules, /sealed survival suit/i);
});
