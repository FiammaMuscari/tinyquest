import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "tinyquest-scene-image-"));
const source = await readFile(new URL("../packages/game-engine/src/scene-images.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
await writeFile(join(dir, "scene-images.mjs"), js);
const { sceneImageBeat } = await import(`file://${join(dir, "scene-images.mjs")}`);

function room(overrides = {}) {
  return {
    currentSceneIndex: 0,
    sessionComplete: false,
    dangerClock: 2,
    finalEnding: undefined,
    campaign: { scenes: [{ id: "scene-1" }], enemies: [{ name: "La Deuda" }], threats: [] },
    narrativeMemory: { facts: [] },
    ...overrides
  };
}

test("no regenera por un turno ordinario", () => assert.equal(sceneImageBeat(room()), null));

test("usa el último hecho confirmado de la escena", () => {
  const beat = sceneImageBeat(room({ narrativeMemory: { facts: [
    { sceneId: "scene-1", confirmed: true, type: "clue", text: "La ceniza contiene oro del sello real", tags: ["success"] }
  ] } }));
  assert.match(beat, /ceniza contiene oro del sello real/i);
  assert.match(beat, /Resultado confirmado: success/i);
});

test("representa una crisis mecánica sin inventar hechos", () => {
  const beat = sceneImageBeat(room({ dangerClock: 8 }));
  assert.match(beat, /La Deuda.*peligro crítico/i);
});

test("un evento ordinario no regenera la imagen del turno", () => {
  assert.equal(sceneImageBeat(room({ narrativeMemory: { facts: [
    { sceneId: "scene-1", confirmed: true, type: "event", text: "Fiamy inspecciona la sala", tags: ["success"] }
  ] } })), null);
});

test("la banda de crisis conserva una clave visual estable", () => {
  assert.equal(sceneImageBeat(room({ dangerClock: 7 })), sceneImageBeat(room({ dangerClock: 10 })));
});
