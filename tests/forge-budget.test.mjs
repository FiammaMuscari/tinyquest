import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const dir = join(tmpdir(), `tinyquest-forge-budget-${process.pid}`);
await mkdir(dir, { recursive: true });

async function transpile(name, replacements = {}) {
  let source = await readFile(new URL(`../packages/game-engine/src/${name}.ts`, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(join(dir, `${name}.mjs`), outputText);
}

for (const leaf of ["talents", "dice", "roles", "species", "abilities", "pets", "stats"]) await transpile(leaf);
await transpile("character", {
  'from "./roles"': 'from "./roles.mjs"',
  'from "./species"': 'from "./species.mjs"',
  'from "./abilities"': 'from "./abilities.mjs"',
  'from "./pets"': 'from "./pets.mjs"',
  'from "./stats"': 'from "./stats.mjs"'
});

const character = await import(`file://${join(dir, "character.mjs")}`);
const stats = await import(`file://${join(dir, "stats.mjs")}`);
const { species } = await import(`file://${join(dir, "species.mjs")}`);
const { roles } = await import(`file://${join(dir, "roles.mjs")}`);

// El presupuesto que muestra la forja (App.tsx: `8 - totalExtraPoints(draft.stats)`).
const FORGE_BUDGET = 8;
const MAX_PER_STAT = 4;

test("1) ninguna especie deja la forja en negativo", () => {
  for (const item of species) {
    const hero = character.createCharacter({ species: item.name });
    const spent = stats.totalExtraPoints(hero.stats);
    assert.equal(
      spent,
      FORGE_BUDGET,
      `${item.name}: gasta ${spent}/${FORGE_BUDGET} → la barra mostraría ${FORGE_BUDGET - spent} puntos`
    );
  }
});

test("2) el molde por defecto deja lugar para el bonus de linaje", () => {
  // El molde solo gasta 7: el 8º punto lo aporta el statBonus de la especie.
  // Si alguien vuelve a subir el molde a 8, este test cae antes que la UI.
  const withoutBonus = species.find((item) => Object.keys(item.statBonus ?? {}).length === 0);
  assert.equal(withoutBonus, undefined, "toda especie debe declarar statBonus, si no el molde queda en 7/8");
  for (const item of species) {
    const hero = character.createCharacter({ species: item.name });
    const bonusStat = Object.keys(item.statBonus)[0];
    const bonusValue = item.statBonus[bonusStat];
    assert.equal(bonusValue, 1, `${item.name}: el molde asume un bonus de +1`);
    assert.equal(
      stats.totalExtraPoints(hero.stats) - bonusValue,
      FORGE_BUDGET - 1,
      `${item.name}: el molde sin bonus debe gastar ${FORGE_BUDGET - 1}`
    );
  }
});

test("3) ninguna especie pasa el tope de 4 por stat ni baja de 1", () => {
  for (const item of species) {
    const hero = character.createCharacter({ species: item.name });
    for (const [key, value] of Object.entries(hero.stats)) {
      assert.ok(value >= 1 && value <= MAX_PER_STAT, `${item.name}: ${key}=${value} fuera de 1..${MAX_PER_STAT}`);
    }
  }
});

test("4) el rol no altera el presupuesto de forja", () => {
  for (const role of roles) {
    for (const item of species) {
      const hero = character.createCharacter({ species: item.name, role: role.name });
      assert.equal(
        stats.totalExtraPoints(hero.stats),
        FORGE_BUDGET,
        `${item.name} / ${role.name}: gasta ${stats.totalExtraPoints(hero.stats)}/${FORGE_BUDGET}`
      );
    }
  }
});

test("5) re-forjar la misma ficha no compone el bonus (idempotente)", () => {
  // La forja re-ejecuta createCharacter en cada clic del jugador; si el bonus se
  // re-aplicara, el gasto treparía un punto por clic hasta desbordar.
  for (const item of species) {
    let hero = character.createCharacter({ species: item.name });
    for (let click = 0; click < 5; click += 1) hero = character.createCharacter({ ...hero, species: item.name });
    assert.equal(
      stats.totalExtraPoints(hero.stats),
      FORGE_BUDGET,
      `${item.name}: tras 5 re-forjas gasta ${stats.totalExtraPoints(hero.stats)}/${FORGE_BUDGET}`
    );
  }
});

test("6) cambiar de especie en la forja no desborda el presupuesto", () => {
  // Recorre todas las especies encadenadas, como quien tantea las tarjetas.
  let hero = character.createCharacter();
  for (const item of species) {
    hero = character.createCharacter({ ...hero, species: item.name });
    assert.ok(
      stats.totalExtraPoints(hero.stats) <= FORGE_BUDGET,
      `tras pasar a ${item.name}: gasta ${stats.totalExtraPoints(hero.stats)}/${FORGE_BUDGET}`
    );
  }
});
