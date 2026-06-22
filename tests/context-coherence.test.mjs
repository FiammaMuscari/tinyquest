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
  const sourceRoot = new URL("../packages/game-engine/src", import.meta.url).pathname;
  const outRoot = join(tmpdir(), `tinyquest-context-coherence-${process.pid}`);
  const sourceFiles = await walk(sourceRoot);
  for (const sourceFile of sourceFiles) {
    const rel = relative(sourceRoot, sourceFile);
    const outFile = join(outRoot, rel).replace(/\.ts$/, ".mjs");
    await mkdir(dirname(outFile), { recursive: true });
    const source = rewriteRelativeImports(await readFile(sourceFile, "utf8"));
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
    await writeFile(outFile, outputText);
  }
  for (const sourceFile of sourceFiles.filter((file) => file.endsWith("/index.ts"))) {
    const dirRel = relative(sourceRoot, dirname(sourceFile));
    if (!dirRel) continue;
    const aliasFile = join(outRoot, `${dirRel}.mjs`);
    await mkdir(dirname(aliasFile), { recursive: true });
    await writeFile(aliasFile, `export * from "./${dirRel.split("/").at(-1)}/index.mjs";\n`);
  }
  return outRoot;
}

const outRoot = await transpileGameEngine();
const context = await import(`file://${join(outRoot, "context-coherence.mjs")}`);
const simulation = await import(`file://${join(outRoot, "testing/narrativeSimulation.mjs")}`);

function plan(overrides = {}) {
  return {
    turnId: "t1",
    actorId: "player-1",
    actorName: "Fiamy",
    actorKind: "player",
    actionText: "Revisar los grilletes de Nicolás",
    roll: { die: "d20", value: 6, total: 8, dc: 13, result: "failure" },
    scene: { id: "chapel", title: "Capilla", phase: "pressure", location: "capilla", dangerBefore: 5, dangerAfter: 6 },
    validContext: { presentNpcIds: ["mara"], presentObjectIds: ["nicolas-silver-chains"], knownClueIds: [], availableClueIds: ["silver-burns"], allowedStats: ["mind"], allowedTargetKinds: ["object"], targetKind: "object", targetId: "nicolas-silver-chains", usedObjectIds: ["nicolas-silver-chains"] },
    mustHappen: [],
    mustNotHappen: [],
    consequence: { summary: "Mara arranca los grilletes de las manos de Fiamy y los esconde bajo el banco." },
    cluePolicy: { canRevealNewClue: false, allowedClueIds: [], forbiddenClueIds: ["silver-burns"], clueRevealMode: "none" },
    npcDirectives: [{ npcId: "mara", name: "Mara", stateBefore: "hermana de Nicolás", canSpeak: true, allowedIntentions: ["proteger"], forbiddenClaims: [] }],
    botDirectives: [{ botId: "bot-1", name: "Belo", personality: "guardia", emotionalState: "alerta", currentGoal: "proteger", allowedActions: ["Belo se coloca delante de Nicolás"], forbiddenActions: [], botIntent: "protect", botEmotion: "loyal" }],
    uiFocus: { mainEvent: "Los grilletes quedan ocultos", highlight: "consequence", showAs: "failed_attempt" },
    memoryPatch: { factsToRemember: [], factsToUpdate: [] },
    continuityWarnings: [],
    ...overrides
  };
}

function output(overrides = {}) {
  return {
    narration: "Mara, la hermana de Nicolás, arranca los grilletes de las manos de Fiamy.",
    immediateAction: { actorId: "player-1", actorName: "Fiamy", text: "Revisar los grilletes de Nicolás" },
    rollPresentation: { total: 8, dc: 13, result: "failure", label: "Fallo: 8 vs 13" },
    dialogue: [{ speakerId: "mara", speakerName: "Mara", speakerKind: "npc", line: "No los va a tocar Roldán.", intention: "proteger" }],
    companionMoments: [{ characterId: "bot-1", characterName: "Belo", action: "Belo se coloca delante de Nicolás cuando una piedra golpea el banco.", emotion: "leal", relevance: "major", botIntent: "protect", botEmotion: "loyal" }],
    consequence: { summary: "Mara arranca los grilletes de las manos de Fiamy y los esconde bajo el banco." },
    worldStateChange: { text: "Los grilletes quedan bajo el banco.", changedNpcIds: ["mara"], changedObjectIds: ["nicolas-silver-chains"], changedClueIds: [] },
    dangerChange: { before: 5, after: 6, manifestation: "La turba avanza un paso y golpea la puerta de la capilla." },
    clueReveals: [],
    uiFocus: { mainText: "Mara oculta los grilletes", highlight: "consequence", cardType: "failure", priority: "high" },
    memoryPatch: { factsToRemember: [], factsToUpdate: ["Mara ocultó los grilletes."] },
    continuityWarnings: [],
    ...overrides
  };
}

test("1) no permite actionText abstracto", () => {
  assert.ok(context.validateActionSpecificity("mover, cubrir o negociar posición").some((issue) => issue.code === "abstract-action"));
});

test("2) acción abstracta de bot se concreta", () => {
  const text = context.concretizeActionText("proteger lo conseguido", { actorName: "Belo", scene: { location: "capilla" }, validContext: { presentNpcIds: ["mara"], presentObjectIds: ["chains"] }, npcDirectives: [{ npcId: "mara", name: "Mara" }] });
  assert.doesNotMatch(text, /proteger lo conseguido|mover, cubrir|aceptar un coste/i);
  assert.match(text, /Belo|Mara|chains|prueba|turba|amenaza/i);
});

test("3) target grilletes no debe narrar sello lunar", () => {
  const issues = context.validateActionTargetConsistency(plan(), output({ narration: "Fiamy aparta el sello lunar roto.", consequence: { summary: "Los grilletes prueban algo." } }));
  assert.ok(issues.some((issue) => issue.code === "target-drift"));
});

test("4-6) consequence no repite narration ni usa frases genéricas", () => {
  const out = output({ narration: "La decisión deja una marca clara y obliga al grupo a moverse con cuidado.", consequence: { summary: "La decisión deja una marca clara y obliga al grupo a moverse con cuidado." } });
  const issues = context.validateNoRepeatedGenericLines(out, [{ narration: out.narration, consequence: out.consequence.summary }]);
  assert.ok(issues.some((issue) => issue.code === "generic-line"));
  assert.ok(issues.some((issue) => issue.code === "repeated-consequence"));
});

test("7) peligro aumentado necesita manifestación física", () => {
  const issues = context.validateOutcomeNarrationConsistency(plan(), output({ dangerChange: { before: 5, after: 6, manifestation: "El peligro sube porque la oposición aprovecha la repetición." } }));
  assert.ok(issues.some((issue) => issue.code === "danger-not-physical"));
});

test("8) NPC nuevo debe tener rol o introducción", () => {
  const issues = context.validateNpcIntroduction(plan(), output({ narration: "Mara arranca los grilletes.", dialogue: [{ speakerId: "mara", speakerName: "Mara", speakerKind: "npc", line: "No.", intention: "proteger" }] }), { npcs: [], npcStates: [] });
  assert.ok(issues.some((issue) => issue.code === "npc-not-introduced"));
});

test("9) failure no revela pista completa", () => {
  const issues = context.validateOutcomeNarrationConsistency(plan(), output({ clueReveals: [{ clueId: "silver-burns", title: "Quemaduras", mode: "full", text: "Prueba completa" }] }));
  assert.ok(issues.some((issue) => issue.code === "failure-looks-success" || issue.code === "forbidden-clue-reveal"));
});

test("10) partial tiene coste concreto", () => {
  const partialPlan = plan({ roll: { die: "d20", value: 11, total: 12, dc: 13, result: "partial" }, cluePolicy: { canRevealNewClue: false, allowedClueIds: [], forbiddenClueIds: [], clueRevealMode: "none" } });
  const issues = context.validateOutcomeNarrationConsistency(partialPlan, output({ consequence: { summary: "Fiamy mira los grilletes." }, narration: "Fiamy mira los grilletes.", dangerChange: { before: 5, after: 5, manifestation: "Sin cambio." } }));
  assert.ok(issues.some((issue) => issue.code === "partial-without-cost"));
});

test("11) simulateNarrativeRun no produce acciones abstractas ni consecuencias repetidas", async () => {
  const report = await simulation.simulateNarrativeRun({ campaignId: "red-moon-killer", maxTurns: 8, seed: 42, useGroq: false, playerName: "Fiamy" });
  const seen = new Set();
  for (const turn of report.turns) {
    assert.equal(context.validateActionSpecificity(turn.actionText).length, 0, turn.actionText);
    assert.equal(seen.has(turn.resolutionPlanSummary.consequence), false, turn.resolutionPlanSummary.consequence);
    seen.add(turn.resolutionPlanSummary.consequence);
  }
});

test("12) inferActionDomain detecta body y bell", () => {
  assert.equal(context.inferActionDomain("Comparar la mordida con la herida del cadáver"), "body");
  assert.equal(context.inferActionDomain("Revisar la cuerda cortada de la campana"), "bell");
  assert.equal(context.inferActionDomain("Revisar los grilletes de Nicolás"), "chains");
  assert.equal(context.inferActionDomain("Pedir a Mara la verdad de la carta"), "letter");
});

test("13) acción body no puede elegir clue de campana y acción bell no puede elegir clue de mordida", () => {
  const body = context.selectCompatibleClue({ actionText: "Comparar la mordida con la herida del cadáver", availableClueIds: ["bell-after-death", "fake-claws"], labels: { "bell-after-death": "La campana sonó tarde", "fake-claws": "Garras fabricadas" } });
  const bell = context.selectCompatibleClue({ actionText: "Revisar la cuerda cortada de la campana", availableClueIds: ["fake-claws", "cut-bell-rope"], labels: { "fake-claws": "Garras fabricadas", "cut-bell-rope": "Cuerda cortada antes" } });
  assert.equal(body.clueId, "fake-claws");
  assert.equal(bell.clueId, "cut-bell-rope");
  assert.equal(context.selectCompatibleClue({ actionText: "Comparar la mordida con la herida del cadáver", availableClueIds: ["bell-after-death"], labels: { "bell-after-death": "La campana sonó tarde" } }), undefined);
  assert.equal(context.selectCompatibleClue({ actionText: "Revisar la cuerda cortada de la campana", availableClueIds: ["fake-claws"], labels: { "fake-claws": "Mordida del cadáver" } }), undefined);
});

test("14) affordances: campana no capa/palma, carta y sello sí permiten ocultar/cubrir", () => {
  assert.ok(context.validatePhysicalAffordance("Tomás guarda la campana bajo la capa.", "bell", "campana").some((issue) => issue.code === "IMPOSSIBLE_OBJECT_ACTION"));
  assert.ok(context.validatePhysicalAffordance("Tomás cubre la campana con la palma.", "bell", "campana").some((issue) => issue.code === "IMPOSSIBLE_OBJECT_ACTION"));
  assert.equal(context.validatePhysicalAffordance("Mara guarda la carta bajo la capa.", "mara-letter", "carta").length, 0);
  assert.equal(context.validatePhysicalAffordance("Roldán cubre el sello con la palma.", "moon-seal", "sello lunar").length, 0);
});

test("15) acción chains genera consecuencia sobre grilletes, no sello", async () => {
  const { buildMechanicalConsequence } = await import(`file://${join(outRoot, "consequence-builder.mjs")}`);
  const consequence = buildMechanicalConsequence({
    actorId: "fiamy", actorName: "Fiamy", actorKind: "player", actionText: "Revisar los grilletes de Nicolás", result: "success",
    scene: { id: "chapel", title: "Capilla", location: "capilla", phase: "pressure", dangerBefore: 2, dangerAfter: 2 },
    validContext: { presentNpcIds: ["mara"], presentObjectIds: ["nicolas-silver-chains", "moon-seal"], availableClueIds: ["moon-seal", "silver-burns"], knownClueIds: [] },
    roll: { total: 14, dc: 13 },
    contextLabels: { npcs: { mara: "Mara" }, objects: { "nicolas-silver-chains": "grilletes", "moon-seal": "sello lunar" }, clues: { "moon-seal": "Sello lunar", "silver-burns": "Quemaduras de plata baja" } },
    target: { id: "nicolas-silver-chains", kind: "object" }
  });
  assert.match(consequence.summary, /grilletes|marcas|cierre|orden oficial/i);
  assert.doesNotMatch(consequence.summary, /sello lunar/i);
});

test("16) failure de proteger a Nicolás genera crowd consequence", async () => {
  const { buildMechanicalConsequence } = await import(`file://${join(outRoot, "consequence-builder.mjs")}`);
  const consequence = buildMechanicalConsequence({
    actorId: "belo", actorName: "Belo", actorKind: "bot", actionText: "Proteger a Nicolás de la primera pedrada", result: "failure",
    scene: { id: "mill", title: "Molino", location: "molino", phase: "pressure", dangerBefore: 2, dangerAfter: 4 },
    validContext: { presentNpcIds: ["accused-wolf"], presentObjectIds: [], availableClueIds: [], knownClueIds: [] },
    roll: { total: 4, dc: 12 },
    contextLabels: { npcs: { "accused-wolf": "Nicolás" }, objects: {}, clues: {} },
    target: { id: "accused-wolf", kind: "npc" }
  });
  assert.match(consequence.summary, /piedra|banco|Nicolás|turba/i);
  assert.doesNotMatch(consequence.summary, /deja de responder|autoridad/i);
});

test("17) validateDomainConsistency detecta DOMAIN_MISMATCH e IMPOSSIBLE_OBJECT_ACTION", () => {
  const out = output({ narration: "Miri nota barro fresco en el badajo de la campana.", consequence: { summary: "Miri nota barro fresco en el badajo de la campana." }, worldStateChange: { text: "campana", changedNpcIds: [], changedObjectIds: ["bell"], changedClueIds: ["bell-after-death"] } });
  const issues = context.validateDomainConsistency(plan({ actionText: "Comparar la mordida con la herida del cadáver", validContext: { ...plan().validContext, targetKind: "object", targetId: "cadaver-bite-evidence", presentObjectIds: ["cadaver-bite-evidence"] } }), out);
  assert.ok(issues.some((issue) => issue.code === "DOMAIN_MISMATCH"));
});

test("18) simulateNarrativeRun no produce DOMAIN_MISMATCH", async () => {
  const report = await simulation.simulateNarrativeRun({ campaignId: "red-moon-killer", maxTurns: 8, seed: 42, useGroq: false, playerName: "Fiamy" });
  for (const turn of report.turns) assert.equal(turn.issues.some((issue) => issue.type === "DOMAIN_MISMATCH"), false, `${turn.turnNumber}: ${turn.resolutionPlanSummary.consequence}`);
});

test("19) validateObjectAffordance detecta campana imposible y permite carta/sello", () => {
  const bellPlan = plan({ actionText: "Interrogar a Tomás sobre la campana", validContext: { ...plan().validContext, targetKind: "object", targetId: "bell", presentObjectIds: ["bell"], usedObjectIds: ["bell"] } });
  const issues = context.validateObjectAffordance(bellPlan, output({
    narration: "Tomás cubre la campana con la palma y la guarda bajo la capa.",
    consequence: { summary: "Tomás cubre la campana con la palma y la guarda bajo la capa." },
    worldStateChange: { text: "campana", changedNpcIds: [], changedObjectIds: ["bell"], changedClueIds: [] }
  }));
  assert.ok(issues.some((issue) => issue.code === "IMPOSSIBLE_OBJECT_ACTION"));

  const letterPlan = plan({ actionText: "Pedir a Mara la verdad de la carta", validContext: { ...plan().validContext, targetKind: "object", targetId: "mara-letter", presentObjectIds: ["mara-letter"], usedObjectIds: ["mara-letter"] } });
  assert.equal(context.validateObjectAffordance(letterPlan, output({ narration: "Mara guarda la carta bajo la capa.", consequence: { summary: "Mara guarda la carta bajo la capa." }, worldStateChange: { text: "carta", changedNpcIds: [], changedObjectIds: ["mara-letter"], changedClueIds: [] } })).length, 0);
});

test("20) simulateNarrativeRun no produce IMPOSSIBLE_OBJECT_ACTION", async () => {
  const report = await simulation.simulateNarrativeRun({ campaignId: "red-moon-killer", maxTurns: 8, seed: 42, useGroq: false, playerName: "Fiamy" });
  for (const turn of report.turns) assert.equal(turn.issues.some((issue) => issue.type === "IMPOSSIBLE_OBJECT_ACTION"), false, `${turn.turnNumber}: ${turn.resolutionPlanSummary.consequence}`);
});
