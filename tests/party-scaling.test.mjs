// Escalado de sesión para party con amigos (party-scale.ts):
// solo se alarga con invitados, ≥20 rondas totales, tope 4 invitados.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importPartyScale() {
  const source = await readFile(new URL("../packages/game-engine/src/party-scale.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { scalePartySession, MAX_PARTY_GUESTS, MIN_PARTY_TOTAL_ROUNDS } = await importPartyScale();

const baseConfig = {
  id: "session-x", title: "X", maxMinutes: 15, maxScenes: 5,
  maxRoundsPerScene: 7, initialSceneId: "s1"
};

test("sin invitados la sesión no cambia (solo = corta como siempre)", () => {
  const out = scalePartySession(baseConfig, 0);
  assert.deepEqual(out, baseConfig);
});

test("con amigos la capacidad total es de 20 rondas como mínimo", () => {
  for (let guests = 1; guests <= MAX_PARTY_GUESTS; guests++) {
    const out = scalePartySession(baseConfig, guests);
    const total = out.maxScenes * out.maxRoundsPerScene;
    assert.ok(total >= MIN_PARTY_TOTAL_ROUNDS, `con ${guests} invitados: ${total} rondas`);
    assert.ok(out.maxRoundsPerScene > baseConfig.maxRoundsPerScene, "las escenas se alargan");
    assert.ok(out.maxMinutes > baseConfig.maxMinutes, "el reloj de sesión crece");
  }
});

test("el largo crece con cada invitado y se clampa en 4", () => {
  const one = scalePartySession(baseConfig, 1);
  const four = scalePartySession(baseConfig, 4);
  const ten = scalePartySession(baseConfig, 10);
  assert.ok(four.maxRoundsPerScene > one.maxRoundsPerScene);
  assert.deepEqual(ten, four, "más de 4 invitados escala igual que 4");
});

test("campañas cortas igual cumplen el mínimo de 20 rondas", () => {
  const short = { ...baseConfig, maxScenes: 3, maxRoundsPerScene: 5 };
  const out = scalePartySession(short, 1);
  assert.ok(out.maxScenes * out.maxRoundsPerScene >= MIN_PARTY_TOTAL_ROUNDS);
});
