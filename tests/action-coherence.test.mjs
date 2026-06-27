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
  const dir = join(tmpdir(), `tinyquest-action-coherence-${process.pid}`);
  await mkdir(dir, { recursive: true });
  await transpile("../packages/game-engine/src/campaigns.ts", join(dir, "campaigns.mjs"));
  await transpile("../packages/game-engine/src/action-outcomes.ts", join(dir, "action-outcomes.mjs"));
  return {
    campaigns: await import(`file://${join(dir, "campaigns.mjs")}`),
    outcomes: await import(`file://${join(dir, "action-outcomes.mjs")}`)
  };
}

const { campaigns: campaignModule, outcomes } = await importModules();
const redMoon = campaignModule.campaigns.find((campaign) => campaign.id === "luna-roja");
const bodyScene = redMoon.scenes.find((scene) => scene.id === "cuartel-umbral");
const actor = { id: "p1", name: "Fiamy" };
const byId = (id) => bodyScene.multipleChoiceOptions.find((choice) => choice.id === id);

test("interrogar_npc nunca devuelve outcome de ruta", () => {
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: byId("hablar-nicolas"), rawAction: "Escuchar a Nicolás antes de que lo aíslen", result: "success" });
  assert.equal(facts.actionType, "interrogar_npc");
  assert.notEqual(facts.outcomeKind, "route_opened");
  assert.equal(facts.outcomeKind, "npc_confession");
  assert.match(facts.factualSummary, /Nicolás|capa verde/);
});

test("abrir_ruta nunca devuelve confesión de NPC", () => {
  const routeChoice = { id: "forzar-salida", label: "Forzar la salida sellada", action: "Forzar la salida sellada", actionType: "abrir_ruta", targetKind: "route", targetId: "salida-sellada", recommendedStats: ["mind"] };
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: routeChoice, rawAction: routeChoice.label, result: "success" });
  assert.equal(facts.actionType, "abrir_ruta");
  assert.equal(facts.outcomeKind, "route_opened");
  assert.notEqual(facts.outcomeKind, "npc_confession");
});

test("comparar_evidencia nunca deriva a confesión o movimiento", () => {
  const cmpChoice = { id: "comparar-herida", label: "Comparar la herida con un colmillo real", action: "Comparar la herida con un colmillo real", actionType: "comparar_evidencia", targetKind: "object", targetId: "herida-carvell", recommendedStats: ["mind"] };
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: cmpChoice, rawAction: cmpChoice.label, result: "success" });
  const text = `${facts.factualSummary} ${facts.visibleConsequence} ${facts.narrationHints.mustMention.join(" ")}`.toLowerCase();
  assert.equal(facts.actionType, "comparar_evidencia");
  assert.equal(facts.outcomeKind, "evidence_confirmed");
  assert.match(text, /cadáver|mordida|herida/);
  assert.doesNotMatch(text, /compuerta|movimiento|ruta abierta/);
});

test("confrontar_npc menciona el NPC objetivo", () => {
  const confChoice = { id: "confrontar-bran", label: "Confrontar al Inspector Bran", action: "Confrontar al Inspector Bran", actionType: "confrontar_npc", targetKind: "npc", targetId: "inspector-bran", recommendedStats: ["charm"] };
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: confChoice, rawAction: confChoice.label, result: "success" });
  assert.equal(facts.actionType, "confrontar_npc");
  assert.equal(facts.target.id, "inspector-bran");
  assert.ok(facts.narrationHints.mustMention.some((item) => item.includes("Bran")));
});

test("playerNarration no debe contener frases de debug", () => {
  assert.equal(outcomes.visibleTextHasDebugPhrases("Tomás no mira la cuerda. Mira la puerta. Afuera la turba grita."), false);
  assert.equal(outcomes.visibleTextHasDebugPhrases("La escena cambia en algo visible"), true);
});

test("cada actionId usa su outcome propio por resultado", () => {
  const nicolas = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: byId("hablar-nicolas"), rawAction: "x", result: "partial_success" });
  const marca = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: byId("examinar-marca-nicolas"), rawAction: "x", result: "partial_success" });
  assert.equal(nicolas.outcomeKind, "npc_evasion");
  assert.equal(marca.outcomeKind, "evidence_partial");
  assert.notEqual(nicolas.factualSummary, marca.factualSummary);
});

test("TurnResolution facts incluyen target coherente", () => {
  const protectChoice = redMoon.scenes.find((scene) => scene.id === "tribunal-sello").multipleChoiceOptions.find((choice) => choice.id === "traer-issa-testigo");
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: protectChoice, rawAction: "Llevar a Issa a testificar", result: "failure" });
  assert.equal(facts.target.id, "issa-mano");
  assert.equal(facts.target.kind, "npc");
  assert.equal(facts.outcomeKind, "ally_harmed");
});

test("outcome incoherente falla en modo dev/strict", () => {
  assert.throws(() => outcomes.assertCoherentActionOutcome({ id: "bad", label: "Mal", action: "Mal", actionType: "interrogar_npc", targetKind: "npc", recommendedStats: [], skillTag: "talk" }, { kind: "route_opened", summary: "abre puerta", visibleConsequence: "mal" }, true), /incoherente/);
});
