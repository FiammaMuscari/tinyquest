import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "tinyquest-portrait-state-"));
const source = await readFile(new URL("../packages/game-engine/src/portrait-state.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
}).outputText;
await writeFile(join(dir, "portrait-state.mjs"), output);
const { heroPortraitIdentityKey, heroPortraitNeedsRefresh } = await import(`file://${join(dir, "portrait-state.mjs")}`);

function hero(overrides = {}) {
  const base = {
    name: "Fiamy",
    species: "Elfo del Velo",
    role: "Guardiana",
    concept: "juramento de luna",
    stats: { body: 2, mind: 4, charm: 2, creativity: 3, courage: 2, focus: 2, luck: 2 },
    pet: { id: "dragon" },
    look: {
      gender: "femenino",
      skinTone: "cálida",
      eyeColor: "violeta",
      hairColor: "dorado",
      scar: "ceja izquierda",
      faceUrl: "/prompt/face?seed=7",
      fullBodyUrl: "/prompt/body?seed=7"
    }
  };
  const character = { ...base, ...overrides, look: { ...base.look, ...overrides.look } };
  character.look.portraitIdentity ??= heroPortraitIdentityKey(character);
  return character;
}

test("el par al día no necesita regenerarse", () => {
  assert.equal(heroPortraitNeedsRefresh(hero()), false);
});

test("raza y rasgos visuales dejan la imagen pendiente", () => {
  const original = hero();
  for (const changed of [
    hero({ species: "Enano de Brasa", look: { portraitIdentity: original.look.portraitIdentity } }),
    hero({ look: { eyeColor: "turquesa", portraitIdentity: original.look.portraitIdentity } }),
    hero({ look: { hairColor: "azul", portraitIdentity: original.look.portraitIdentity } }),
    hero({ look: { skinTone: "oscura", portraitIdentity: original.look.portraitIdentity } }),
    hero({ look: { scar: "sin cicatrices", portraitIdentity: original.look.portraitIdentity } })
  ]) assert.equal(heroPortraitNeedsRefresh(changed), true);
});

test("nombre, oficio, concepto y stat dominante forman parte de la identidad", () => {
  const original = hero();
  for (const changed of [
    hero({ name: "Asha", look: { portraitIdentity: original.look.portraitIdentity } }),
    hero({ role: "Oráculo", look: { portraitIdentity: original.look.portraitIdentity } }),
    hero({ concept: "reina exiliada", look: { portraitIdentity: original.look.portraitIdentity } }),
    hero({ stats: { ...original.stats, body: 5 }, look: { portraitIdentity: original.look.portraitIdentity } })
  ]) assert.equal(heroPortraitNeedsRefresh(changed), true);
});

test("mascota y stats no dominantes no ensucian el retrato", () => {
  const original = hero();
  assert.equal(heroPortraitNeedsRefresh(hero({ pet: { id: "polilla" }, look: { portraitIdentity: original.look.portraitIdentity } })), false);
  assert.equal(heroPortraitNeedsRefresh(hero({ stats: { ...original.stats, luck: 3 }, look: { portraitIdentity: original.look.portraitIdentity } })), false);
});

test("si falta cualquiera de las dos tomas siempre queda pendiente", () => {
  assert.equal(heroPortraitNeedsRefresh(hero({ look: { faceUrl: "" } })), true);
  assert.equal(heroPortraitNeedsRefresh(hero({ look: { fullBodyUrl: undefined } })), true);
});
