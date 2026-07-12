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

test("el retrato prioriza rostro completo y anatomía literal", () => {
  const prompt = visual.humanoidPortraitPrompt("Iria", "anciana de tres ojos con cicatriz", "luna roja");
  assert.match(prompt, /entire head visible|face centered|no cropped forehead/i);
  assert.match(prompt, /exact eye count|anciana de tres ojos/i);
});

test("los colores elegidos son restricciones no negociables", () => {
  const prompt = visual.humanoidPortraitPrompt("Fiamy", "EXACT SKIN COLOR: warm olive tan skin. EXACT IRIS COLOR: clear green irises. EXACT HAIR COLOR: true black hair", "aventura");
  assert.match(prompt, /NON-NEGOTIABLE identity constraint/i);
  assert.match(prompt, /never replace it with a fantasy stereotype/i);
  assert.match(prompt, /warm olive tan skin.*clear green irises.*true black hair/i);
});

test("criaturas no se humanizan por defecto y comparten el estilo visual", () => {
  const prompt = visual.creaturePortraitPrompt("Nacar", "quimera escamada de cuatro alas");
  assert.match(prompt, /not a human wearing a costume/i);
  assert.match(prompt, /EXACT CANONICAL SPECIES.*dark fantasy semi-realistic painterly style.*premium RPG concept art and splash art/i);
  assert.match(prompt, /never normalize an elf, dwarf, dragon-marked being, undead, animal or creature into an ordinary human/i);
  assert.match(prompt, /No glossy CGI.*porcelain doll face.*no 3D render/i);
});

test("el arte de portada es un ambiente y nunca hereda lenguaje de retrato", () => {
  const prompt = visual.sceneStylePrompt();
  assert.match(prompt, /EMPTY landscape and architecture/i);
  assert.match(prompt, /no portrait composition.*no close-up face.*no focal person/i);
  assert.doesNotMatch(prompt, /expressive face|skin pores|character portrait/i);
});

test("Marea de Ceniza prohíbe agua expuesta en imágenes exteriores", () => {
  const rules = visual.worldImageConstraints("La Marea de Ceniza", "el agua se bombea de napas kilométricas", ["El agua limpia vale más que la sangre", "Nadie sobrevive a cielo abierto sin traje sellador"]);
  assert.match(rules, /Absolutely no exposed water outdoors/i);
  assert.match(rules, /no pools, fountains, canals, rivers, lakes, puddles/i);
  assert.match(rules, /sealed survival suit/i);
});
