import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpile(sourcePath, outPath, replacements = {}) {
  let source = await readFile(new URL(sourcePath, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  });
  await writeFile(outPath, outputText);
}

async function loadModules() {
  const dir = join(tmpdir(), `tinyquest-crit-tests-${process.pid}`);
  await mkdir(dir, { recursive: true });
  await transpile("../packages/game-engine/src/dice.ts", join(dir, "dice.mjs"));
  await transpile("../packages/game-engine/src/checks.ts", join(dir, "checks.mjs"), { 'from "./dice"': 'from "./dice.mjs"' });
  await transpile("../packages/game-engine/src/combat.ts", join(dir, "combat.mjs"), { 'from "./dice"': 'from "./dice.mjs"' });
  const checks = await import(`file://${join(dir, "checks.mjs")}`);
  const combat = await import(`file://${join(dir, "combat.mjs")}`);
  return { checks, combat };
}

const { checks, combat } = await loadModules();
const { resolveCheck } = checks;
const { resolveAttack } = combat;

// d20 value = floor(20 * r) + 1, so r=0.99 -> 20, r=0 -> 1, r=0.8 -> 17.
function withD20(faceValue, fn) {
  const original = Math.random;
  Math.random = () => (faceValue - 1) / 20 + 0.0001;
  try { return fn(); } finally { Math.random = original; }
}

const baseStats = { body: 0, mind: 0, charm: 0, creativity: 0, courage: 0, focus: 0, luck: 0 };

test("natural 20 is a critical success even against a high DC", () => {
  const result = withD20(20, () => resolveCheck({ ...baseStats, courage: 0 }, "courage", 25, "probar"));
  assert.equal(result.d20.value, 20);
  assert.equal(result.outcome, "success");
  assert.equal(result.critical, true);
  assert.equal(result.fumble, undefined);
});

test("natural 1 is a fumble even with a strong stat against a low DC", () => {
  const result = withD20(1, () => resolveCheck({ ...baseStats, courage: 10 }, "courage", 5, "probar"));
  assert.equal(result.d20.value, 1);
  assert.equal(result.outcome, "failure");
  assert.equal(result.fumble, true);
  assert.equal(result.critical, undefined);
});

test("high luck widens the crit range: a 17 crits with luck 9", () => {
  const lucky = withD20(17, () => resolveCheck({ ...baseStats, luck: 9 }, "mind", 25, "probar"));
  assert.equal(lucky.d20.value, 17);
  assert.equal(lucky.critical, true);
  assert.equal(lucky.outcome, "success");
  assert.equal(lucky.luckBonus, 3);

  const unlucky = withD20(17, () => resolveCheck({ ...baseStats, luck: 0 }, "mind", 25, "probar"));
  assert.equal(unlucky.critical, undefined);
  assert.equal(unlucky.outcome, "failure");
});

test("combat: natural 20 is a critical hit, natural 1 is a fumble miss", () => {
  const enemy = { id: "x", name: "La Sombra", defense: 14, vitality: 7 };
  const crit = withD20(20, () => resolveAttack({ ...baseStats, courage: 2 }, "courage", enemy));
  assert.equal(crit.critical, true);
  assert.equal(crit.outcome, "strong_hit");
  assert.ok(crit.damage > 0);

  const fumble = withD20(1, () => resolveAttack({ ...baseStats, courage: 8 }, "courage", enemy));
  assert.equal(fumble.fumble, true);
  assert.equal(fumble.outcome, "miss");
});
