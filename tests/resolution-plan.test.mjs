import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpile(src, out, replacements = {}) {
  let source = await readFile(new URL(src, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(out, outputText);
}

const dir = join(tmpdir(), `tinyquest-resolution-${process.pid}`);
await mkdir(dir, { recursive: true });
await transpile("../packages/game-engine/src/consequence-builder.ts", join(dir, "consequence-builder.mjs"), {
  'from "./resolution-plan"': 'from "./resolution-plan.mjs"',
  'from "./context-coherence"': 'from "./context-coherence.mjs"'
});
await transpile("../packages/game-engine/src/context-coherence.ts", join(dir, "context-coherence.mjs"));
await transpile("../packages/game-engine/src/bot-personality.ts", join(dir, "bot-personality.mjs"));
await transpile("../packages/game-engine/src/resolution-plan.ts", join(dir, "resolution-plan.mjs"), {
  'from "./consequence-builder"': 'from "./consequence-builder.mjs"',
  'from "./context-coherence"': 'from "./context-coherence.mjs"',
  'from "./bot-personality"': 'from "./bot-personality.mjs"'
});
const {
  buildResolutionPlan,
  validateResolutionPlan,
  validatePhase,
  validateCluePolicy,
  validateNpcDirectives,
  validateBotDirectives,
  validateConsequence,
  validateValidContext
} = await import(`file://${join(dir, "resolution-plan.mjs")}`);

const { buildMechanicalConsequence, isGenericMechanicalConsequence } = await import(`file://${join(dir, "consequence-builder.mjs")}`);

const campaign = {
  clues: [
    { id: "seal-flour", text: "El sello tiene harina vieja." },
    { id: "bell-beast", text: "La Bestia reacciona a la campana." },
    { id: "secret-ending", text: "Final secreto no disponible." }
  ],
  npcs: [{ id: "roldan", name: "Alcalde Roldán", role: "alcalde" }],
  storyObjects: [{ id: "moon-seal", name: "Sello lunar", location: "Molino", relatedClues: ["seal-flour"] }]
};

function makeInput({ outcome = "success", unlockedClueIds = ["seal-flour"], dangerBefore = 3, dangerAfter = 4, phase = "investigation", selectedChoice = {} } = {}) {
  return {
    roomBefore: {
      id: "room-a",
      turn: 2,
      dangerClock: dangerBefore,
      campaign,
      mysteryClues: [],
      memorySummary: { forbiddenContradictions: ["No decir que la cuchilla mató a Nicolás."] },
      players: [{ id: "bot-miri", type: "bot", name: "Miri", status: "ready", character: { concept: "protectora cautelosa" } }]
    },
    roomAfter: { dangerClock: dangerAfter },
    scene: {
      id: "mill",
      title: "Molino",
      clueIds: ["seal-flour", "bell-beast"],
      npcIds: ["roldan"],
      allowedStats: ["mind", "charm", "courage"]
    },
    actor: { id: "fiamy", name: "Fiamy", type: "player" },
    actionText: "Usar el sello para revelar la verdad profunda",
    selectedStat: "mind",
    check: {
      outcome,
      total: outcome === "failure" ? 8 : outcome === "partial_success" ? 13 : 18,
      difficulty: 15,
      d20: { value: outcome === "failure" ? 6 : outcome === "partial_success" ? 11 : 16 },
      rollBreakdown: { statModifier: 2, d4Bonus: 0, flatBonus: 0, penalties: 0 }
    },
    consequence: { text: outcome === "failure" ? "La turba interpreta mal el sello y Roldán gana unos segundos." : outcome === "partial_success" ? "El sello apunta al molino, pero la turba empieza a rodear a Fiamy." : "La harina vieja del sello conecta la acusación con el molino." },
    selectedChoice: { id: "use-seal", actionType: "usar_objeto", targetKind: "object", targetId: "moon-seal", objectId: "moon-seal", possibleOutcomeHint: undefined, ...selectedChoice },
    phase,
    structuredOptions: [{ id: "protect-proof", label: "Proteger el sello en la capilla", intent: "proteger_prueba", suggestedStat: "courage", risk: "medio", availableInPhase: ["pressure"] }],
    unlockedClueIds,
    damagedClueIds: outcome === "failure" ? ["seal-flour"] : [],
    canAdvanceScene: outcome !== "failure",
    canTriggerEnding: false,
    stateChanges: [],
    npcReactions: ["roldan: confianza 1"]
  };
}

function basePlan(overrides = {}) {
  return {
    turnId: "t1",
    actorId: "fiamy",
    actorName: "Fiamy",
    actorKind: "player",
    actionText: "Accusar a Roldán",
    roll: { die: "d20", value: 8, total: 8, dc: 15, result: "failure" },
    scene: { id: "mill", title: "Molino", phase: "investigation", location: "Molino", dangerBefore: 3, dangerAfter: 4 },
    validContext: { presentNpcIds: ["roldan"], presentObjectIds: ["moon-seal"], knownClueIds: [], availableClueIds: ["seal-flour"], allowedStats: ["mind"], allowedTargetKinds: ["npc"], targetKind: "npc", targetId: "roldan", usedObjectIds: [] },
    mustHappen: [],
    mustNotHappen: [],
    consequence: { summary: "Roldán gana tiempo y la turba empuja a Fiamy hacia la puerta." },
    cluePolicy: { canRevealNewClue: false, allowedClueIds: [], forbiddenClueIds: [], clueRevealMode: "none" },
    npcDirectives: [{ npcId: "roldan", name: "Alcalde Roldán", canSpeak: true, allowedIntentions: ["deflect"], forbiddenClaims: [] }],
    botDirectives: [],
    uiFocus: { mainEvent: "Roldán gana tiempo", highlight: "consequence", showAs: "failed_attempt" },
    memoryPatch: { factsToRemember: [], factsToUpdate: [] },
    continuityWarnings: [],
    ...overrides
  };
}

test("A) failure no revela pista completa", () => {
  const plan = buildResolutionPlan(makeInput({ outcome: "failure", unlockedClueIds: ["seal-flour"] }));
  assert.equal(plan.cluePolicy.canRevealNewClue, false);
  assert.equal(plan.cluePolicy.clueRevealMode, "none");
  assert.deepEqual(plan.cluePolicy.allowedClueIds, []);
  assert.equal(validateCluePolicy(plan).some((issue) => issue.level === "error"), false);
});

test("B) partial revela pista parcial con coste", () => {
  const plan = buildResolutionPlan(makeInput({ outcome: "partial_success", unlockedClueIds: ["seal-flour"], dangerBefore: 4, dangerAfter: 6 }));
  assert.equal(plan.cluePolicy.clueRevealMode, "partial");
  assert.deepEqual(plan.cluePolicy.allowedClueIds, ["seal-flour"]);
  assert.match(plan.mustHappen.join("\n"), /avance con coste/i);
});

test("C) success revela solo pista válida disponible", () => {
  const plan = buildResolutionPlan(makeInput({ outcome: "success", unlockedClueIds: ["seal-flour", "secret-ending"] }));
  assert.equal(plan.cluePolicy.clueRevealMode, "full");
  assert.deepEqual(plan.cluePolicy.allowedClueIds, ["seal-flour"]);
});

test("D) no climax con danger bajo", () => {
  const issues = validatePhase(basePlan({ scene: { id: "mill", title: "Molino", phase: "climax", location: "Molino", dangerBefore: 3, dangerAfter: 5 } }));
  assert.ok(issues.some((issue) => issue.code === "climax-danger-low" && issue.level === "error"));
});

test("E) no NPC incorrecto hablando", () => {
  const issues = validateNpcDirectives(basePlan({ npcDirectives: [{ npcId: "nicolas", name: "Nicolás", canSpeak: true, allowedIntentions: [], forbiddenClaims: [] }] }));
  assert.ok(issues.some((issue) => issue.code === "npc-not-present"));
});

test("F) no objeto inexistente", () => {
  const issues = validateValidContext(basePlan({ validContext: { ...basePlan().validContext, allowedTargetKinds: ["object"], targetKind: "object", targetId: "silver-knife", usedObjectIds: ["silver-knife"] } }));
  assert.ok(issues.some((issue) => issue.code === "object-not-present"));
});

test("G) bot genérico se marca para reemplazo por acción concreta", () => {
  const issues = validateBotDirectives(basePlan({ botDirectives: [{ botId: "bot", name: "Miri", personality: "cauta", emotionalState: "alerta", currentGoal: "ayudar", allowedActions: ["Proteger lo conseguido"], forbiddenActions: [] }] }));
  assert.ok(issues.some((issue) => issue.code === "generic-bot-action"));
});

test("H) consequence genérica se marca como warning", () => {
  const issues = validateConsequence(basePlan({ consequence: { summary: "Lo ocurrido antes cambia la posición de alguien." } }));
  assert.ok(issues.some((issue) => issue.code === "generic-consequence"));
});

test("I) crisis/action targetKind inválido se detecta", () => {
  const issues = validateResolutionPlan(basePlan({ actionText: "crisis-accuse", validContext: { ...basePlan().validContext, allowedTargetKinds: ["npc"], targetKind: "scene", targetId: "mill" } })).issues;
  assert.ok(issues.some((issue) => issue.code === "invalid-target-kind"));
});

test("J) prompt de Groq incluye ResolutionPlan y mustNotHappen", async () => {
  const source = await readFile(new URL("../packages/ai-master/src/prompt-builder.ts", import.meta.url), "utf8");
  assert.match(source, /ResolutionPlan/);
  assert.match(source, /mustNotHappen/);
  assert.match(source, /consequence\.summary/);
  assert.match(source, /roll\.result/);
});


test("K) success genera ventaja específica, no ventaja concreta", () => {
  const plan = buildResolutionPlan(makeInput({ outcome: "success", selectedChoice: { actionType: "interrogar_npc", targetKind: "npc", targetId: "roldan", npcId: "roldan" } }));
  assert.doesNotMatch(plan.consequence.summary, /ventaja concreta/i);
  assert.match(plan.consequence.summary, /Roldán|Fiamy|Sello lunar|sello/i);
  assert.equal(validateConsequence(plan).some((issue) => issue.code === "generic-consequence"), false);
});

test("L) partial genera avance + coste específico", () => {
  const plan = buildResolutionPlan(makeInput({ outcome: "partial_success", dangerBefore: 4, dangerAfter: 6 }));
  assert.doesNotMatch(plan.consequence.summary, /avanza pero con presión|presión narrativa/i);
  assert.match(plan.consequence.summary, /pero/i);
  assert.ok(plan.consequence.cost || plan.consequence.socialChange || plan.consequence.physicalChange);
});

test("M) failure genera complicación específica", () => {
  const plan = buildResolutionPlan(makeInput({ outcome: "failure", dangerBefore: 6, dangerAfter: 7 }));
  assert.doesNotMatch(plan.consequence.summary, /complicación concreta/i);
  assert.ok(plan.consequence.complication || plan.consequence.socialChange || plan.consequence.physicalChange);
});

test("N) peligro alto genera dangerManifestation física", () => {
  const consequence = buildMechanicalConsequence({
    actorId: "fiamy",
    actorName: "Fiamy",
    actorKind: "player",
    actionText: "Usar el sello lunar",
    result: "failure",
    scene: { id: "mill", title: "Molino", location: "Molino", phase: "climax", dangerBefore: 8, dangerAfter: 9 },
    validContext: { presentNpcIds: ["roldan"], presentObjectIds: ["moon-seal"], availableClueIds: ["seal-flour"], knownClueIds: [] },
    roll: { total: 8, dc: 15 },
    contextLabels: { npcs: { roldan: "Alcalde Roldán" }, objects: { "moon-seal": "Sello lunar" }, clues: { "seal-flour": "Harina vieja" } },
    target: { id: "moon-seal", kind: "object" }
  });
  assert.match(consequence.dangerManifestation ?? "", /turba|campana|piedra|testigos|salida/i);
});

test("O) consecuencia usa contexto presente y no inventa NPCs u objetos", () => {
  const plan = buildResolutionPlan(makeInput({ outcome: "failure" }));
  const allowed = /Roldán|Sello lunar|Molino|Fiamy|testigo|objeto observado|puerta|harina|umbral|multitud|campana|madera|grupo|miradas|escena|salida|evidencia|alguien|vista|iniciativa|confianza/i;
  assert.match(plan.consequence.summary, allowed);
  assert.doesNotMatch(plan.consequence.summary, /Nicolás|Mara|Irma|Elías|Bestia|cuchilla/i);
  assert.equal(isGenericMechanicalConsequence(plan.consequence.summary), false);
});

test("P) no usa clue title roto como objeto directo", () => {
  const consequence = buildMechanicalConsequence({
    actorId: "fiamy",
    actorName: "Fiamy",
    actorKind: "player",
    actionText: "Interrogar a Tomás sobre la campana",
    result: "partial",
    scene: { id: "mill", title: "Molino", location: "Molino", phase: "pressure", dangerBefore: 4, dangerAfter: 6 },
    validContext: { presentNpcIds: ["tomas"], presentObjectIds: ["bell"], availableClueIds: ["bell-after-death"], knownClueIds: [] },
    roll: { total: 13, dc: 15 },
    contextLabels: { npcs: { tomas: "Tomás" }, objects: { bell: "campana" }, clues: { "bell-after-death": "La campana sonó tarde" } }
  });
  assert.doesNotMatch(consequence.summary, /una parte de La campana sonó tarde/i);
  assert.doesNotMatch(consequence.summary, /para la escena|\bo aprovecha\b|\bpuede\b|\bpodría\b/i);
  assert.ok(consequence.clueEffect?.naturalDescription);
});

test("Q) failure elige una sola complicación sin alternativas", () => {
  const consequence = buildMechanicalConsequence({
    actorId: "fiamy",
    actorName: "Fiamy",
    actorKind: "player",
    actionText: "Usar el sello lunar",
    result: "failure",
    scene: { id: "bell", title: "Campana", location: "capilla", phase: "pressure", dangerBefore: 6, dangerAfter: 7 },
    validContext: { presentNpcIds: ["roldan"], presentObjectIds: ["moon-seal"], availableClueIds: ["moon-seal"], knownClueIds: [] },
    roll: { total: 8, dc: 15 },
    contextLabels: { npcs: { roldan: "Roldán" }, objects: { "moon-seal": "sello lunar" }, clues: { "moon-seal": "Sello lunar" } },
    target: { id: "moon-seal", kind: "object" }
  });
  assert.doesNotMatch(consequence.summary, /\bo aprovecha\b|\bo alguien\b|\bo lo\b|toca, lo tapa|puede|podría/i);
  assert.match(consequence.summary, /Roldán|sello lunar/);
});
