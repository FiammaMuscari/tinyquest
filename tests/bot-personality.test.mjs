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
  const outRoot = join(tmpdir(), `tinyquest-bot-personality-${process.pid}`);
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
const personality = await import(`file://${join(outRoot, "bot-personality.mjs")}`);
const simulation = await import(`file://${join(outRoot, "testing/narrativeSimulation.mjs")}`);
const bots = await import(`file://${join(outRoot, "bots.mjs")}`);

function fakeScene(overrides = {}) {
  return { id: "wolf", title: "El Lobo Acusado", objective: "Proteger a Nicolás de la turba y hallar la prueba", danger: "La turba prepara piedras", allowedStats: ["courage", "mind"], actionChoices: [], ...overrides };
}
function fakeRoom(overrides = {}) {
  return { dangerClock: 7, phase: "pressure", mysteryClues: [], storyFlags: [], ...overrides };
}

test("1) Belo prioriza protect si Nicolás está en peligro", () => {
  assert.equal(personality.chooseBotIntent({ id: "bot-1", name: "Belo" }, fakeRoom(), fakeScene()), "protect");
});

test("2) Belo se interpone ante turba/pedrada", () => {
  const action = personality.buildBotActionFromIntent({ id: "bot-1", name: "Belo" }, "protect", "loyal");
  assert.match(action, /planta|Nicolás|turba/i);
});

test("3) Miri prioriza investigate si hay pista disponible", () => {
  assert.equal(personality.chooseBotIntent({ id: "bot-2", name: "Miri" }, fakeRoom({ dangerClock: 2 }), fakeScene({ objective: "Revisar la carta y la campana" })), "investigate");
});

test("4) Miri protege evidencia si la prueba está en riesgo", () => {
  const action = personality.buildBotActionFromIntent({ id: "bot-2", name: "Miri" }, "observe", "focused");
  assert.match(action, /protege la evidencia|observa/i);
});

test("5) Belo no toma acción fina de análisis si Miri está disponible", () => {
  const moment = personality.buildCompanionMoment({ id: "bot-1", name: "Belo" }, "protect", "loyal");
  assert.doesNotMatch(moment.action, /analiza|deduce|compara la mordida|lee la tinta/i);
});

test("6) Miri no tanquea si Belo está disponible", () => {
  const moment = personality.buildCompanionMoment({ id: "bot-2", name: "Miri" }, "investigate", "focused");
  assert.doesNotMatch(moment.action, /se planta delante de Nicolás|recibe la pedrada|tanquea/i);
});

test("7) companionMoment incluye intent/emotion/action", () => {
  const moment = personality.buildCompanionMoment({ id: "bot-1", name: "Belo" }, "confront", "angry");
  assert.equal(moment.botIntent, "confront");
  assert.equal(moment.botEmotion, "angry");
  assert.ok(moment.action.length > 20);
  assert.ok(moment.dialogue);
});

test("8) validateBotPersonalityConsistency detecta role drift", () => {
  const profile = personality.getBotPersonalityProfile("bot-2");
  const issues = personality.validateBotPersonalityConsistency({ characterId: "bot-2", characterName: "Miri", action: "Miri se planta delante de Nicolás y recibe la pedrada", emotion: "focused", relevance: "major", botIntent: "guard", botEmotion: "focused" }, profile);
  assert.ok(issues.includes("BOT_ROLE_DRIFT"));
});

test("9) bot memory recuerda clue vista", () => {
  const next = personality.updateBotMemoryAfterTurn({}, { unlockedClues: ["bell-after-death"], consequenceText: "La campana sonó tarde" });
  assert.ok(next["bot-1"].seenClueIds.includes("bell-after-death"));
});

test("10) bot memory recuerda NPC sospechado", () => {
  const next = personality.updateBotMemoryAfterTurn({}, { structuredNarration: { dialogue: [{ speakerId: "tomas", intention: "dudar contradicción" }] } });
  assert.ok(next["bot-2"].suspectedNpcIds.includes("tomas"));
});

test("11) simulateNarrativeRun genera companionMoments no genéricos", async () => {
  const report = await simulation.simulateNarrativeRun({ campaignId: "red-moon-killer", maxTurns: 8, seed: 42, useGroq: false, playerName: "Fiamy" });
  const moments = report.turns.flatMap((turn) => turn.structuredNarration?.companionMoments ?? []);
  assert.ok(moments.length > 0);
  for (const moment of moments) assert.doesNotMatch(moment.action, /^.*(ayuda al grupo|hace algo|se mantiene cerca).*$/i);
});

test("12) createBotPlayers mantiene perfiles Belo/Miri", () => {
  const [belo, miri] = bots.createBotPlayers(2);
  assert.equal(personality.getBotPersonalityProfile(belo.id).name, "Belo");
  assert.equal(personality.getBotPersonalityProfile(miri.id).name, "Miri");
});
