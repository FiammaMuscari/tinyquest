import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpile(sourcePath, outPath, replacements = {}) {
  let source = await readFile(new URL(sourcePath, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(outPath, outputText);
}

async function importStateModules() {
  const dir = join(tmpdir(), `tinyquest-state-tests-${process.pid}`);
  await mkdir(dir, { recursive: true });
  await transpile("../packages/game-engine/src/game/memory/game-state.reducer.ts", join(dir, "game-state.reducer.mjs"));
  await transpile("../packages/game-engine/src/living-state-adapter.ts", join(dir, "living-state-adapter.mjs"));
  return {
    reducer: await import(`file://${join(dir, "game-state.reducer.mjs")}`),
    adapter: await import(`file://${join(dir, "living-state-adapter.mjs")}`)
  };
}

const { reducer, adapter } = await importStateModules();
const { applyStatePatch } = reducer;
const { clueIdsForChoice, createLivingStateForRoom, emptyStatePatch, isValidRevealClueId } = adapter;

const campaign = {
  id: "luna-roja",
  clues: [{ id: "fake-claws", text: "Marcas falsas" }, { id: "blood-debt-letter", text: "Carta" }],
  npcs: [{ id: "accused-wolf" }],
  enemies: [],
  scenes: [{ id: "body-by-mill", clueIds: ["fake-claws"], npcIds: ["accused-wolf"] }],
  possibleEndings: [{ id: "secret_deep_truth" }]
};
const roomLike = {
  id: "test-room",
  campaign,
  players: [{ id: "p1", name: "Fiamy", character: { stats: {} }, temporaryItems: [] }],
  currentSceneIndex: 0,
  roundInScene: 0,
  turn: 0,
  dangerClock: 0
};

function baseState() {
  return createLivingStateForRoom(roomLike);
}

test("successful action reveals only valid clue ids", () => {
  const choice = { id: "inspect", unlocksClues: ["fake-claws", "missing-clue"] };
  assert.deepEqual(clueIdsForChoice(campaign, "body-by-mill", choice, "success"), ["fake-claws"]);
  const patch = emptyStatePatch();
  patch.clueUpdates = [{ id: "fake-claws", discovered: true, confirmed: true }];
  const next = applyStatePatch(baseState(), patch);
  assert.equal(next.discoveredClues["fake-claws"].confirmed, true);
});

test("failure raises danger through StatePatch", () => {
  const patch = emptyStatePatch();
  patch.dangerDelta = 2;
  const next = applyStatePatch(baseState(), patch);
  assert.equal(next.danger, 2);
});

test("repeated action is tracked and can be exhausted", () => {
  const patch = emptyStatePatch();
  patch.actionMemoryUpdates = [{ actionId: "inspect", sceneId: "body-by-mill", uses: 1, exhausted: true }];
  const next = applyStatePatch(baseState(), patch);
  assert.equal(next.actionMemory.inspect.uses, 1);
  assert.equal(next.actionMemory.inspect.exhausted, true);
});

test("LLM cannot reveal a nonexistent clue id", () => {
  assert.equal(isValidRevealClueId(campaign, "body-by-mill", "fake-claws"), true);
  assert.equal(isValidRevealClueId(campaign, "body-by-mill", "invented-clue"), false);
  assert.equal(isValidRevealClueId(campaign, "wrong-scene", "fake-claws"), false);
});
