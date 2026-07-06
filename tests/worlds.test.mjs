import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpile(src, out, replacements = {}) {
  let source = await readFile(new URL(src, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(out, outputText);
}

const dir = join(tmpdir(), `tinyquest-worlds-${process.pid}`);
await mkdir(dir, { recursive: true });
await transpile("../packages/game-engine/src/worlds.ts", join(dir, "worlds.mjs"));
await transpile("../packages/game-engine/src/campaigns.ts", join(dir, "campaigns.mjs"));

const { worldEras, worldById, perspectiveEntryLine, defaultWorldId } = await import(`file://${join(dir, "worlds.mjs")}`);
const { campaigns } = await import(`file://${join(dir, "campaigns.mjs")}`);

test("cada mundo sellado está completo: reglas, tagline, entradas y sazón de forja", () => {
  assert.ok(worldEras.length >= 3);
  for (const world of worldEras) {
    assert.ok(world.id && world.name && world.era, `${world.id}: identidad incompleta`);
    assert.ok(world.tagline.length >= 20, `${world.id}: tagline muy corto`);
    assert.ok(world.ambience.length >= 40, `${world.id}: ambiente sin sellar`);
    assert.ok(world.worldRules.length >= 3, `${world.id}: menos de 3 reglas inmutables`);
    assert.ok(world.forgeSeasoning.length >= 30, `${world.id}: sin sazón para la forja`);
    assert.ok(world.entry.exterior.length >= 30 && world.entry.interior.length >= 30, `${world.id}: entradas de perspectiva incompletas`);
    // El tagline no puede filtrar las reglas (revelación progresiva).
    for (const rule of world.worldRules) {
      assert.notEqual(world.tagline, rule, `${world.id}: el tagline repite una regla`);
    }
  }
});

test("la historia madre de cada mundo autorado existe en el registro de campañas", () => {
  for (const world of worldEras) {
    if (!world.authoredCampaignId) continue;
    assert.ok(campaigns.some((campaign) => campaign.id === world.authoredCampaignId), `${world.id} apunta a campaña inexistente: ${world.authoredCampaignId}`);
  }
});

test("worldById y perspectiveEntryLine tienen defaults seguros", () => {
  assert.equal(worldById("no-existe").id, defaultWorldId);
  assert.equal(worldById(null).id, defaultWorldId);
  const world = worldById(defaultWorldId);
  assert.equal(perspectiveEntryLine(world, "exterior"), world.entry.exterior);
  assert.equal(perspectiveEntryLine(world, "interior"), world.entry.interior);
});
