import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpile(src, out, replacements = {}) {
  let source = await readFile(new URL(src, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(out, outputText);
}

const dir = join(tmpdir(), `tinyquest-dungeon-contract-${process.pid}`);
await mkdir(dir, { recursive: true });
await mkdir(join(dir, "node_modules"), { recursive: true });
try { await symlink(new URL("../node_modules/zod", import.meta.url).pathname, join(dir, "node_modules/zod"), "dir"); } catch {}
await transpile("../packages/game-engine/src/context-coherence.ts", join(dir, "context-coherence.mjs"));
await writeFile(join(dir, "game-engine.mjs"), 'export { validateTurnContextCoherence } from "./context-coherence.mjs";\n');
await transpile("../packages/ai-master/src/narration-contract.ts", join(dir, "narration-contract.mjs"), {
  'from "@tiny-quest/game-engine"': 'from "./game-engine.mjs"'
});
const contract = await import(`file://${join(dir, "narration-contract.mjs")}`);

function plan(overrides = {}) {
  return {
    turnId: "t1",
    actorId: "player-1",
    actorName: "Fiamy",
    actorKind: "player",
    actionText: "Examinar la campana",
    roll: { die: "d20", value: 16, total: 18, dc: 12, result: "success" },
    scene: { id: "mill", title: "Molino", phase: "pressure", location: "Molino", dangerBefore: 2, dangerAfter: 3 },
    validContext: { presentNpcIds: ["tomas"], presentObjectIds: ["bell"], knownClueIds: [], availableClueIds: ["bell-after-death"], allowedStats: ["mind"], allowedTargetKinds: ["object"], targetKind: "object", targetId: "bell", usedObjectIds: ["bell"] },
    mustHappen: ["La campana muestra barro fresco."],
    mustNotHappen: ["No absolver a Nicolás todavía."],
    consequence: { summary: "Fiamy nota barro fresco en el badajo de la campana.", physicalChange: "La campana queda marcada como prueba.", socialChange: "Tomás baja la mirada.", emotionalChange: "Fiamy gana iniciativa.", dangerManifestation: "La multitud murmura sin avanzar.", clueEffect: { mode: "full", clueId: "bell-after-death", clueTitle: "La campana sonó tarde", naturalDescription: "El barro fresco contradice el horario oficial." } },
    cluePolicy: { canRevealNewClue: true, allowedClueIds: ["bell-after-death"], forbiddenClueIds: ["secret"], clueRevealMode: "full" },
    npcDirectives: [{ npcId: "tomas", name: "Tomás", canSpeak: true, allowedIntentions: ["dudar"], forbiddenClaims: [] }],
    botDirectives: [{ botId: "bot-1", name: "Belo", personality: "protector", emotionalState: "alerta", currentGoal: "proteger", allowedActions: ["Belo bloquea la puerta del molino"], forbiddenActions: [] }],
    uiFocus: { mainEvent: "Barro fresco en la campana", highlight: "clue", showAs: "quiet_discovery" },
    memoryPatch: { factsToRemember: ["La campana tiene barro fresco."], factsToUpdate: [] },
    continuityWarnings: [],
    ...overrides
  };
}

function validOutput(overrides = {}) {
  return {
    narration: "Fiamy levanta la vista hacia la campana y encuentra barro fresco en el badajo.",
    immediateAction: { actorId: "player-1", actorName: "Fiamy", text: "Examinar la campana" },
    rollPresentation: { total: 18, dc: 12, result: "success", label: "Éxito: 18 vs 12" },
    dialogue: [{ speakerId: "tomas", speakerName: "Tomás", speakerKind: "npc", line: "Eso no estaba ahí antes.", intention: "dudar" }],
    companionMoments: [{ characterId: "bot-1", characterName: "Belo", action: "Belo bloquea la puerta del molino", emotion: "alerta", relevance: "minor" }],
    consequence: { summary: "Fiamy nota barro fresco en el badajo de la campana.", physicalChange: "La campana queda marcada como prueba.", socialChange: "Tomás baja la mirada.", emotionalChange: "Fiamy gana iniciativa." },
    worldStateChange: { text: "Fiamy nota barro fresco en el badajo de la campana.", changedNpcIds: ["tomas"], changedObjectIds: ["bell"], changedClueIds: ["bell-after-death"] },
    dangerChange: { before: 2, after: 3, manifestation: "La multitud murmura sin avanzar." },
    clueReveals: [{ clueId: "bell-after-death", title: "La campana sonó tarde", mode: "full", text: "El barro fresco contradice el horario oficial." }],
    uiFocus: { mainText: "Barro fresco en la campana", highlight: "clue", cardType: "discovery", priority: "low" },
    memoryPatch: { factsToRemember: ["La campana tiene barro fresco."], factsToUpdate: [] },
    continuityWarnings: [],
    ...overrides
  };
}

test("1-2) prompt expresa el contrato de narración e incluye el ResolutionPlan", async () => {
  const source = await readFile(new URL("../packages/ai-master/src/prompt-builder.ts", import.meta.url), "utf8");
  assert.match(source, /ResolutionPlan/);
  assert.match(source, /enrichedOptions/);
  assert.match(source, /clueReveals/);
  assert.match(source, /memoryPatch/);
});

test("3) parser acepta JSON válido", () => {
  const out = contract.parseDungeonNarrationOutput(JSON.stringify(validOutput()), plan());
  assert.equal(out.rollPresentation.total, 18);
  assert.equal(out.consequence.summary, plan().consequence.summary);
});

test("4,9) parser usa fallback si JSON está roto y conserva consequence del plan", () => {
  const out = contract.parseDungeonNarrationOutput("{ roto", plan());
  assert.equal(out.consequence.summary, plan().consequence.summary);
  assert.equal(out.rollPresentation.result, "success");
});

test("5) repair elimina NPC inventado", () => {
  const out = contract.repairDungeonNarrationOutput(validOutput({ dialogue: [{ speakerId: "invented", speakerName: "Inventado", speakerKind: "npc", line: "hola", intention: "romper" }] }), plan());
  assert.deepEqual(out.dialogue, []);
  assert.ok(out.continuityWarnings.some((warning) => warning.includes("speaker")));
});

test("6) repair elimina clueReveal inválido", () => {
  const out = contract.repairDungeonNarrationOutput(validOutput({ clueReveals: [{ clueId: "secret", title: "Secreto", mode: "full", text: "x" }] }), plan());
  assert.deepEqual(out.clueReveals, []);
});

test("7) repair fuerza consequence del ResolutionPlan", () => {
  const out = contract.repairDungeonNarrationOutput(validOutput({ consequence: { summary: "Otra cosa" } }), plan());
  assert.equal(out.consequence.summary, plan().consequence.summary);
});

test("8) repair fuerza dangerChange real", () => {
  const out = contract.repairDungeonNarrationOutput(validOutput({ dangerChange: { before: 9, after: 10, manifestation: "inventado" } }), plan());
  assert.deepEqual(out.dangerChange, { before: 2, after: 3, manifestation: "La multitud murmura sin avanzar." });
});

test("10) legacy mantiene narration/consequence viejo", () => {
  const out = contract.parseDungeonNarrationOutput(JSON.stringify(validOutput()), plan());
  const legacy = contract.toLegacyNarrationFields(out);
  assert.equal(legacy.narration, out.narration);
  assert.equal(legacy.consequence, plan().consequence.summary);
  assert.ok(legacy.npcDialogue[0].includes("Tomás"));
});
