import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

async function walk(dir) { const entries = await readdir(dir, { withFileTypes: true }); const files = []; for (const entry of entries) { const full = join(dir, entry.name); if (entry.isDirectory()) files.push(...await walk(full)); else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full); } return files; }
function rewrite(source) { return source.replace(/(from\s+["'])(\.\.?\/[^"']+)(["'])/g, (_m, start, spec, end) => /\.(mjs|js|json)$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`).replace(/(import\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/g, (_m, start, spec, end) => /\.(mjs|js|json)$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`); }
async function transpileGameEngine() { const sourceRoot = new URL("../packages/game-engine/src", import.meta.url).pathname; const outRoot = join(tmpdir(), `tinyquest-qa-final-${process.pid}`); const sourceFiles = await walk(sourceRoot); for (const sourceFile of sourceFiles) { const rel = relative(sourceRoot, sourceFile); const outFile = join(outRoot, rel).replace(/\.ts$/, ".mjs"); await mkdir(dirname(outFile), { recursive: true }); const { outputText } = ts.transpileModule(rewrite(await readFile(sourceFile, "utf8")), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }); await writeFile(outFile, outputText); } for (const sourceFile of sourceFiles.filter((file) => file.endsWith("/index.ts"))) { const dirRel = relative(sourceRoot, dirname(sourceFile)); if (!dirRel) continue; await writeFile(join(outRoot, `${dirRel}.mjs`), `export * from "./${dirRel.split("/").at(-1)}/index.mjs";\n`); } return outRoot; }

const outRoot = await transpileGameEngine();
const simulation = await import(`file://${join(outRoot, "testing/narrativeSimulation.mjs")}`);
const quality = await import(`file://${join(outRoot, "testing/narrativeQuality.mjs")}`);
const context = await import(`file://${join(outRoot, "context-coherence.mjs")}`);
const consequence = await import(`file://${join(outRoot, "consequence-builder.mjs")}`);
console.info = () => {};
const report = await simulation.simulateNarrativeRun({ campaignId: "red-moon-killer", maxTurns: 12, seed: 42, useGroq: false, playerName: "Fiamy" });
const allIssues = report.turns.flatMap((turn) => turn.issues.map((issue) => issue.type));
const allWarnings = report.turns.flatMap((turn) => turn.warnings);

test("1) simulateNarrativeRun larga no produce INVALID_NPC grave", () => assert.equal(allIssues.includes("INVALID_NPC"), false));
test("2) simulateNarrativeRun larga no produce object-not-present grave", () => assert.equal(allWarnings.some((warning) => warning.includes("object-not-present")), false));
test("3) simulateNarrativeRun larga no produce WRONG_TARGET_CONSEQUENCE grave", () => assert.equal(allIssues.includes("WRONG_TARGET_CONSEQUENCE"), false));
test("4) todos los turnos tienen world change concreto", () => assert.equal(allIssues.includes("NO_WORLD_CHANGE"), false));
test("5) detectRepetition baja después de variants/templates", () => assert.deepEqual(quality.detectRepetition(report.turns), []));
test("6) NPC no presente se reemplaza por genérico seguro", () => {
  const plan = { validContext: { presentNpcIds: ["tomas"] }, npcDirectives: [{ npcId: "tomas", name: "Tomás" }] };
  assert.equal(context.safeNpcReference(plan, "inventado", "Lord Inventado"), "Tomás");
});
test("7) objeto no presente no se selecciona como compatible", () => {
  assert.equal(context.selectCompatibleObject({ actionText: "Revisar los grilletes", presentObjectIds: [], labels: {} }), undefined);
});
test("8) target consequence respeta dominio", () => {
  const result = consequence.buildMechanicalConsequence({ actorId: "f", actorName: "Fiamy", actorKind: "player", actionText: "Revisar la cuerda cortada de la campana", result: "failure", scene: { id: "s", title: "Capilla", location: "capilla", phase: "pressure", dangerBefore: 1, dangerAfter: 2 }, validContext: { presentNpcIds: ["tomas"], presentObjectIds: ["bell"], availableClueIds: [], knownClueIds: [] }, roll: { total: 5, dc: 12 }, contextLabels: { npcs: { tomas: "Tomás" }, objects: { bell: "campana" }, clues: {} }, target: { id: "bell", kind: "object" } });
  assert.match(result.summary, /campana|cuerda|badajo/i);
  assert.doesNotMatch(result.summary, /mordida|grillete|sello/i);
});
test("9) fallback narration no inventa NPC", () => {
  for (const turn of report.turns) assert.equal(turn.issues.some((issue) => issue.type === "INVALID_NPC"), false);
});
test("10) reporte largo queda sin topIssues", () => assert.deepEqual(report.topIssues, []));
