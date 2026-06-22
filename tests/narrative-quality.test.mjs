import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function rewriteRelativeImports(source) {
  return source
    .replace(/(from\s+["'])(\.\.?\/[^"']+)(["'])/g, (_m, start, spec, end) => /\.(mjs|js|json)$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`)
    .replace(/(import\s*\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/g, (_m, start, spec, end) => /\.(mjs|js|json)$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
}

async function transpileGameEngine() {
  const sourceRoot = new URL("../packages/game-engine/src", import.meta.url);
  const outRoot = join(tmpdir(), `tinyquest-narrative-quality-${process.pid}`);
  const sourceFiles = await walk(sourceRoot.pathname);
  for (const sourceFile of sourceFiles) {
    const rel = relative(sourceRoot.pathname, sourceFile);
    const outFile = join(outRoot, rel).replace(/\.ts$/, ".mjs");
    await mkdir(dirname(outFile), { recursive: true });
    const source = rewriteRelativeImports(await readFile(sourceFile, "utf8"));
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
    await writeFile(outFile, outputText);
  }
  for (const sourceFile of sourceFiles.filter((file) => file.endsWith("/index.ts"))) {
    const dirRel = relative(sourceRoot.pathname, dirname(sourceFile));
    if (!dirRel) continue;
    const aliasFile = join(outRoot, `${dirRel}.mjs`);
    await mkdir(dirname(aliasFile), { recursive: true });
    await writeFile(aliasFile, `export * from "./${dirRel.split("/").at(-1)}/index.mjs";\n`);
  }
  return outRoot;
}

const outRoot = await transpileGameEngine();
const simulation = await import(`file://${join(outRoot, "testing/narrativeSimulation.mjs")}`);
const quality = await import(`file://${join(outRoot, "testing/narrativeQuality.mjs")}`);

function makeTurn(overrides = {}) {
  return {
    turnNumber: 1,
    actorId: "player-1",
    actorName: "Fiamy",
    actionText: "Examinar el sello",
    rollTotal: 8,
    dc: 15,
    result: "failure",
    phase: "pressure",
    dangerBefore: 7,
    dangerAfter: 9,
    resolutionPlanSummary: { mustHappen: [], mustNotHappen: [], consequence: "La cuerda queda marcada y Tomás retrocede.", uiFocus: { highlight: "danger" } },
    narration: "La cuerda queda marcada y Tomás retrocede mientras la turba golpea la puerta.",
    warnings: [],
    score: { coherence: 0, tension: 0, consequence: 0, characterConsistency: 0, sceneContinuity: 0, clueValidity: 0, emotionalImpact: 0, uiClarity: 0, dndFeeling: 0, overall: 0 },
    issues: [],
    ...overrides
  };
}

test("1-4,9) simulateNarrativeRun corre sin Groq, genera 8+ turnos, planes, consecuencias y score", async () => {
  const report = await simulation.simulateNarrativeRun({ campaignId: "red-moon-killer", maxTurns: 8, seed: 42, useGroq: false, playerName: "Fiamy" });
  assert.ok(report.totalTurns >= 8, `turnos: ${report.totalTurns}`);
  assert.ok(report.overallScore.overall > 0);
  for (const turn of report.turns) {
    assert.ok(turn.resolutionPlan, `turno ${turn.turnNumber} sin ResolutionPlan`);
    assert.ok(turn.resolutionPlanSummary.consequence.trim().length > 10, `turno ${turn.turnNumber} sin consecuencia concreta`);
    assert.ok(turn.narration.trim().length > 0);
  }
  assert.match(report.markdown, /# Narrative Playtest Report/);
});

test("5) detectGenericConsequence detecta frases vagas", () => {
  assert.equal(quality.detectGenericConsequence("La tensión aumenta y algo cambia en el ambiente."), true);
  assert.equal(quality.detectGenericConsequence("La cuerda se rompe frente a Roldán."), false);
});

test("6) detectRepetition detecta repetición", () => {
  const repeated = quality.detectRepetition([
    { narration: "La campana rota vibra bajo la lluvia." },
    { narration: "La campana rota vibra bajo la lluvia." }
  ]);
  assert.ok(repeated.some((phrase) => phrase.includes("campana rota")));
});

test("7) failure que parece success baja score", () => {
  const bad = makeTurn({ result: "failure", narration: "Fiamy revela toda la verdad y confirma la prueba completa.", resolutionPlanSummary: { mustHappen: [], mustNotHappen: [], consequence: "Fiamy revela toda la verdad.", uiFocus: { highlight: "clue" } } });
  const good = makeTurn({ result: "failure", narration: "Fiamy falla: la turba mancha la prueba y Roldán gana tiempo.", resolutionPlanSummary: { mustHappen: [], mustNotHappen: [], consequence: "La prueba queda manchada y Roldán gana tiempo.", uiFocus: { highlight: "consequence" } } });
  const badEval = quality.evaluateNarrativeQuality(bad, []);
  const goodEval = quality.evaluateNarrativeQuality(good, []);
  assert.ok(badEval.issues.some((issue) => issue.type === "FAILURE_LOOKS_LIKE_SUCCESS"));
  assert.ok(badEval.score.overall < goodEval.score.overall);
});

test("8) danger alto sin manifestación baja score", () => {
  const bad = makeTurn({ dangerAfter: 9, narration: "Fiamy piensa en silencio y la escena sigue igual.", resolutionPlanSummary: { mustHappen: [], mustNotHappen: [], consequence: "Tomás queda en duda.", uiFocus: { highlight: "danger" } } });
  const evaluated = quality.evaluateNarrativeQuality(bad, []);
  assert.ok(evaluated.issues.some((issue) => issue.type === "DANGER_NOT_MANIFESTED"));
  assert.ok(evaluated.score.tension < 8);
});

test("10) generateNarrativeReport devuelve markdown y recomendaciones", () => {
  const turn = makeTurn();
  const evaluated = quality.evaluateNarrativeQuality(turn, []);
  const scored = { ...turn, score: evaluated.score, issues: evaluated.issues };
  const report = quality.generateNarrativeReport([scored], "test", "Campaña Test");
  assert.equal(report.totalTurns, 1);
  assert.match(report.markdown, /## Recomendaciones/);
  assert.ok(report.recommendations.length >= 1);
});


test("11) generic quality detecta complicación concreta y baja score", () => {
  const bad = makeTurn({
    result: "failure",
    narration: "Fiamy provoca una complicación concreta en la escena.",
    resolutionPlanSummary: { mustHappen: [], mustNotHappen: [], consequence: "Fiamy provoca una complicación concreta en la escena.", uiFocus: { highlight: "consequence" } }
  });
  const evaluated = quality.evaluateNarrativeQuality(bad, []);
  assert.ok(evaluated.issues.some((issue) => issue.type === "GENERIC_CONSEQUENCE"));
  assert.ok(evaluated.score.consequence < 7);
});

test("12) simulateNarrativeRun no produce ventaja concreta ni complicación concreta", async () => {
  const report = await simulation.simulateNarrativeRun({ campaignId: "red-moon-killer", maxTurns: 8, seed: 42, useGroq: false, playerName: "Fiamy" });
  const text = report.turns.map((turn) => turn.resolutionPlanSummary.consequence).join("\n");
  assert.doesNotMatch(text, /ventaja concreta|complicación concreta|complicacion concreta|tensión aumenta|peligro gana terreno|algo cambia/i);
});

test("13) detectAwkwardConsequence detecta frases rotas", () => {
  const issues = quality.detectAwkwardConsequence("Fiamy alcanza una parte de La campana sonó tarde, pero la multitud interpreta el avance como provocación.");
  assert.ok(issues.some((issue) => issue.type === "AWKWARD_CONSEQUENCE"));
});

test("14) simulateNarrativeRun no produce awkward consequences", async () => {
  const report = await simulation.simulateNarrativeRun({ campaignId: "red-moon-killer", maxTurns: 8, seed: 42, useGroq: false, playerName: "Fiamy" });
  for (const turn of report.turns) {
    assert.deepEqual(quality.detectAwkwardConsequence(turn.resolutionPlanSummary.consequence).map((issue) => issue.message), []);
    assert.doesNotMatch(turn.resolutionPlanSummary.consequence, /una parte de La|para la escena|\bo aprovecha\b|\bpuede\b|\bpodría\b|\bo lo\b/i);
  }
});


test("15) simulateNarrativeRun produce structuredNarration sin Groq", async () => {
  const report = await simulation.simulateNarrativeRun({ campaignId: "red-moon-killer", maxTurns: 8, seed: 42, useGroq: false, playerName: "Fiamy" });
  assert.ok(report.turns.every((turn) => turn.structuredNarration?.uiFocus));
  assert.ok(report.turns.every((turn) => turn.structuredNarration?.consequence.summary === turn.resolutionPlanSummary.consequence));
});
