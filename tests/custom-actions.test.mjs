import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

test("las acciones custom conservan el texto y cuestan más energía", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tinyquest-custom-"));
  const source = await readFile(new URL("../packages/game-engine/src/custom-actions.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  await writeFile(join(dir, "custom-actions.mjs"), js);
  const custom = await import(`file://${join(dir, "custom-actions.mjs")}`);

  const encoded = custom.encodeCustomAction("  Convencer al guardia con una canción  ");
  assert.equal(custom.decodeCustomAction(encoded), "Convencer al guardia con una canción");
  assert.equal(custom.decodeCustomAction("acción normal"), undefined);
  const choice = custom.createCustomActionChoice(custom.decodeCustomAction(encoded), "charm");
  assert.equal(choice.energyCost, custom.CUSTOM_ACTION_ENERGY_COST);
  assert.equal(choice.recommendedStats[0], "charm");
  assert.equal(choice.label, "Convencer al guardia con una canción");
});
