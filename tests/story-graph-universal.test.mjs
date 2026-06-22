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

const dir = join(tmpdir(), `tinyquest-storygraph-${process.pid}`);
await mkdir(dir, { recursive: true });
await transpile("../packages/game-engine/src/story-graph.compiler.ts", join(dir, "compiler.mjs"));
await transpile("../packages/game-engine/src/story-graph.runtime.ts", join(dir, "runtime.mjs"));
await transpile("../packages/game-engine/src/story-graph.choices.ts", join(dir, "choices.mjs"), { 'from "./story-graph.runtime"': 'from "./runtime.mjs"' });
const compiler = await import(`file://${join(dir, "compiler.mjs")}`);
const runtimeMod = await import(`file://${join(dir, "runtime.mjs")}`);
const choicesMod = await import(`file://${join(dir, "choices.mjs")}`);

function blueprint(id, genre, locationFunction = "crime_scene") {
  return {
    id,
    title: `Campaign ${id}`,
    genre,
    tone: ["tenso"],
    premise: "Una situación cambia antes de que el grupo pueda controlarla.",
    centralConflict: "Verdad contra presión.",
    dramaticQuestion: "¿Qué precio tiene resolverlo?",
    estimatedMinutes: 25,
    targetSceneCount: 3,
    playerGoal: "Resolver la amenaza principal.",
    failurePressure: "la presión sube",
    cast: [
      { id: "witness", name: genre === "school" ? "Lina, alumna becada" : "Taro, testigo nervioso", role: "testigo", archetype: "ally", wants: "salir vivo", fears: "la autoridad", secretIds: ["s1"], startingLocationId: "start", startingAttitude: "asustado", relationshipHooks: [] },
      { id: "authority", name: genre === "dungeon" ? "Guardiana de Piedra" : "Rectora Vela", role: "autoridad", archetype: "authority", wants: "cerrar el caso", fears: "perder control", secretIds: [], startingLocationId: "start", startingAttitude: "hostil", relationshipHooks: [] }
    ],
    factions: [{ id: "crowd", name: "Grupo presionante", agenda: "apurar una decisión", pressure: "murmullos" }],
    locations: [
      { id: "start", name: genre === "dungeon" ? "Puerta Hundida" : "Salón Principal", mood: "oscuro", function: locationFunction, connectedLocationIds: ["next"], availableObjectIds: ["evidence", "key"], presentCharacterIds: ["witness", "authority"] },
      { id: "next", name: genre === "dungeon" ? "Cámara del Tesoro" : "Archivo Cerrado", mood: "peligroso", function: "hidden_room", connectedLocationIds: ["final"], availableObjectIds: ["relic"], presentCharacterIds: ["authority"] },
      { id: "final", name: "Escena Final", mood: "decisivo", function: "final_stage", connectedLocationIds: [], availableObjectIds: [], presentCharacterIds: ["witness", "authority"] }
    ],
    objects: [
      { id: "evidence", name: genre === "dungeon" ? "Mapa de hueso" : "Carta manchada", kind: "evidence", startingLocationId: "start", relatedClueIds: ["c1"], possibleStates: ["visible", "examinado", "confirmado", "contaminado"], useCases: ["probar contradicción"] },
      { id: "key", name: "Llave torcida", kind: "key", startingLocationId: "start", relatedClueIds: ["c2"], possibleStates: ["visible", "usado"], useCases: ["abrir paso"] },
      { id: "relic", name: "Reliquia fría", kind: "relic", startingLocationId: "next", relatedClueIds: ["c3"], possibleStates: ["oculto", "examinado"], useCases: ["revelar secreto"] }
    ],
    clues: [
      { id: "c1", text: "La prueba contradice la versión pública", sourceType: "object", sourceId: "evidence", supports: ["truth"], contradicts: ["authority"], unlocks: ["next"] },
      { id: "c2", text: "El testigo conoce una ruta", sourceType: "character", sourceId: "witness", supports: ["route"], contradicts: [], unlocks: ["next"] },
      { id: "c3", text: "La reliquia revela una capa secreta", sourceType: "object", sourceId: "relic", supports: ["secret"], contradicts: [], unlocks: ["secret"] }
    ],
    secrets: [{ id: "s1", text: "El testigo vio quién mintió", holderIds: ["witness"], revealedByClueIds: ["c2"] }],
    threats: [{ id: "pressure", name: genre === "dungeon" ? "Derrumbe" : "Multitud", type: genre === "dungeon" ? "environmental" : "social", pressure: "cada demora empeora la situación", escalationSteps: ["el peligro avanza"] }],
    clocks: [{ id: "pressure", name: "Presión", max: 4, startsAt: 0, meaning: "La oposición gana terreno", onMax: "La escena se cierra" }],
    endings: [
      { id: "good", title: "Verdad con coste", kind: "good_costly", conditions: [{ kind: "score", id: "truth", op: "gte", value: 2 }], resultSummary: "Resuelven el conflicto con precio." },
      { id: "tragic", title: "Fracaso", kind: "tragic", conditions: [{ kind: "clock", id: "pressure", op: "gte", value: 4 }], resultSummary: "La presión gana." }
    ]
  };
}

const blueprints = [blueprint("village", "mystery"), blueprint("dungeon", "dungeon", "danger_zone"), blueprint("school", "school", "social_hub")];

test("cada campaña genera nodos y 3 a 5 choices con entidades reales", () => {
  for (const bp of blueprints) {
    const graph = compiler.compileCampaignBlueprint(bp);
    const runtime = runtimeMod.createStoryGraphRuntime(graph);
    const choices = choicesMod.generateChoicesForNode(graph, runtime);
    assert.ok(Object.keys(graph.nodes).length >= 3);
    assert.ok(choices.length >= 3 && choices.length <= 5);
    assert.ok(choices.every((choice) => bp.cast.concat(bp.objects).concat(bp.locations).some((entity) => choice.label.includes(entity.name)) || choice.label.includes("Recuperar")));
  }
});

test("no hay labels abstractos y hay variedad", () => {
  const graph = compiler.compileCampaignBlueprint(blueprints[0]);
  const runtime = runtimeMod.createStoryGraphRuntime(graph);
  const choices = choicesMod.generateChoicesForNode(graph, runtime);
  const forbidden = /aceptar coste social|forzar reacción social|proteger, guardar o presentar|empujar la escena|cambiar el enfoque|no repetir/i;
  for (const choice of choices) assert.doesNotMatch(choice.label + choice.previewHint, forbidden);
  assert.ok(new Set(choices.map((choice) => choice.type)).size >= 3);
});

test("choices usadas mutan, objetos no se descubren dos veces y NPC recuerda", () => {
  const graph = compiler.compileCampaignBlueprint(blueprints[0]);
  let runtime = runtimeMod.createStoryGraphRuntime(graph);
  let choices = choicesMod.generateChoicesForNode(graph, runtime);
  const investigate = choices.find((choice) => choice.templateId === "investigate_object");
  runtime = choicesMod.resolveAvailableChoice(runtime, investigate, "success");
  choices = choicesMod.generateChoicesForNode(graph, runtime);
  assert.equal(choices.some((choice) => choice.choiceId === investigate.choiceId), false);
  assert.ok(choices.some((choice) => choice.choiceId.startsWith(`${investigate.choiceId}:`)));
  assert.notEqual(runtime.clueStates.c1.status, "hidden");

  const question = choicesMod.generateChoicesForNode(graph, runtime).find((choice) => choice.templateId === "question_npc");
  runtime = choicesMod.resolveAvailableChoice(runtime, question, "success");
  assert.ok(runtime.characterStates.witness.revealedClueIds.includes("c2"));
});

test("endings dependen de estado y debug exporta información clara", () => {
  const graph = compiler.compileCampaignBlueprint(blueprints[0]);
  let runtime = runtimeMod.createStoryGraphRuntime(graph);
  runtime = runtimeMod.applyUniversalStatePatch(runtime, { endingScoreDelta: { truth: 2 } });
  assert.deepEqual(runtimeMod.evaluateBlueprintEndings(blueprints[0], runtime), ["good"]);
  const choices = choicesMod.generateChoicesForNode(graph, runtime);
  const debug = runtimeMod.buildStoryDebugState(graph, runtime, choices);
  assert.ok(debug.node.id);
  assert.ok(debug.location);
  assert.ok(debug.choices.length >= 3);
  assert.ok("pressure" in debug.clocks);
});
