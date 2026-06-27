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

const dir = join(tmpdir(), `tinyquest-options-${process.pid}`);
await mkdir(dir, { recursive: true });
await transpile("../packages/game-engine/src/campaigns.ts", join(dir, "campaigns.mjs"));
await transpile("../packages/game-engine/src/scenes.ts", join(dir, "scenes.mjs"), {
  'from "./campaigns"': 'from "./campaigns.mjs"'
});
await transpile("../packages/game-engine/src/danger.ts", join(dir, "danger.mjs"));
await transpile("../packages/game-engine/src/ending-resolution.ts", join(dir, "ending-resolution.mjs"), {
  'from "./danger"': 'from "./danger.mjs"'
});
await transpile("../packages/game-engine/src/room-state.ts", join(dir, "room-state.mjs"), {
  'from "./ending-resolution"': 'from "./ending-resolution.mjs"',
  'from "./scenes"': 'from "./scenes.mjs"'
});
await transpile("../packages/game-engine/src/living-state-adapter.ts", join(dir, "living-state-adapter.mjs"));

const { campaigns } = await import(`file://${join(dir, "campaigns.mjs")}`);
const { createLivingStateForRoom } = await import(`file://${join(dir, "living-state-adapter.mjs")}`);
const { createScenesForCampaign } = await import(`file://${join(dir, "scenes.mjs")}`);
const { getVisibleActionChoices } = await import(`file://${join(dir, "room-state.mjs")}`);

const campaign = campaigns.find((item) => item.id === "luna-roja");
const scene = createScenesForCampaign(campaign).find((item) => item.id === "cuartel-umbral");
const roomBase = {
  id: "room",
  campaign,
  sessionConfig: { selectedCampaign: campaign },
  players: [{ id: "p1", name: "Fiamy", character: { stats: {}, energy: 4 }, temporaryItems: [] }],
  activePlayerIndex: 0,
  currentSceneIndex: 0,
  roundInScene: 0,
  turn: 0,
  dangerClock: 0,
  mysteryClues: [],
  memorySummary: { clues: [], currentTwist: "" },
  storyFlags: []
};
roomBase.livingState = createLivingStateForRoom(roomBase);

test("cada turno no final devuelve al menos 3 opciones", () => {
  const choices = getVisibleActionChoices(scene, roomBase);
  assert.ok(choices.length >= 3);
});

test("acciones agotadas mutan y no reaparecen igual", () => {
  const room = { ...roomBase, livingState: { ...roomBase.livingState, actionMemory: { "examinar-marca-nicolas": { actionId: "examinar-marca-nicolas", sceneId: scene.id, uses: 1, exhausted: true } } } };
  const choices = getVisibleActionChoices(scene, room);
  assert.equal(choices.some((choice) => choice.id === "examinar-marca-nicolas"), false);
  assert.ok(choices.some((choice) => choice.id.startsWith("examinar-marca-nicolas-")));
  assert.ok(choices.length >= 3);
});

test("opciones visibles no contienen texto interno/debug", () => {
  const room = { ...roomBase, livingState: { ...roomBase.livingState, actionMemory: Object.fromEntries(scene.actionChoices.map((choice) => [choice.id, { actionId: choice.id, sceneId: scene.id, uses: 1, exhausted: true }])) } };
  const choices = getVisibleActionChoices(scene, room);
  const forbidden = /aceptar coste social|forzar reacción social|proteger, guardar o presentar|no repetir|empujar la escena/i;
  for (const choice of choices) {
    assert.doesNotMatch(choice.label, forbidden);
    assert.doesNotMatch(choice.action, forbidden);
  }
});

test("variedad mínima de actionTypes", () => {
  const choices = getVisibleActionChoices(scene, roomBase);
  const types = new Set(choices.map((choice) => choice.actionType ?? choice.category));
  assert.ok(types.size >= 3);
});
