import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpile(sourcePath, outPath) {
  const source = await readFile(new URL(sourcePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(outPath, outputText);
}

const dir = join(tmpdir(), `tinyquest-player-narration-${process.pid}`);
await mkdir(dir, { recursive: true });
await transpile("../packages/game-engine/src/player-narration.ts", join(dir, "player-narration.mjs"));
const narration = await import(`file://${join(dir, "player-narration.mjs")}`);

function turn(overrides = {}) {
  return {
    actor: { id: "miri", name: "Miri" },
    target: { id: "cadaver-bite-evidence", label: "Mordida del cadáver", kind: "object" },
    campaignActionType: "comparar_evidencia",
    result: "failure",
    outcomeKind: "evidence_contaminated",
    factualSummary: "La evidencia queda contaminada.",
    visibleConsequence: "Elías desacredita la comparación. El peligro social sube.",
    narrationHints: { mustMention: ["cadáver", "mordida", "herida"], mustNotMention: ["compuerta", "ruta"], style: "detalle físico" },
    ...overrides
  };
}

test("playerNarration no contiene logs técnicos prohibidos", () => {
  const text = narration.buildPlayerNarration(turn(), "El Cadáver Bajo el Molino");
  assert.equal(narration.containsForbiddenPlayerNarration(text), false);
  assert.doesNotMatch(text, /actúa sobre|la acción sale mal|actionType|target|statePatch|peligroDelta/i);
});

test("comparar_evidencia + fallo menciona evidencia/cuerpo/herida y no rutas", () => {
  const text = narration.buildPlayerNarration(turn(), "El Cadáver Bajo el Molino");
  assert.match(text.toLowerCase(), /cadáver|cadaver|herida|mordida/);
  assert.doesNotMatch(text.toLowerCase(), /compuerta|cripta|ruta abierta/);
});

test("interrogar_npc contiene NPC o diálogo", () => {
  const text = narration.buildPlayerNarration(turn({
    campaignActionType: "interrogar_npc",
    target: { id: "tomas-apprentice", label: "Tomás, aprendiz del molino", kind: "npc" },
    result: "success",
    outcomeKind: "npc_confession",
    visibleConsequence: "Tomás admite la contradicción.",
    narrationHints: { mustMention: ["Tomás", "campana"], mustNotMention: ["compuerta"], style: "diálogo" }
  }), "El Cadáver Bajo el Molino");
  assert.ok(text.includes("Tomás") || text.includes("—"));
});

test("fallback reemplaza narración mala por oración natural", () => {
  const bad = "Miri actúa sobre Mordida del cadáver, cadáver, herida. La acción sale mal.";
  const text = narration.buildCleanTurnNarration(turn(), "El Cadáver Bajo el Molino", bad);
  assert.equal(narration.containsForbiddenPlayerNarration(text), false);
  assert.notEqual(text, bad);
});

test("visibleConsequence es corta y no repite playerNarration", () => {
  const t = turn();
  const player = narration.buildPlayerNarration(t, "El Cadáver Bajo el Molino");
  const consequence = narration.buildVisibleConsequence(t);
  assert.ok(consequence.length < 140);
  assert.notEqual(consequence, player);
});

test("limpia salida extensa, repetida o con bloques técnicos", () => {
  const repeated = "Miri encuentra una marca concreta en la cuerda. ".repeat(20);
  const candidate = `<think>razonamiento privado</think>\n\nNarración: ${repeated}\n\n${repeated}\n\n\`\`\`json\n{\"statePatch\":true}\n\`\`\``;
  const text = narration.buildCleanTurnNarration(turn({ result: "success" }), "El Molino", candidate);
  assert.ok(text.length <= 1501, `largo inesperado: ${text.length}`);
  assert.doesNotMatch(text, /think|statePatch|```/i);
  assert.equal((text.match(/marca concreta/g) ?? []).length, 1);
});


test("playerNarration no contiene frases abstractas prohibidas nuevas", () => {
  const text = narration.buildPlayerNarration(turn({ campaignActionType: "investigar_objeto", result: "success", target: { id: "moon-bell-seal", label: "Sello lunar de la campana", kind: "object" } }), "La Campana de Luna");
  assert.equal(narration.containsForbiddenPlayerNarration(text), false);
  assert.doesNotMatch(text, /pieza que debe encajar|detalle aparece en lo concreto|intenta torcer la escena|la presión le gana un paso/i);
});
