import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpileModuleToTemp(sourcePath, outPath, replacements = {}) {
  let source = await readFile(new URL(sourcePath, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  });
  await writeFile(outPath, outputText);
}

async function importEndingModule() {
  const dir = join(tmpdir(), `tinyquest-ending-tests-${process.pid}`);
  await mkdir(dir, { recursive: true });
  await transpileModuleToTemp("../packages/game-engine/src/danger.ts", join(dir, "danger.mjs"));
  await transpileModuleToTemp("../packages/game-engine/src/ending-resolution.ts", join(dir, "ending-resolution.mjs"), {
    'from "./danger"': 'from "./danger.mjs"'
  });
  return import(`file://${join(dir, "ending-resolution.mjs")}`);
}

const { selectEnding, shouldResolveEnding } = await importEndingModule();

const campaign = {
  maxRounds: 4,
  walkthrough: { finalSceneId: "juicio-luna-roja" },
  scenes: [
    { id: "bosque-rojo", title: "El Bosque Rojo" },
    { id: "juicio-luna-roja", title: "El Juicio Bajo la Luna", isFinal: true }
  ],
  rewards: [],
  possibleEndings: [
    { id: "good_truth_mercy", type: "good", title: "Bueno", description: "Bueno" },
    { id: "heroic_cost", type: "heroic", title: "Heroico", description: "Heroico" },
    { id: "bittersweet_escape", type: "bittersweet", title: "Agridulce", description: "Agridulce" },
    { id: "tragic_collapse", type: "tragic", title: "Trágico", description: "Trágico" },
    { id: "corrupt_victory", type: "corrupt", title: "Corrupto", description: "Corrupto" },
    { id: "false_resolution", type: "false", title: "Falso", description: "Falso" },
    { id: "secret_deep_truth", type: "secret", title: "Secreto", description: "Secreto" }
  ]
};

function confirmedClues(count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`clue-${index + 1}`, { id: `clue-${index + 1}`, status: "confirmed" }]));
}

test("final scene with danger 8, 3 clues and secret route resolves secret ending", () => {
  const state = {
    currentSceneId: "juicio-luna-roja",
    round: 2,
    danger: 8,
    discoveredClues: confirmedClues(3),
    routeStates: { secret_deep_truth: { id: "secret_deep_truth", status: "open" } },
    availableEndings: ["secret_deep_truth"],
    endingScore: { truth: 3 },
    sceneClocks: { "juicio-luna-roja": { currentTicks: 1, maxTicks: 4 } },
    inventory: {}
  };
  assert.equal(shouldResolveEnding({ campaign, state, lastAction: { statePatch: {} } }), true);
  assert.equal(selectEnding(campaign, state).id, "secret_deep_truth");
});

test("final scene round max resolves ending", () => {
  const state = {
    currentSceneId: "juicio-luna-roja",
    round: 4,
    danger: 5,
    discoveredClues: {},
    routeStates: {},
    availableEndings: [],
    sceneClocks: { "juicio-luna-roja": { currentTicks: 0, maxTicks: 4 } },
    inventory: {}
  };
  assert.equal(shouldResolveEnding({ campaign, state, lastAction: { statePatch: {} } }), true);
});

test("non-final scene danger 10 does not resolve ending", async () => {
  const state = {
    currentSceneId: "bosque-rojo",
    round: 2,
    danger: 10,
    discoveredClues: confirmedClues(3),
    routeStates: { secret_deep_truth: { id: "secret_deep_truth", status: "open" } },
    availableEndings: ["secret_deep_truth"],
    sceneClocks: { "bosque-rojo": { currentTicks: 0, maxTicks: 4 } },
    inventory: {}
  };
  assert.equal(shouldResolveEnding({ campaign, state, lastAction: { statePatch: {} } }), false);
});

test("final scene danger 9 resolves ending", () => {
  const state = {
    currentSceneId: "juicio-luna-roja",
    round: 2,
    danger: 9,
    discoveredClues: {},
    routeStates: {},
    availableEndings: [],
    sceneClocks: { "juicio-luna-roja": { currentTicks: 0, maxTicks: 4 } },
    inventory: {}
  };
  assert.equal(shouldResolveEnding({ campaign, state, lastAction: { statePatch: {} } }), true);
});


test("final scene with 3 confirmed clues resolves even without open route", () => {
  const state = {
    currentSceneId: "juicio-luna-roja",
    round: 2,
    danger: 8,
    discoveredClues: confirmedClues(3),
    routeStates: {},
    availableEndings: [],
    endingScore: { truth: 3 },
    sceneClocks: { "juicio-luna-roja": { currentTicks: 1, maxTicks: 4 } },
    inventory: {}
  };
  assert.equal(shouldResolveEnding({ campaign, state, lastAction: { statePatch: {} } }), true);
});

test("final scene with open final route resolves even before clue threshold", () => {
  const state = {
    currentSceneId: "juicio-luna-roja",
    round: 2,
    danger: 7,
    discoveredClues: confirmedClues(1),
    routeStates: { ruta_final: { id: "ruta_final", status: "open" } },
    availableEndings: [],
    endingScore: { truth: 1 },
    sceneClocks: { "juicio-luna-roja": { currentTicks: 1, maxTicks: 4 } },
    inventory: {}
  };
  assert.equal(shouldResolveEnding({ campaign, state, lastAction: { statePatch: {} } }), true);
});

test("escena final SIN progreso real (solo hay finales posibles) NO termina en el 1er turno", () => {
  const state = {
    currentSceneId: "juicio-luna-roja",
    round: 1,
    danger: 3,
    discoveredClues: {},
    routeStates: {},
    availableEndings: ["good_truth_mercy", "secret_deep_truth"],
    endingScore: {},
    sceneClocks: { "juicio-luna-roja": { currentTicks: 0, maxTicks: 4 } },
    inventory: {}
  };
  assert.equal(shouldResolveEnding({ campaign, state, lastAction: { statePatch: {} } }), false);
});
