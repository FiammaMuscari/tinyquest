import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const dir = join(tmpdir(), `tinyquest-llm-budget-${process.pid}`);
await mkdir(dir, { recursive: true });
let source = await readFile(new URL("../packages/ai-master/src/llm-budget.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
await writeFile(join(dir, "llm-budget.mjs"), outputText);
const budget = await import(`file://${join(dir, "llm-budget.mjs")}`);

function plan(overrides = {}) {
  return {
    turnId: "turn-1",
    actorId: "player-1",
    actorName: "Fiamy",
    actorKind: "player",
    actionText: "Interrogar a Tomás sobre la campana",
    roll: { die: "d20", value: 8, total: 10, dc: 12, result: "partial" },
    scene: { id: "chapel", title: "Capilla", location: "capilla", phase: "pressure", dangerBefore: 5, dangerAfter: 6 },
    validContext: { presentNpcIds: ["tomas"], presentObjectIds: ["bell"], knownClueIds: [], availableClueIds: ["bell-after-death"], allowedStats: ["mind"], allowedTargetKinds: ["npc"], targetKind: "npc", targetId: "tomas", usedObjectIds: ["bell"] },
    mustHappen: ["Tomás se contradice sobre la campana."],
    mustNotHappen: ["No revelar que Nicolás es inocente todavía."],
    consequence: { summary: "Tomás mira la campana antes de responder y contradice su horario.", physicalChange: "La campana queda bajo sospecha.", socialChange: "Tomás pierde seguridad.", emotionalChange: "Fiamy gana iniciativa." },
    cluePolicy: { canRevealNewClue: true, allowedClueIds: ["bell-after-death"], forbiddenClueIds: [], clueRevealMode: "partial" },
    npcDirectives: [{ npcId: "tomas", name: "Tomás", canSpeak: true, allowedIntentions: ["dudar"], forbiddenClaims: [] }],
    botDirectives: [{ botId: "bot-1", name: "Belo", emotionalState: "alerta", allowedActions: ["Belo bloquea la puerta"], botIntent: "protect", botEmotion: "loyal" }],
    uiFocus: { mainEvent: "Tomás se contradice", highlight: "dialogue", showAs: "social_pressure" },
    memoryPatch: { factsToRemember: [], factsToUpdate: [] },
    continuityWarnings: [],
    ...overrides
  };
}

test("1) shouldCallGroq bloquea si no hay API key", () => {
  const oldGroq = process.env.GROQ_API_KEY;
  const oldVite = process.env.VITE_GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.VITE_GROQ_API_KEY;
  try {
    const decision = budget.shouldCallGroq(plan(), budget.DEFAULT_CHEAP_LLM_POLICY, budget.createLlmBudgetState());
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "missing-groq-api-key");
  } finally {
    if (oldGroq) process.env.GROQ_API_KEY = oldGroq;
    if (oldVite) process.env.VITE_GROQ_API_KEY = oldVite;
  }
});

test("2) shouldCallGroq bloquea bots cuando useGroqForBotTurns=false", () => {
  const decision = budget.shouldCallGroq(plan({ actorId: "bot-1", actorKind: "bot" }), { ...budget.DEFAULT_CHEAP_LLM_POLICY, useGroqForBotTurns: false }, budget.createLlmBudgetState(), true);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "bot-turns-disabled");
});

test("3) shouldCallGroq permite turno player major", () => {
  const decision = budget.shouldCallGroq(plan(), budget.DEFAULT_CHEAP_LLM_POLICY, budget.createLlmBudgetState(), true);
  assert.equal(decision.allowed, true);
});

test("4) shouldCallGroq bloquea maxCallsPerRun", () => {
  const state = budget.createLlmBudgetState({ callsUsed: budget.DEFAULT_CHEAP_LLM_POLICY.maxCallsPerRun });
  const decision = budget.shouldCallGroq(plan(), budget.DEFAULT_CHEAP_LLM_POLICY, state, true);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "max-calls-per-run");
});

test("5) shouldCallGroq bloquea maxCallsPerScene", () => {
  const state = budget.createLlmBudgetState({ callsUsed: 1, callsUsedByScene: { chapel: budget.DEFAULT_CHEAP_LLM_POLICY.maxCallsPerScene } });
  const decision = budget.shouldCallGroq(plan(), budget.DEFAULT_CHEAP_LLM_POLICY, state, true);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "max-calls-per-scene");
});

test("6-8) prompt compacto contiene contrato y respeta maxPromptChars", () => {
  const prompt = budget.buildCompactGroqPrompt(plan());
  assert.match(prompt, /Tomás se contradice/);
  assert.match(prompt, /No revelar/);
  assert.match(prompt, /Tomás mira la campana/);
  assert.ok(prompt.length <= budget.DEFAULT_CHEAP_LLM_POLICY.maxPromptChars);
  assert.doesNotMatch(prompt, /recentSessionLog|sessionLog|memorySummary|campaignStory/);
});

test("8b) optionsToLabel ancla cada opción a su entidad real con estado, intent y risk", () => {
  const input = {
    recentSessionLog: [],
    selectedCampaign: {
      npcs: [{ id: "lena-subofficer", name: "Lena" }],
      enemies: [],
      storyObjects: [{ id: "cuaderno-carvell-object", name: "cuaderno de Carvell", status: "hidden" }]
    },
    visibleOptions: [
      { id: "hablar-lena", label: "Encontrar a Lena antes de que Bran la vea", npcId: "lena-subofficer", targetKind: "npc", intent: "negotiate", riskLevel: "medium" },
      { id: "buscar-cuaderno", label: "Buscar el cuaderno de Carvell", objectId: "cuaderno-carvell-object", targetKind: "object", intent: "investigate", riskLevel: "high" }
    ]
  };
  const prompt = budget.buildCompactGroqPrompt(plan(), budget.DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, input);
  const parsed = JSON.parse(prompt);
  const lena = parsed.optionsToLabel.find((o) => o.id === "hablar-lena");
  assert.equal(lena.target, "Lena");
  assert.equal(lena.intent, "negotiate");
  assert.equal(lena.risk, "medium");
  const cuaderno = parsed.optionsToLabel.find((o) => o.id === "buscar-cuaderno");
  assert.equal(cuaderno.target, "cuaderno de Carvell");
  assert.equal(cuaderno.targetState, "hidden");
});

test("9) cacheKey cambia si cambia consequence.summary", () => {
  const one = budget.getNarrationCacheKey(plan());
  const two = budget.getNarrationCacheKey(plan({ consequence: { ...plan().consequence, summary: "Otra consecuencia concreta." } }));
  assert.notEqual(one, two);
});

test("10) recordSkippedCall registra fallback esperado cuando Groq no está permitido", () => {
  const state = budget.createLlmBudgetState();
  const p = plan({ actorId: "bot-1", actorKind: "bot" });
  const decision = budget.shouldCallGroq(p, { ...budget.DEFAULT_CHEAP_LLM_POLICY, useGroqForBotTurns: false }, state, true);
  assert.equal(decision.allowed, false);
  budget.recordSkippedCall(state, p, decision.reason);
  assert.deepEqual(state.skippedCalls[0], { reason: "bot-turns-disabled", actorId: "bot-1", sceneId: "chapel", turnId: "turn-1" });
});

test("8c) hiddenTies viaja como subtexto solo cuando el NPC tiene relaciones secretas", () => {
  const input = {
    recentSessionLog: [],
    selectedCampaign: {
      npcs: [
        { id: "brisa", name: "Brisa Salobre", relationshipToOtherNPCs: { practico: "Le compró el silencio con el nombre de su hermano" } },
        { id: "practico", name: "El Práctico Mudo" }
      ],
      enemies: [],
      storyObjects: []
    }
  };
  const bundle = {
    hardFacts: ["Brisa duda antes de responder."],
    forbiddenFacts: [],
    presentNpcs: [
      { id: "brisa", name: "Brisa Salobre", currentAttitude: "tensa", plausibleGestures: ["seca la misma jarra dos veces"] },
      { id: "practico", name: "El Práctico Mudo", currentAttitude: "vigilante", plausibleGestures: [] }
    ],
    loadedObjects: [],
    sensoryMotifs: [],
    recentNarrationOpenings: []
  };
  const prompt = budget.buildCompactGroqPrompt(plan(), budget.DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, input, bundle);
  const parsed = JSON.parse(prompt);
  const brisa = parsed.scene.npcs.find((n) => n.name === "Brisa Salobre");
  assert.deepEqual(brisa.hiddenTies, ["El Práctico Mudo: Le compró el silencio con el nombre de su hermano"]);
  const practico = parsed.scene.npcs.find((n) => n.name === "El Práctico Mudo");
  assert.equal(practico.hiddenTies, undefined);
  assert.ok(parsed.rules.some((r) => r.includes("hiddenTies")));
});

test("8d) sin relaciones secretas no se gasta la regla de hiddenTies", () => {
  const prompt = budget.buildCompactGroqPrompt(plan(), budget.DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, { recentSessionLog: [] });
  const parsed = JSON.parse(prompt);
  assert.ok(!parsed.rules.some((r) => r.includes("hiddenTies")));
});

test("8e) las pistas plantadas viajan en clue.plantadas con su regla, solo si existen", () => {
  const input = {
    recentSessionLog: [],
    selectedCampaign: {
      npcs: [], enemies: [], storyObjects: [],
      clues: [
        { id: "bell-after-death", text: "La campana sonó después de la muerte.", isFalse: true },
        { id: "clue-real", text: "Una pista verdadera." }
      ]
    }
  };
  const prompt = budget.buildCompactGroqPrompt(plan(), budget.DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, input);
  const parsed = JSON.parse(prompt);
  assert.deepEqual(parsed.turn.clue.plantadas, ["bell-after-death"]);
  assert.ok(parsed.rules.some((r) => r.includes("plantadas")));
  // sin pistas falsas: ni campo ni regla
  const clean = JSON.parse(budget.buildCompactGroqPrompt(plan(), budget.DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, { recentSessionLog: [], selectedCampaign: { npcs: [], enemies: [], storyObjects: [], clues: [{ id: "bell-after-death", text: "real" }] } }));
  assert.equal(clean.turn.clue.plantadas, undefined);
  assert.ok(!clean.rules.some((r) => r.includes("plantadas")));
});

test("8f) actorSkill: el arma/oficio del héroe viaja al narrador solo en turnos de jugador", () => {
  const input = { recentSessionLog: [], character: { specialAbility: "Dagas Gemelas: si el primer golpe falla, el segundo convierte la falla en éxito parcial. Ganzúas de hueso." } };
  const parsed = JSON.parse(budget.buildCompactGroqPrompt(plan(), budget.DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, input));
  assert.ok(parsed.turn.actorSkill.includes("Dagas Gemelas"));
  assert.ok(parsed.rules.some((r) => r.includes("actorSkill")));
  // turno de bot: sin actorSkill ni regla
  const botTurn = JSON.parse(budget.buildCompactGroqPrompt(plan({ actorKind: "bot", actorId: "bot-1" }), budget.DEFAULT_CHEAP_LLM_POLICY.maxPromptChars, input));
  assert.equal(botTurn.turn.actorSkill, undefined);
  assert.ok(!botTurn.rules.some((r) => r.includes("actorSkill")));
});
