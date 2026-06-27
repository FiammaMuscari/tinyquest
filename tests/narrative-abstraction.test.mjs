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

async function importModules() {
  const dir = join(tmpdir(), `tinyquest-narrative-tests-${process.pid}`);
  await mkdir(dir, { recursive: true });
  await transpile("../packages/game-engine/src/campaigns.ts", join(dir, "campaigns.mjs"));
  await transpile("../packages/game-engine/src/game/memory/game-state.reducer.ts", join(dir, "game-state.reducer.mjs"));
  await transpile("../packages/game-engine/src/living-state-adapter.ts", join(dir, "living-state-adapter.mjs"));
  await transpile("../packages/game-engine/src/energy.ts", join(dir, "energy.mjs"));
  await transpile("../packages/game-engine/src/danger.ts", join(dir, "danger.mjs"));
  await transpile("../packages/game-engine/src/ending-resolution.ts", join(dir, "ending-resolution.mjs"), {
    'from "./danger"': 'from "./danger.mjs"'
  });
  return {
    campaigns: await import(`file://${join(dir, "campaigns.mjs")}`),
    reducer: await import(`file://${join(dir, "game-state.reducer.mjs")}`),
    adapter: await import(`file://${join(dir, "living-state-adapter.mjs")}`),
    energy: await import(`file://${join(dir, "energy.mjs")}`),
    endings: await import(`file://${join(dir, "ending-resolution.mjs")}`)
  };
}

const { campaigns: campaignModule, reducer, adapter, energy, endings } = await importModules();
const redMoon = campaignModule.campaigns.find((campaign) => campaign.id === "luna-roja");

function roomLike() {
  return {
    id: "test-room",
    campaign: redMoon,
    players: [{ id: "p1", name: "Fiamy", status: "active", character: { stats: {}, energy: 5 }, temporaryItems: [] }],
    currentSceneIndex: 0,
    roundInScene: 0,
    turn: 0,
    dangerClock: 0
  };
}

test("Luna Roja tiene vertical slice concreto de 4 escenas y acciones no genéricas", () => {
  assert.equal(redMoon.scenes.length, 4);
  assert.equal(redMoon.durationMinutes, 25);
  assert.ok(redMoon.npcs.some((npc) => npc.name === "Inspector Bran"));
  const labels = redMoon.scenes.flatMap((scene) => scene.multipleChoiceOptions.map((option) => option.label));
  assert.ok(labels.includes("Examinar la marca de plata rota de Nicolás"));
  assert.ok(labels.includes("Escuchar a Nicolás antes de que lo aíslen"));
  assert.ok(labels.includes("Presentar la orden falsificada ante el tribunal"));
  assert.equal(labels.some((label) => label.includes("Examinar el objeto clave")), false);
});

test("no se repite clueId ya descubierto", () => {
  const state = adapter.createLivingStateForRoom(roomLike());
  const discovered = reducer.applyStatePatch(state, { ...adapter.emptyStatePatch(), clueUpdates: [{ id: "marca-rota", discovered: true, confirmed: true }] });
  const choice = redMoon.scenes[0].multipleChoiceOptions.find((option) => option.id === "examinar-marca-nicolas");
  const candidateIds = adapter.clueIdsForChoice(redMoon, "cuartel-umbral", choice, "success");
  assert.deepEqual(candidateIds, ["marca-rota"]);
  assert.deepEqual(adapter.filterUndiscoveredClueIds(discovered, candidateIds), []);
});

test("actionId agotable y ruta abierta no vuelven a abrirse igual", () => {
  const state = adapter.createLivingStateForRoom(roomLike());
  const patch = adapter.emptyStatePatch();
  patch.routeUpdates = [{ id: "route-mayor-house", open: true, discovered: true, blocked: false, status: "open", notes: ["ruta abierta"] }];
  patch.actionMemoryUpdates = [{ actionId: "follow-mud-to-mayor", sceneId: "red-forest", uses: 1, exhausted: true, replacementHint: "Ahora usar, vigilar o arriesgar la ruta." }];
  const next = reducer.applyStatePatch(state, patch);
  assert.equal(next.routeStates["route-mayor-house"].status, "open");
  assert.equal(next.actionMemory["follow-mud-to-mayor"].exhausted, true);
});

test("recupera +1 energía por ronda hasta máximo configurable", () => {
  const players = [
    { id: "p1", name: "Fiamy", status: "active", character: { energy: 5 } },
    { id: "p2", name: "Bot", status: "dead", character: { energy: 0 } }
  ];
  const next = energy.regenerateRoundEnergy(players, 6, 1);
  assert.equal(next[0].character.energy, 6);
  assert.equal(next[1].character.energy, 0);
});

test("NPC conserva nombre/presencia y objeto cambia estado después de usarse", () => {
  const state = adapter.createLivingStateForRoom(roomLike());
  assert.equal(redMoon.npcs.find((npc) => npc.id === "nicolas-fierro").name, "Nicolás Fierro");
  assert.equal(state.npcStates["nicolas-fierro"].present, true);
  const patch = adapter.emptyStatePatch();
  patch.itemUpdates = [{ id: "cuaderno-carvell-object", state: "danado", notes: ["cuaderno dañado"], storyMarks: ["sacrificio"] }];
  const next = reducer.applyStatePatch(state, patch);
  assert.equal(next.inventory["cuaderno-carvell-object"].state, "danado");
});

test("finales de Luna Roja se deciden por estado del motor y permiten al menos 3 rutas", () => {
  const base = {
    currentSceneId: "tribunal-sello",
    round: 2,
    availableEndings: redMoon.possibleEndings.map((ending) => ending.id),
    sceneClocks: { "tribunal-sello": { currentTicks: 0, maxTicks: 4 } },
    inventory: {}
  };
  const confirmed = (ids) => Object.fromEntries(ids.map((id) => [id, { id, status: "confirmed" }]));
  const truthful = endings.selectEnding(redMoon, {
    ...base,
    danger: 8,
    discoveredClues: confirmed(["marca-rota", "sello-falsificado", "cuaderno-carvell"]),
    routeStates: {},
    endingScore: { truth: 3, mercy: 2 }
  });
  const tragic = endings.selectEnding(redMoon, { ...base, danger: 9, discoveredClues: {}, routeStates: {}, endingScore: { chaos: 4 } });
  const falseWin = endings.selectEnding(redMoon, { ...base, danger: 5, discoveredClues: {}, routeStates: {}, endingScore: { violence: 2, truth: 0 } });
  assert.equal(truthful.id, "verdad-completa");
  assert.equal(tragic.id, "ejecucion-tragica");
  assert.equal(falseWin.id, "verano-gana");
  assert.equal(new Set([truthful.id, tragic.id, falseWin.id]).size, 3);
});
