import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "tinyquest-hero-spec-"));
const source = await readFile(new URL("../apps/web/src/hero-visual-spec.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
await writeFile(join(dir, "hero-visual-spec.mjs"), js);
const { composeHeroAppearance } = await import(`file://${join(dir, "hero-visual-spec.mjs")}`);

const spec = {
  gender: "UNMISTAKABLY ADULT FEMALE; feminine face/body; never male torso",
  species: "veil elf with long pointed ears",
  skin: "exact warm olive skin",
  eyes: "exact violet irises",
  hair: "exact golden hair",
  hairLength: "long below shoulders, never short",
  scar: "left eyebrow scar",
  role: "Guardia del Umbral",
  physique: "athletic",
  concept: "reina exiliada"
};

test("character spec único fija género, ropa, colores y largo", () => {
  const prompt = composeHeroAppearance(spec);
  assert.match(prompt, /GENDER\/BODY:.*ADULT FEMALE.*never male torso/is);
  assert.match(prompt, /CLOTHING: fully dressed adult.*covering chest, torso, hips, groin and thighs/is);
  assert.match(prompt, /no nudity, bare chest, lingerie, loincloth, transparent or fetish armor/i);
  assert.match(prompt, /COLORS:.*warm olive.*violet.*golden/is);
  assert.match(prompt, /HAIR LENGTH: long below shoulders, never short/i);
});

test("campos libres se acotan para no truncar las reglas críticas", () => {
  const prompt = composeHeroAppearance({ ...spec, concept: "x".repeat(5000) });
  assert.ok(prompt.length < 900, `spec demasiado largo: ${prompt.length}`);
  assert.match(prompt, /…$/);
});

test("mutaciones explícitas vencen a la raza sin perder rasgos del usuario", () => {
  const prompt = composeHeroAppearance({ ...spec, bangs: "con flequillo", mutation: "licantropía parcial" });
  assert.match(prompt, /PRIORITY: mutation > species anatomy > user traits > role/i);
  assert.match(prompt, /MID LYCANTHROPE STAGE.*identity and chosen gender remain recognizable/is);
  assert.match(prompt, /partially elongated wolf muzzle.*fur patches.*clawed hands/is);
  assert.match(prompt, /mandatory visible forehead bangs/i);
  assert.match(prompt, /SPECIES ANATOMY LOCK: veil elf/i);
});

test("ojo extra elimina la contradicción de dos ojos de la raza", () => {
  const prompt = composeHeroAppearance({ ...spec, species: "adult elf; exactly two eyes, two arms and two legs", mutation: "ojo extra" });
  assert.match(prompt, /exactly THREE open eyes total/i);
  assert.doesNotMatch(prompt, /exactly two eyes/i);
  assert.match(prompt, /two arms and two legs/i);
});
