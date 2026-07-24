import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const dir = join(tmpdir(), `tinyquest-talents-${process.pid}`);
await mkdir(dir, { recursive: true });

async function transpile(name, replacements = {}) {
  let source = await readFile(new URL(`../packages/game-engine/src/${name}.ts`, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(join(dir, `${name}.mjs`), outputText);
}

// Hojas sin imports de runtime primero, luego los que dependen de ellas.
for (const leaf of ["talents", "dice", "roles", "species", "abilities", "pets", "stats"]) await transpile(leaf);
await transpile("checks", { 'from "./dice"': 'from "./dice.mjs"' });
await transpile("character", {
  'from "./roles"': 'from "./roles.mjs"',
  'from "./species"': 'from "./species.mjs"',
  'from "./abilities"': 'from "./abilities.mjs"',
  'from "./pets"': 'from "./pets.mjs"',
  'from "./stats"': 'from "./stats.mjs"'
});

const talents = await import(`file://${join(dir, "talents.mjs")}`);
const checks = await import(`file://${join(dir, "checks.mjs")}`);
const character = await import(`file://${join(dir, "character.mjs")}`);
const species = (await import(`file://${join(dir, "species.mjs")}`)).species;

test("1) el catálogo tiene los 4 talentos con afinidades y activo bien formados", () => {
  assert.equal(talents.talents.length, 4);
  for (const t of talents.talents) {
    assert.ok(t.affinities.length >= 1, `${t.id} sin afinidades`);
    assert.ok(t.passiveBonus >= 1);
    assert.ok(t.activeName && t.activeDescription);
    assert.ok(t.activeEffect && typeof t.activeEffect === "object");
  }
});

test("2) talentPassiveBonus: suma solo cuando el stat es afín", () => {
  const flame = talents.getTalent("flame"); // afín: body, courage
  assert.equal(talents.talentPassiveBonus(flame, "body"), flame.passiveBonus);
  assert.equal(talents.talentPassiveBonus(flame, "courage"), flame.passiveBonus);
  assert.equal(talents.talentPassiveBonus(flame, "mind"), 0);
  assert.equal(talents.talentPassiveBonus(undefined, "body"), 0);
});

test("3) getTalent resuelve por id y tolera vacío", () => {
  assert.equal(talents.getTalent("arcane").name, "Arcano");
  assert.equal(talents.getTalent("inexistente"), undefined);
  assert.equal(talents.getTalent(undefined), undefined);
});

test("4) isTalentAvailable: 1/escena por jugador, gateado por el sessionLog", () => {
  const room = { sessionLog: [
    { sceneId: "s1", playerId: "p1", talentActivated: true },
    { sceneId: "s1", playerId: "p2" },
    { sceneId: "s2", playerId: "p1" }
  ] };
  assert.equal(talents.isTalentAvailable(room, "p1", "s1"), false); // ya lo usó en s1
  assert.equal(talents.isTalentAvailable(room, "p2", "s1"), true);  // p2 no lo usó
  assert.equal(talents.isTalentAvailable(room, "p1", "s2"), true);  // escena nueva lo repone
});

test("5) resolveCheck/calculateRollTotal: el flatBonus del talento entra al total", () => {
  const base = checks.calculateRollTotal({ d20: 10, statModifier: 2, d4Bonus: 0, flatBonus: 0 });
  const boosted = checks.calculateRollTotal({ d20: 10, statModifier: 2, d4Bonus: 0, flatBonus: 4 });
  assert.equal(base.total, 12);
  assert.equal(boosted.total, 16);
  assert.equal(boosted.flatBonus, 4);
});

test("6) createCharacter aplica el statBonus de especie en el path por defecto (bug latente)", () => {
  // Humano de Juramento: statBonus courage +1. Sin stats explícitos → debe aplicarse.
  const human = species.find((s) => s.id === "human-oath");
  const hero = character.createCharacter({ species: human.name });
  // base courage del molde = 2, +1 de especie = 3.
  assert.equal(hero.stats.courage, 3, "el statBonus de especie debe sumarse");
});

test("7) createCharacter NO duplica el statBonus cuando llegan stats explícitos (path de la forja)", () => {
  const human = species.find((s) => s.id === "human-oath");
  const hero = character.createCharacter({ species: human.name, stats: { body: 1, mind: 1, charm: 1, creativity: 1, courage: 2, focus: 1, luck: 1 } });
  // la forja re-ejecuta createCharacter en cada clic: si sumara el bonus acá, se compondría.
  assert.equal(hero.stats.courage, 2, "con stats explícitos el bonus NO se re-aplica");
});

test("8) createCharacter persiste el talento elegido", () => {
  assert.equal(character.createCharacter({ talent: "arcane" }).talent, "arcane");
  assert.equal(character.createCharacter().talent, undefined);
});
