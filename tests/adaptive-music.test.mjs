import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "tinyquest-music-"));
const source = await readFile(new URL("../apps/web/src/adaptive-music.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
await writeFile(join(dir, "adaptive-music.mjs"), js);
const music = await import(`file://${join(dir, "adaptive-music.mjs")}`);

const state = (overrides = {}) => music.deriveMusicState({ danger: 3, sceneText: "camino", ...overrides });
test("prioriza tristeza y persecución según lo ocurrido", () => {
  assert.equal(state({ narrativeText: "La familia llora una pérdida" }), "sadness");
  assert.equal(state({ danger: 8, narrativeText: "deben huir" }), "chase");
});
test("reconoce misterio, calma, día y noche", () => {
  assert.equal(state({ sceneText: "investigar el portal secreto" }), "mystery");
  assert.equal(state({ danger: 1, outcome: "success", sceneText: "refugio seguro" }), "calm");
  assert.equal(state({ sceneText: "amanecer bajo el sol alto" }), "day");
  assert.equal(state({ sceneText: "noche de luna roja" }), "night");
});
