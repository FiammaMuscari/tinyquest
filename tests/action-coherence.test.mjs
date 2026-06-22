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
const bodyScene = redMoon.scenes.find((scene) => scene.id === "body-by-mill");
const actor = { id: "p1", name: "Fiamy" };
const byId = (id) => bodyScene.multipleChoiceOptions.find((choice) => choice.id === id);

test("interrogar_npc nunca devuelve outcome de ruta", () => {
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: byId("question-tomas-bell"), rawAction: "Interrogar a Tomás sobre la campana", result: "success" });
  assert.equal(facts.actionType, "interrogar_npc");
  assert.notEqual(facts.outcomeKind, "route_opened");
  assert.equal(facts.outcomeKind, "npc_confession");
  assert.match(facts.factualSummary, /Tomás|campana/);
});

test("abrir_ruta nunca devuelve confesión de NPC", () => {
  const routeChoice = redMoon.scenes.find((scene) => scene.id === "red-forest").multipleChoiceOptions.find((choice) => choice.id === "follow-mud-to-mayor");
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: routeChoice, rawAction: routeChoice.label, result: "success" });
  assert.equal(facts.actionType, "abrir_ruta");
  assert.equal(facts.outcomeKind, "route_opened");
  assert.notEqual(facts.outcomeKind, "npc_confession");
});

test("comparar_evidencia nunca deriva a compuerta o movimiento", () => {
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: byId("compare-bite-wound"), rawAction: "Comparar la mordida con la herida del cadáver", result: "success" });
  const text = `${facts.factualSummary} ${facts.visibleConsequence} ${facts.narrationHints.mustMention.join(" ")}`.toLowerCase();
  assert.equal(facts.actionType, "comparar_evidencia");
  assert.equal(facts.outcomeKind, "evidence_confirmed");
  assert.match(text, /cadáver|mordida|herida/);
  assert.doesNotMatch(text, /compuerta|movimiento|ruta abierta/);
});

test("confrontar_npc menciona el NPC objetivo", () => {
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: byId("confront-elias-mob"), rawAction: "Enfrentar a Elías frente a la turba", result: "success" });
  assert.equal(facts.actionType, "confrontar_npc");
  assert.equal(facts.target.id, "elias-bailiff");
  assert.ok(facts.narrationHints.mustMention.some((item) => item.includes("Elías")));
});

test("playerNarration no debe contener frases de debug", () => {
  assert.equal(outcomes.visibleTextHasDebugPhrases("Tomás no mira la cuerda. Mira la puerta. Afuera la turba grita."), false);
  assert.equal(outcomes.visibleTextHasDebugPhrases("La escena cambia en algo visible"), true);
});

test("cada actionId usa su outcome propio por resultado", () => {
  const tomas = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: byId("question-tomas-bell"), rawAction: "x", result: "partial_success" });
  const bite = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: byId("compare-bite-wound"), rawAction: "x", result: "partial_success" });
  assert.equal(tomas.outcomeKind, "npc_evasion");
  assert.equal(bite.outcomeKind, "evidence_partial");
  assert.notEqual(tomas.factualSummary, bite.factualSummary);
});

test("TurnResolution facts incluyen target coherente", () => {
  const facts = outcomes.resolveCoherentTurnFacts({ campaign: redMoon, actor, choice: byId("protect-nicolas-stone"), rawAction: "Proteger a Nicolás", result: "failure" });
  assert.equal(facts.target.id, "accused-wolf");
  assert.equal(facts.target.kind, "npc");
  assert.equal(facts.outcomeKind, "ally_harmed");
});

test("outcome incoherente falla en modo dev/strict", () => {
  assert.throws(() => outcomes.assertCoherentActionOutcome({ id: "bad", label: "Mal", action: "Mal", actionType: "interrogar_npc", targetKind: "npc", recommendedStats: [], skillTag: "talk" }, { kind: "route_opened", summary: "abre puerta", visibleConsequence: "mal" }, true), /incoherente/);
});
