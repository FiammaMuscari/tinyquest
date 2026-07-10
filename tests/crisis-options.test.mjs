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

const dir = join(tmpdir(), `tinyquest-crisis-options-${process.pid}`);
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
  'from "./scenes"': 'from "./scenes.mjs"',
  'from "./campaigns"': 'from "./campaigns.mjs"'
});

const { campaigns } = await import(`file://${join(dir, "campaigns.mjs")}`);
const { createScenesForCampaign } = await import(`file://${join(dir, "scenes.mjs")}`);
const { getVisibleActionChoices, getCrisisActionChoices } = await import(`file://${join(dir, "room-state.mjs")}`);

// Labels genéricos prohibidos (incluye los viejos textos hardcodeados del motor).
const genericLabels = /bajo la campana|investigar más|resolver el conflicto|tomar una decisión concreta|salvar a alguien y aceptar una pérdida|revelar la verdad aunque alguien pague|acusar al responsable frente a todos/i;

function makeRoom(campaign, overrides = {}) {
  return {
    id: "room",
    campaign,
    sessionConfig: { selectedCampaign: campaign },
    players: [{ id: "p1", name: "Fiamy", type: "human", character: { stats: {}, energy: 4 }, temporaryItems: [] }],
    activePlayerIndex: 0,
    currentSceneIndex: 0,
    roundInScene: 0,
    turn: 0,
    dangerClock: 10,
    phase: "climax",
    mysteryClues: [],
    memorySummary: { clues: [], currentTwist: "" },
    storyFlags: [],
    livingState: { npcStates: {}, secondaryNPCStates: {}, actionMemory: {} },
    ...overrides
  };
}

// luna-roja es la campaña rica (vertical slice de red-moon-killer renombrada en runtime).
const lunaRoja = campaigns.find((item) => item.id === "luna-roja");
assert.ok(lunaRoja, "campaña luna-roja existe");

const clueText = (campaign, clueId) => campaign.clues.find((clue) => clue.id === clueId).text;

// Campaña sintética: prueba que el motor no depende de nombres de campañas reales.
function syntheticCampaign(overrides = {}) {
  return {
    id: "test-campaign",
    title: "Campaña de Prueba",
    npcs: [{ id: "zara", name: "Zara la Vigía", description: "NPC de prueba.", motive: "probar" }],
    enemies: [{ id: "test-golem", name: "Gólem de Prueba", description: "enemigo de prueba", vitality: 5, attackBonus: 1, defense: 10, dangerLevel: 1, weaknessStats: ["mind"], specialMove: "ninguno" }],
    clues: [{ id: "test-clue", label: "la carta quemada", text: "La carta quemada apunta al sótano." }],
    scenes: [{ id: "test-scene", title: "La Bodega", location: "la bodega del faro", objective: "Salir con la carta.", allowedStats: ["mind", "courage", "body"], difficulty: 12, clueIds: ["test-clue"], npcIds: ["zara"], enemyIds: ["test-golem"], imagePrompt: "", ambientSoundPrompt: "", multipleChoiceOptions: [] }],
    possibleEndings: [],
    rewards: [],
    legendaryPets: [],
    ...overrides
  };
}

const syntheticScene = {
  id: "test-scene",
  title: "La Bodega",
  objective: "Salir con la carta.",
  difficulty: 12,
  allowedStats: ["mind", "courage", "body"],
  mysteryClue: "",
  danger: "",
  maxRounds: 4,
  actionChoices: [],
  atmosphere: {},
  npcIds: ["zara"],
  enemyIds: ["test-golem"]
};

test("en crisis, las opciones vienen de scene.crisisOptions cuando existen", () => {
  const scene = createScenesForCampaign(lunaRoja).find((item) => item.id === "cuartel-umbral");
  const room = makeRoom(lunaRoja, {
    mysteryClues: [clueText(lunaRoja, "sello-falsificado")],
    storyFlags: ["lena_aliada"]
  });
  const choices = getVisibleActionChoices(scene, room);
  const ids = choices.map((choice) => choice.id);
  assert.ok(ids.includes("crisis-sacar-nicolas-cuartel"), "opción de datos presente");
  assert.ok(ids.includes("crisis-confrontar-bran-sello"), "opción con requiredClues cumplida presente");
  assert.ok(ids.includes("crisis-lena-frena-traslado"), "opción con requiredFlags cumplida presente");
  assert.ok(ids.includes("crisis-bloquear-escalera"), "opción sin requisitos presente");
  assert.ok(choices.length >= 3 && choices.length <= 5);
});

test("cascada: escena sin crisisOptions usa las de la campaña", () => {
  const campaign = syntheticCampaign({
    crisisOptions: [
      { id: "camp-crisis-a", label: "Quemar la carta ante Zara la Vigía", actionType: "revelar_prueba", riskLevel: "high", recommendedStats: ["courage"], requiredClues: ["test-clue"] },
      { id: "camp-crisis-b", label: "Cubrir a Zara la Vigía en la escalera", actionType: "proteger_aliado", targetId: "zara", targetKind: "npc", riskLevel: "high", recommendedStats: ["body"], requiredNpcs: ["zara"] },
      { id: "camp-crisis-c", label: "Frenar al Gólem de Prueba en la puerta", actionType: "combatir", targetId: "test-golem", targetKind: "creature", riskLevel: "high", recommendedStats: ["courage"] }
    ]
  });
  const room = makeRoom(campaign, { mysteryClues: ["La carta quemada apunta al sótano."] });
  const ids = getCrisisActionChoices(syntheticScene, room).map((choice) => choice.id);
  assert.deepEqual(ids.slice(0, 3), ["camp-crisis-a", "camp-crisis-b", "camp-crisis-c"]);
});

test("requiredClues filtra opciones cuando la pista no es conocida", () => {
  const scene = createScenesForCampaign(lunaRoja).find((item) => item.id === "tribunal-sello");
  const room = makeRoom(lunaRoja); // sin pistas conocidas
  const ids = getVisibleActionChoices(scene, room).map((choice) => choice.id);
  assert.ok(!ids.includes("crisis-confrontar-bran-tribunal"), "requiere registro-bran-archivo");
  assert.ok(!ids.includes("crisis-cuaderno-mesa"), "requiere cuaderno-carvell");
  assert.ok(ids.includes("crisis-cerrar-puerta-cora"), "sin requisitos sigue visible");
});

test("requiredNpcs filtra opciones cuando el NPC murió o no está presente", () => {
  const campaign = syntheticCampaign({
    crisisOptions: [
      { id: "camp-crisis-b", label: "Cubrir a Zara la Vigía en la escalera", actionType: "proteger_aliado", targetId: "zara", targetKind: "npc", riskLevel: "high", recommendedStats: ["body"], requiredNpcs: ["zara"] },
      { id: "camp-crisis-c", label: "Frenar al Gólem de Prueba en la puerta", actionType: "combatir", targetId: "test-golem", targetKind: "creature", riskLevel: "high", recommendedStats: ["courage"] }
    ]
  });
  const room = makeRoom(campaign, {
    livingState: {
      npcStates: { zara: { id: "zara", attitude: "neutral", present: true, alive: false, trust: 0, fear: 0, hostility: 0, knownSecrets: [], notes: [] } },
      secondaryNPCStates: {},
      actionMemory: {}
    }
  });
  const ids = getCrisisActionChoices(syntheticScene, room).map((choice) => choice.id);
  assert.ok(!ids.includes("camp-crisis-b"), "no se protege a una NPC muerta");
  assert.ok(ids.includes("camp-crisis-c"), "las que no dependen del NPC siguen");
});

test("requiredFlags filtra opciones sin el flag activo", () => {
  const scene = createScenesForCampaign(lunaRoja).find((item) => item.id === "cuartel-umbral");
  const room = makeRoom(lunaRoja); // sin flags
  const ids = getVisibleActionChoices(scene, room).map((choice) => choice.id);
  assert.ok(!ids.includes("crisis-lena-frena-traslado"), "requiere lena_aliada");
});

test("ninguna opción de crisis usa labels genéricos (todas las campañas, estado vacío)", () => {
  for (const campaign of campaigns) {
    for (const scene of createScenesForCampaign(campaign)) {
      const choices = getVisibleActionChoices(scene, makeRoom(campaign));
      assert.ok(choices.length >= 3, `${campaign.id}/${scene.id} da al menos 3 opciones en crisis`);
      for (const choice of choices) {
        assert.doesNotMatch(choice.label, genericLabels, `${campaign.id}/${scene.id}: "${choice.label}"`);
        assert.doesNotMatch(choice.action, genericLabels);
      }
    }
  }
});

test("fallback derivado usa nombres reales del estado, no texto fijo (campaña sintética)", () => {
  const room = makeRoom(syntheticCampaign(), { mysteryClues: ["La carta quemada apunta al sótano."] });
  const choices = getCrisisActionChoices(syntheticScene, room);
  assert.ok(choices.length >= 3);
  const labels = choices.map((choice) => choice.label).join(" | ");
  assert.match(labels, /Zara la Vigía/, "usa el nombre real del NPC");
  assert.match(labels, /la carta quemada/, "usa el label real de la pista");
  assert.match(labels, /Gólem de Prueba/, "usa el nombre real del enemigo");
  for (const choice of choices) assert.doesNotMatch(choice.label, genericLabels);
});

test("las opciones de crisis mantienen mecánica jugable (energía, riesgo, stats permitidos)", () => {
  const scene = createScenesForCampaign(lunaRoja).find((item) => item.id === "tribunal-sello");
  const room = makeRoom(lunaRoja, {
    mysteryClues: [clueText(lunaRoja, "registro-bran-archivo"), clueText(lunaRoja, "cuaderno-carvell")],
    storyFlags: ["issa_habló"]
  });
  const choices = getVisibleActionChoices(scene, room);
  assert.ok(choices.length >= 3 && choices.length <= 5);
  for (const choice of choices) {
    assert.ok(typeof choice.energyCost === "number", "tiene costo de energía");
    assert.ok(["low", "medium", "high"].includes(choice.riskLevel), "tiene nivel de riesgo");
    assert.ok(choice.recommendedStats.length > 0, "tiene stats recomendados");
    assert.equal(choice.skillTag, "crisis");
  }
});
