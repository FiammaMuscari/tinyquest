import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const key = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
if (!key) {
  console.log(JSON.stringify({
    skipped: true,
    reason: "GROQ_API_KEY/VITE_GROQ_API_KEY no está configurada. Smoke test omitido sin fallar.",
    callsUsed: 0,
    groqCalls: 0,
    skippedCalls: [{ reason: "missing-groq-api-key" }],
    cacheHits: 0,
    fallbackUses: 0,
    turns: []
  }, null, 2));
  process.exit(0);
}

const maxTurns = Number(process.env.GROQ_SMOKE_TURNS ?? 3);
const campaignId = process.env.GROQ_SMOKE_CAMPAIGN ?? "red-moon-killer";
const outRoot = join(tmpdir(), `tinyquest-groq-smoke-${process.pid}`);

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

async function transpileTree(sourceRoot, targetRoot, replacements = {}) {
  const sourceFiles = await walk(sourceRoot);
  for (const sourceFile of sourceFiles) {
    const rel = relative(sourceRoot, sourceFile);
    const outFile = join(targetRoot, rel).replace(/\.ts$/, ".mjs");
    await mkdir(dirname(outFile), { recursive: true });
    let source = rewriteRelativeImports(await readFile(sourceFile, "utf8"));
    for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
    await writeFile(outFile, outputText);
  }
  for (const sourceFile of sourceFiles.filter((file) => file.endsWith("/index.ts"))) {
    const dirRel = relative(sourceRoot, dirname(sourceFile));
    if (!dirRel) continue;
    const aliasFile = join(targetRoot, `${dirRel}.mjs`);
    await mkdir(dirname(aliasFile), { recursive: true });
    await writeFile(aliasFile, `export * from "./${dirRel.split("/").at(-1)}/index.mjs";\n`);
  }
}

await mkdir(outRoot, { recursive: true });
await mkdir(join(outRoot, "node_modules"), { recursive: true });
try { await symlink(new URL("../node_modules/zod", import.meta.url).pathname, join(outRoot, "node_modules/zod"), "dir"); } catch {}

const gameRoot = new URL("../packages/game-engine/src", import.meta.url).pathname;
const aiRoot = new URL("../packages/ai-master/src", import.meta.url).pathname;
const gameOut = join(outRoot, "game-engine");
const aiOut = join(outRoot, "ai-master");
await transpileTree(gameRoot, gameOut);
await transpileTree(aiRoot, aiOut, {
  'from "@tiny-quest/game-engine"': `from "${join(gameOut, "index.mjs")}"`,
  "from '@tiny-quest/game-engine'": `from "${join(gameOut, "index.mjs")}"`
});

const engine = await import(`file://${join(gameOut, "index.mjs")}`);
const bots = await import(`file://${join(gameOut, "bots.mjs")}`);
const roomState = await import(`file://${join(gameOut, "room-state.mjs")}`);
const contract = await import(`file://${join(aiOut, "narration-contract.mjs")}`);
const { GroqDungeonMasterProvider } = await import(`file://${join(aiOut, "groq-dungeon-master.mjs")}`);

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function withSeededRandom(random, fn) {
  const previous = Math.random;
  Math.random = random;
  try { return fn(); } finally { Math.random = previous; }
}

function pickAction(room, turn) {
  const scene = roomState.getCurrentScene(room);
  const actor = roomState.getActivePlayer(room);
  const choices = roomState.getVisibleActionChoices(scene, room);
  if (actor.type === "bot") {
    const decision = bots.chooseBotAction(room, actor);
    const selected = choices.find((choice) => choice.action === decision.label || choice.label === decision.label || decision.label.includes(choice.label));
    const stat = selected?.recommendedStats?.find((candidate) => scene.allowedStats.includes(candidate)) ?? (scene.allowedStats.includes(decision.suggestedStat) ? decision.suggestedStat : scene.allowedStats[0]);
    return { action: selected?.action ?? decision.label, stat };
  }
  const choice = choices[(turn + 1) % Math.max(1, choices.length)];
  return { action: choice?.action ?? scene.objective, stat: choice?.recommendedStats?.find((candidate) => scene.allowedStats.includes(candidate)) ?? scene.allowedStats[0] };
}

function analyzeTurn(turn, output, plan) {
  const warnings = [...(output?.continuityWarnings ?? [])];
  const issues = contract.validateDungeonNarrationOutput(output, plan);
  warnings.push(...issues.map((issue) => `${issue.code}: ${issue.message}`));
  if (!output.narration.includes(plan.consequence.summary.slice(0, 24))) warnings.push("narration no menciona claramente consequence.summary");
  if (!output.uiFocus?.mainText) warnings.push("uiFocus vacío o inútil");
  if (output.companionMoments?.some((moment) => /ayuda|apoya|hace algo/i.test(moment.action) && moment.action.length < 40)) warnings.push("companionMoment genérico");
  return {
    turn,
    actor: plan.actorName,
    action: plan.actionText,
    roll: `${plan.roll.total} vs ${plan.roll.dc}`,
    result: plan.roll.result,
    resolutionConsequence: plan.consequence.summary,
    mustHappen: plan.mustHappen,
    mustNotHappen: plan.mustNotHappen,
    narration: output.narration,
    dialogue: output.dialogue,
    companionMoments: output.companionMoments,
    structuredConsequence: output.consequence.summary,
    dangerChange: output.dangerChange,
    uiFocus: output.uiFocus,
    continuityWarnings: output.continuityWarnings,
    repairsApplied: output.continuityWarnings.length,
    warnings
  };
}

const campaign = engine.campaigns.find((item) => item.id === campaignId) ?? engine.defaultCampaign;
let room = engine.createGameRoom({ selectedCampaign: campaign, humanCharacter: engine.createCharacter({ name: "Fiamy" }), botCount: 2, id: `groq-smoke-${Date.now()}` });
const provider = new GroqDungeonMasterProvider({
  GROQ_API_KEY: key,
  GROQ_MODEL: process.env.GROQ_MODEL,
  policy: { maxCallsPerRun: Number(process.env.GROQ_MAX_CALLS ?? 3), maxCallsPerScene: 2, useGroqForBotTurns: false }
});
const random = seeded(Number(process.env.GROQ_SMOKE_SEED ?? 20260620));
const turns = [];

for (let index = 0; index < maxTurns && !room.sessionComplete; index += 1) {
  const selected = pickAction(room, index);
  const resolution = withSeededRandom(random, () => engine.resolvePlayerAction(room, selected.action, selected.stat));
  const plan = resolution.narrationRequest.resolutionPlan;
  const narration = await provider.generateNarration(resolution.narrationRequest);
  if (!narration.structuredNarration) throw new Error("Groq response did not produce structuredNarration.");
  turns.push(analyzeTurn(index + 1, narration.structuredNarration, plan));
  room = engine.applyNarration(room, resolution, narration);
}

const warnings = turns.flatMap((turn) => turn.warnings);
const counts = new Map();
for (const warning of warnings) counts.set(warning, (counts.get(warning) ?? 0) + 1);
const repeatedProblems = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([message, count]) => ({ message, count }));
const obeyed = warnings.length === 0;
const recommendation = obeyed
  ? "Groq obedeció el contrato en esta muestra corta; mantener el repair como guardrail."
  : "Reforzar en prompt/repair los problemas repetidos listados abajo antes de exponer structuredNarration en UI.";

const budget = provider.getBudgetSnapshot();
console.log(JSON.stringify({
  obeyed,
  groqCalls: budget.state.callsUsed,
  callsUsed: budget.state.callsUsed,
  skippedCalls: budget.state.skippedCalls,
  cacheHits: budget.cacheHits,
  fallbackUses: budget.fallbackUses,
  totalRepairsApplied: turns.reduce((total, turn) => total + turn.repairsApplied, 0),
  repeatedProblems,
  recommendation,
  turns
}, null, 2));
