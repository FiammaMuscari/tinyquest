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

const dir = join(tmpdir(), `tinyquest-mechanics-${process.pid}`);
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
await transpile("../packages/game-engine/src/energy.ts", join(dir, "energy.mjs"));

const { campaigns } = await import(`file://${join(dir, "campaigns.mjs")}`);
const { createScenesForCampaign, toSceneActionChoice } = await import(`file://${join(dir, "scenes.mjs")}`);
const { getVisibleActionChoices } = await import(`file://${join(dir, "room-state.mjs")}`);
const { buildEndingPlan } = await import(`file://${join(dir, "ending-resolution.mjs")}`);
const { regenerateRoundEnergy } = await import(`file://${join(dir, "energy.mjs")}`);

const lunaRoja = campaigns.find((item) => item.id === "luna-roja");
const scenes = createScenesForCampaign(lunaRoja);
const clueText = (clueId) => lunaRoja.clues.find((clue) => clue.id === clueId).text;

function makeRoom(overrides = {}) {
  return {
    id: "room",
    campaign: lunaRoja,
    sessionConfig: { selectedCampaign: lunaRoja },
    players: [{ id: "p1", name: "Fiamy", type: "human", character: { stats: {}, energy: 4 }, temporaryItems: [] }],
    activePlayerIndex: 0,
    currentSceneIndex: 0,
    roundInScene: 0,
    turn: 0,
    dangerClock: 2,
    phase: "investigation",
    mysteryClues: [],
    memorySummary: { clues: [], currentTwist: "" },
    storyFlags: [],
    livingState: { npcStates: {}, secondaryNPCStates: {}, actionMemory: {} },
    ...overrides
  };
}

// ── Energía ──────────────────────────────────────────────────────────────
test("regen de energía respeta la cantidad configurada y el máximo", () => {
  const players = [{ id: "p1", name: "A", character: { energy: 3 }, temporaryItems: [] }];
  assert.equal(regenerateRoundEnergy(players, 6, 1)[0].character.energy, 4);
  assert.equal(regenerateRoundEnergy(players, 6, 2)[0].character.energy, 5);
  assert.equal(regenerateRoundEnergy(players, 4, 2)[0].character.energy, 4, "no supera el máximo");
});

test("la opción de descanso permite ahorrar: costo 0, restaura 2 al éxito, permanente", () => {
  // Sin opciones ni follow-ups disponibles → aparecen los fallbacks, incluido descansar.
  const base = scenes.find((item) => item.id === "cuartel-umbral");
  const scene = { ...base, actionChoices: [] };
  const followUpIds = ["use-known-clue", "pressure-present-npc", "secure-before-moving", "force-scene-turn"].map((suffix) => `${scene.id}-${suffix}`);
  const exhaustedAll = Object.fromEntries(followUpIds.map((id) => [id, { actionId: id, sceneId: scene.id, uses: 1, exhausted: true }]));
  const room = makeRoom({ livingState: { npcStates: {}, secondaryNPCStates: {}, actionMemory: exhaustedAll } });
  const rest = getVisibleActionChoices(scene, room).find((choice) => choice.id.endsWith("-rest"));
  assert.ok(rest, "existe la opción de descansar");
  assert.equal(rest.energyCost, 0);
  assert.equal(rest.energyRestoreOnSuccess, 2);
  assert.equal(rest.permanent, true);
});

test("toSceneActionChoice copia los campos nuevos de economía y ciclo de vida", () => {
  const converted = toSceneActionChoice({
    id: "x", label: "X", description: "d", category: "talk", recommendedStat: "mind", riskLevel: "low",
    possibleOutcomeHint: "", energyRestoreOnSuccess: 1, expiresAfterRound: 2, permanent: true, requiredTrust: 2
  });
  assert.equal(converted.energyRestoreOnSuccess, 1);
  assert.equal(converted.expiresAfterRound, 2);
  assert.equal(converted.permanent, true);
  assert.equal(converted.requiredTrust, 2);
});

// ── Expiración y permanencia ─────────────────────────────────────────────
test("opciones con expiresAfterRound desaparecen cuando pasa la ronda", () => {
  const scene = scenes.find((item) => item.id === "cuartel-umbral");
  const early = getVisibleActionChoices(scene, makeRoom({ roundInScene: 0 })).map((choice) => choice.id);
  assert.ok(early.includes("hablar-nicolas"), "disponible al inicio");
  assert.ok(early.includes("inspeccionar-herida-carvell"), "disponible al inicio");
  const late = getVisibleActionChoices(scene, makeRoom({ roundInScene: 3 })).map((choice) => choice.id);
  assert.ok(!late.includes("hablar-nicolas"), "a Nicolás lo aislaron: expiró");
  assert.ok(!late.includes("inspeccionar-herida-carvell"), "el cuerpo fue sellado: expiró");
});

test("una opción usada 2 veces se auto-retira; las permanentes no", () => {
  const scene = scenes.find((item) => item.id === "muros-bajos");
  const room = makeRoom({
    currentSceneIndex: 1,
    livingState: {
      npcStates: {}, secondaryNPCStates: {},
      actionMemory: {
        "rastrear-huella-cora": { actionId: "rastrear-huella-cora", sceneId: scene.id, uses: 2, exhausted: false },
        "frenar-agentes-bran": { actionId: "frenar-agentes-bran", sceneId: scene.id, uses: 5, exhausted: false }
      }
    }
  });
  const ids = getVisibleActionChoices(scene, room).map((choice) => choice.id);
  assert.ok(!ids.includes("rastrear-huella-cora"), "2 usos sin permanent → se retira");
  assert.ok(ids.includes("frenar-agentes-bran"), "permanent sobrevive a los usos");
});

// ── Opciones desbloqueadas por pistas ────────────────────────────────────
test("una pista conocida desbloquea opciones nuevas del pool (unlocksActions)", () => {
  const scene = scenes.find((item) => item.id === "muros-bajos");
  const without = getVisibleActionChoices(scene, makeRoom({ currentSceneIndex: 1 })).map((choice) => choice.id);
  assert.ok(!without.includes("identificar-cora"), "sin la pista, la opción no existe");
  const withClue = getVisibleActionChoices(scene, makeRoom({ currentSceneIndex: 1, mysteryClues: [clueText("bota-cora")] })).map((choice) => choice.id);
  assert.ok(withClue.includes("identificar-cora"), "conocer la huella desbloquea la búsqueda en el registro");
});

// ── Confianza ────────────────────────────────────────────────────────────
test("requiredTrust oculta opciones hasta ganar la confianza del NPC", () => {
  const scene = scenes.find((item) => item.id === "cuartel-umbral");
  const gated = { ...scene, actionChoices: [{ id: "pedir-favor-lena", label: "Pedirle a Lena su copia del acta", action: "x", recommendedStats: ["charm"], skillTag: "talk", category: "talk", npcId: "lena-subofficer", requiredTrust: 2 }, ...scene.actionChoices.slice(0, 3)] };
  const lowTrust = makeRoom({ livingState: { npcStates: { "lena-subofficer": { id: "lena-subofficer", trust: 1, alive: true, present: true } }, secondaryNPCStates: {}, actionMemory: {} } });
  assert.ok(!getVisibleActionChoices(gated, lowTrust).some((choice) => choice.id === "pedir-favor-lena"));
  const highTrust = makeRoom({ livingState: { npcStates: { "lena-subofficer": { id: "lena-subofficer", trust: 2, alive: true, present: true } }, secondaryNPCStates: {}, actionMemory: {} } });
  assert.ok(getVisibleActionChoices(gated, highTrust).some((choice) => choice.id === "pedir-favor-lena"));
});

// ── Mutaciones ancladas a entidades reales ───────────────────────────────
test("acciones agotadas mutan con nombres reales, nunca cosiendo el label completo", () => {
  const scene = scenes.find((item) => item.id === "cuartel-umbral");
  const room = makeRoom({
    livingState: {
      npcStates: {}, secondaryNPCStates: {},
      actionMemory: {
        "hablar-lena": { actionId: "hablar-lena", sceneId: scene.id, uses: 1, exhausted: true },
        "distraer-guardia-bran": { actionId: "distraer-guardia-bran", sceneId: scene.id, uses: 1, exhausted: true }
      }
    }
  });
  const choices = getVisibleActionChoices(scene, room);
  const badStitch = /Aceptar un coste por |Buscar otra salida con |Empujar la escena con /;
  for (const choice of choices) assert.doesNotMatch(choice.label, badStitch, choice.label);
  const lenaMutation = choices.find((choice) => choice.id.startsWith("hablar-lena-"));
  assert.ok(lenaMutation, "la negociación agotada muta");
  assert.match(lenaMutation.label, /Lena/, "la mutación usa el nombre real del NPC");
  const guardMutation = choices.find((choice) => choice.id.startsWith("distraer-guardia-bran-"));
  assert.ok(guardMutation, "la mentira agotada muta");
  assert.match(guardMutation.label, /Agentes de Bran/, "la mutación usa el nombre real del enemigo");
});

// ── Finales secuenciales dinámicos ───────────────────────────────────────
test("buildEndingPlan compone cláusulas secuenciales desde el estado real", () => {
  const room = makeRoom({
    mysteryClues: [clueText("marca-rota"), clueText("sello-falsificado")],
    livingState: {
      npcStates: {
        "issa-mano": { id: "issa-mano", alive: false, trust: 0, hostility: 0 },
        "lena-subofficer": { id: "lena-subofficer", alive: true, trust: 3, hostility: 0 },
        "inspector-bran": { id: "inspector-bran", alive: true, trust: 0, hostility: 3 }
      },
      secondaryNPCStates: {},
      actionMemory: {},
      endingScore: { truth: 3, mercy: 1 }
    }
  });
  const ending = lunaRoja.possibleEndings.find((item) => item.id === "verdad-completa");
  const plan = buildEndingPlan(room, ending, "good", ["El coste de la noche queda en la ciudad."], "Una capa más queda abierta.");
  assert.equal(plan.tier, 1, "good es el mejor tier");
  assert.equal(plan.endingId, "verdad-completa");
  const text = plan.clauses.join(" | ");
  assert.match(text, /El sello no miente por siempre/, "usa el título real del final");
  assert.match(text, /Lo que quedó probado/, "lista las pruebas reales");
  assert.match(text, /Marca de plata rota/, "menciona la pista por su label");
  assert.match(text, /Issa no vio el final/, "el destino de Issa depende de su estado");
  assert.match(text, /Nicolás Fierro no olvida|Inspector Bran no olvida/, "la hostilidad deja huella");
  assert.match(text, /eligió la verdad/, "el tono sale del endingScore dominante");
  assert.ok(plan.clauses.length >= 5, "epílogo secuencial de varias partes");
  // Nada de narrativa hardcodeada de campañas viejas:
  assert.doesNotMatch(text, /aldea|la plaza|campana/);
});

test("buildEndingPlan mapea tiers de mejor a peor", () => {
  const ending = lunaRoja.possibleEndings[0];
  const room = makeRoom({});
  assert.equal(buildEndingPlan(room, ending, "good", [], null).tier, 1);
  assert.equal(buildEndingPlan(room, ending, "heroic", [], null).tier, 2);
  assert.equal(buildEndingPlan(room, ending, "bittersweet", [], null).tier, 3);
  assert.equal(buildEndingPlan(room, ending, "corrupt", [], null).tier, 4);
  assert.equal(buildEndingPlan(room, ending, "tragic", [], null).tier, 5);
});
