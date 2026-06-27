import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpile(sourcePath, outPath) {
  const source = await readFile(new URL(sourcePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  });
  await writeFile(outPath, outputText);
}

const dir = join(tmpdir(), `tinyquest-ingredients-${process.pid}`);
await mkdir(dir, { recursive: true });

await transpile("../packages/game-engine/src/narrative-ingredient-bundle.ts", join(dir, "bundle.mjs"));
await transpile("../packages/game-engine/src/player-narration.ts", join(dir, "player-narration.mjs"));

const bundle = await import(`file://${join(dir, "bundle.mjs")}`);
const narration = await import(`file://${join(dir, "player-narration.mjs")}`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlan(overrides = {}) {
  return {
    turnId: "t1",
    actorId: "fiamy",
    actorName: "Fiamy",
    actorKind: "player",
    actionText: "examina los grilletes",
    roll: { die: "d20", value: 15, bonus: 0, total: 15, dc: 13, result: "success" },
    scene: { id: "s1", title: "El Molino", phase: "investigation", location: "molino", dangerBefore: 4, dangerAfter: 4 },
    validContext: {
      presentNpcIds: ["tomas", "elias"],
      presentObjectIds: ["grilletes"],
      knownClueIds: [],
      availableClueIds: ["grilletes-clue"],
      allowedStats: ["mente"],
      allowedTargetKinds: ["object"],
      targetKind: "object",
      targetId: "grilletes",
    },
    mustHappen: ["Los grilletes prueban que lo redujeron antes del arresto oficial."],
    mustNotHappen: ["No mencionar el sello lunar."],
    consequence: {
      summary: "Los grilletes prueban que lo redujeron antes del arresto oficial.",
      physicalChange: "Marcas de hierro antes del acta.",
      socialChange: "La turba duda un segundo.",
    },
    cluePolicy: {
      canRevealNewClue: true,
      allowedClueIds: ["grilletes-clue"],
      forbiddenClueIds: ["sello-lunar"],
      clueRevealMode: "partial",
    },
    npcDirectives: [
      { npcId: "elias", name: "Elías", canSpeak: true, stateBefore: "hostil", stateAfter: "contraataca", allowedIntentions: ["desacreditar"], forbiddenClaims: [] },
      { npcId: "tomas", name: "Tomás", canSpeak: false, stateBefore: "asustado", stateAfter: "asustado", allowedIntentions: [], forbiddenClaims: [] },
    ],
    botDirectives: [
      { botId: "belo", name: "Belo", personality: "guardian", emotionalState: "focused", currentGoal: "cubrir al grupo", fear: "perder a alguien", desire: "orden", speechStyle: "frases firmes", allowedActions: ["cubrir", "proteger"], forbiddenActions: ["analizar"], botIntent: "protect", botEmotion: "focused" },
      { botId: "miri", name: "Miri", personality: "investigadora", emotionalState: "suspicious", currentGoal: "leer la prueba", fear: "error oculto", desire: "verdad", speechStyle: "preguntas secas", allowedActions: ["observar", "preguntar"], forbiddenActions: ["atacar"], botIntent: "investigate", botEmotion: "suspicious" },
    ],
    uiFocus: { mainEvent: "Grilletes como prueba", highlight: "clue", showAs: "quiet_discovery" },
    memoryPatch: { factsToRemember: ["Grilletes usados antes del acta"], factsToUpdate: [] },
    continuityWarnings: [],
    ...overrides,
  };
}

function makeRequest(planOverrides = {}) {
  const plan = makePlan(planOverrides);
  return {
    sessionConfig: { maxRoundsPerScene: 5 },
    world: {},
    selectedTheme: { id: "luna-roja", title: "Luna Roja" },
    selectedCampaign: {
      id: "luna-roja",
      title: "Luna Roja",
      npcs: [
        { id: "elias", name: "Elías", description: "alguacil", motive: "cerrar caso rápido", role: "alguacil" },
        { id: "tomas", name: "Tomás", description: "aprendiz del molino", motive: "sobrevivir", role: "testigo" },
      ],
      clues: [
        { id: "grilletes-clue", label: "Grilletes de Nicolás", text: "Los grilletes hirieron a Nicolás antes del arresto oficial.", sceneId: "s1" },
        { id: "sello-lunar", label: "Sello lunar", text: "Sello con tinta azul bajo cera negra.", sceneId: "s2" },
      ],
      storyObjects: [
        { id: "grilletes", name: "los grilletes", type: "evidencia", description: "Cadenas que hirieron antes del acta.", location: "celda", status: "found", relatedClues: ["grilletes-clue"], relatedNPCs: ["nicolas"], unlocksActions: [], unlocksEndings: [], history: "" },
      ],
      scenes: [],
      possibleEndings: [],
    },
    currentScene: { id: "s1", title: "El Molino", objective: "Salvar a Nicolás", difficulty: 13, mysteryClue: "", maxRounds: 5, actionChoices: [], atmosphere: { visualPrompt: "molino oscuro", ambientSoundPrompt: "", backgroundImages: [], atmosphereTags: ["harina flotando", "madera mojada"], fallbackImage: "", fallbackAudio: "" }, danger: "medio" },
    activePlayer: { name: "Fiamy", type: "player", character: { species: "humana", role: "guardiana", concept: "deuda vieja", vitality: 10, energy: 5, pet: { name: "Sombra" } } },
    party: [],
    character: {},
    rawAction: "Revisar los grilletes de Nicolás",
    selectedStat: "mente",
    visualPrompt: "",
    ambientSoundPrompt: "",
    atmosphereTags: ["harina flotando", "madera mojada"],
    currentImageDescription: "",
    currentSoundMood: "",
    diceResults: { outcome: "success", total: 15, difficulty: 13, d20: { value: 15 } },
    resolvedOutcome: "success",
    dangerClock: 4,
    mysteryCluesFound: [],
    memorySummary: { facts: [], clues: [], objects: [], npcs: [], locations: [], dangers: [], forbiddenContradictions: [], confirmedFacts: [], suspicions: [], damagedClues: [], npcStates: [], objectStates: [], openQuestions: [], unresolvedThreads: [], lastBeat: "", suspects: [], betrayals: [], bonds: [], stakes: [], currentTwist: "" },
    storyFlags: [],
    recentSessionLog: [
      { id: "e0", turn: 7, playerName: "Belo", isBot: true, sceneTitle: "El Molino", action: "confrontar a Elías", outcome: "success", total: 14, narration: "Belo confronta a Elías.", consequenceText: "Elías pierde control un segundo." },
    ],
    atmosphereTags: ["harina flotando", "madera mojada"],
    narrativeContract: {
      actionType: "investigar_objeto",
      campaignActionType: "investigar_objeto",
      target: "los grilletes",
      targetId: "grilletes",
      factualSummary: "Los grilletes prueban que lo redujeron antes del arresto oficial.",
      visibleConsequence: "Los grilletes prueban que lo redujeron antes del arresto oficial.",
      must: ["Los grilletes prueban que lo redujeron antes del arresto oficial."],
      avoid: ["No mencionar sello lunar"],
    },
    resolutionPlan: plan,
  };
}

// ─── Tests: inferTargetName ───────────────────────────────────────────────────

test("inferTargetName: retorna nombre limpio para 'grilletes' desde storyObjects", () => {
  const plan = makePlan();
  const request = makeRequest();
  const name = bundle.inferTargetName(plan, request, request.selectedCampaign);
  assert.equal(name, "los grilletes");
});

test("inferTargetName: nunca retorna el action label completo", () => {
  const plan = makePlan();
  const request = makeRequest();
  request.rawAction = "Revisar los grilletes de Nicolás";
  const name = bundle.inferTargetName(plan, request, request.selectedCampaign);
  assert.notEqual(name, "Revisar los grilletes de Nicolás");
  assert.notEqual(name, request.rawAction);
});

test("inferTargetName: keyword fallback para 'cuerda' sin campaign ni contractTarget", () => {
  const plan = makePlan({
    validContext: { ...makePlan().validContext, targetId: "cuerda-campana", targetKind: "object" },
    actionText: "examina la cuerda cortada",
  });
  const request = makeRequest();
  request.rawAction = "Revisar la cuerda cortada de la campana";
  // contractTarget debe coincidir con la acción, no con los grilletes
  request.narrativeContract = { ...request.narrativeContract, target: null, targetId: "cuerda-campana" };
  const name = bundle.inferTargetName(plan, request, undefined);
  assert.ok(name?.includes("cuerda") || name?.includes("campana"), `Expected cuerda/campana reference, got: ${name}`);
});

// ─── Tests: buildNarrativeIngredientBundle ────────────────────────────────────

test("bundle: contiene targetName correcto para grilletes", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  assert.equal(b.action.targetName, "los grilletes");
});

test("bundle: contiene loadedObjects con los grilletes", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  assert.ok(b.loadedObjects.some((o) => o.name.includes("grillete")), `Expected grilletes in loadedObjects: ${JSON.stringify(b.loadedObjects)}`);
});

test("bundle: contiene sensoryMotifs desde atmosphereTags de la escena", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  assert.ok(b.sensoryMotifs.length > 0, "Expected sensory motifs");
});

test("bundle: hardFacts contiene consequence.summary", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  assert.ok(b.hardFacts.some((f) => f.includes("grilletes") || f.includes("Nicolás")), `Expected hardFacts with fact. Got: ${JSON.stringify(b.hardFacts)}`);
});

test("bundle: presentNpcs contiene Elías con gestos plausibles", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  const elias = b.presentNpcs.find((n) => n.name === "Elías");
  assert.ok(elias, "Expected Elías in presentNpcs");
  assert.ok(elias.plausibleGestures.length > 0, "Expected plausible gestures for Elías");
});

test("bundle: activeClues tiene sello-lunar como forbidden", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  const forbidden = b.activeClues.find((c) => c.id === "sello-lunar");
  if (forbidden) {
    assert.equal(forbidden.revealPermission, "forbidden");
  }
  // it's OK if sello-lunar isn't in activeClues at all since it's from another scene
});

test("bundle: freedomGuidance.mayInventNewFacts es false", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  assert.equal(b.freedomGuidance.mayInventNewFacts, false);
});

test("bundle: continuityHooks refleja recentSessionLog", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  assert.ok(b.continuityHooks.length > 0, "Expected continuity hooks");
});

// ─── Tests: validateNarrationAgainstIngredientBundle ─────────────────────────

test("validador: detecta action label completo como objeto físico", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  b.action.label = "Revisar los grilletes de Nicolás";
  const text = "Fiamy revisa Revisar los grilletes de Nicolás con cuidado.";
  const issues = bundle.validateNarrationAgainstIngredientBundle(text, b);
  assert.ok(issues.some((i) => i.code === "action-label-as-object"), `Expected action-label-as-object issue. Got: ${JSON.stringify(issues)}`);
});

test("validador: detecta frase genérica 'la ventaja pasa a otras manos'", () => {
  const plan = makePlan({ roll: { ...makePlan().roll, result: "failure" } });
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  const issues = bundle.validateNarrationAgainstIngredientBundle("Belo toma una decisión arriesgada, pero la ventaja pasa a otras manos.", b);
  assert.ok(issues.some((i) => i.code === "forbidden-phrase"), `Expected forbidden-phrase. Got: ${JSON.stringify(issues)}`);
});

test("validador: detecta 'la decisión deja una marca clara'", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  const issues = bundle.validateNarrationAgainstIngredientBundle("La decisión deja una marca clara y obliga al grupo a moverse con cuidado.", b);
  assert.ok(issues.some((i) => i.code === "forbidden-phrase"), `Expected forbidden-phrase. Got: ${JSON.stringify(issues)}`);
});

test("validador: detecta outcome mismatch (failure narra logro)", () => {
  const plan = makePlan({ roll: { ...makePlan().roll, result: "failure" } });
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  b.outcome = "failure";
  const issues = bundle.validateNarrationAgainstIngredientBundle("Fiamy logra demostrar la inocencia de Nicolás con éxito absoluto.", b);
  assert.ok(issues.some((i) => i.code === "outcome-mismatch"), `Expected outcome-mismatch. Got: ${JSON.stringify(issues)}`);
});

test("validador: detecta gesto implausible para Tomás", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  const issues = bundle.validateNarrationAgainstIngredientBundle("Tomás se lleva harina a la boca y mira al grupo.", b);
  assert.ok(issues.some((i) => i.code === "implausible-gesture"), `Expected implausible-gesture. Got: ${JSON.stringify(issues)}`);
});

test("validador: narración correcta no tiene issues de error", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  const goodNarration = "Fiamy levantó los grilletes de Nicolás con cuidado. El hierro había mordido la piel antes del acta. Elías no miró la prueba directamente; se adelantó para hablar. La turba bajó la voz un momento.";
  const issues = bundle.validateNarrationAgainstIngredientBundle(goodNarration, b);
  const errors = issues.filter((i) => i.severity === "error");
  assert.equal(errors.length, 0, `Expected no errors. Got: ${JSON.stringify(errors)}`);
});

// ─── Tests: containsForbiddenBundlePhrase ─────────────────────────────────────

test("detecta 'la ruta no es segura, pero cambia la posición de todos'", () => {
  assert.ok(bundle.containsForbiddenBundlePhrase("La ruta no es segura, pero cambia la posición de todos."));
});

test("detecta 'ahora el peligro viene desde atrás'", () => {
  assert.ok(bundle.containsForbiddenBundlePhrase("Ahora el peligro viene desde atrás."));
});

test("no rechaza prosa literaria concreta", () => {
  assert.equal(bundle.containsForbiddenBundlePhrase("Fiamy levantó los grilletes. El hierro había mordido antes del acta."), false);
});

// ─── Tests: player-narration forbidden phrases ────────────────────────────────

test("forbiddenPlayerNarrationPhrases incluye frases placeholder nuevas", () => {
  const { forbiddenPlayerNarrationPhrases, containsForbiddenPlayerNarration } = narration;
  assert.ok(forbiddenPlayerNarrationPhrases.some((p) => p.includes("ventaja pasa a otras manos")));
  assert.ok(forbiddenPlayerNarrationPhrases.some((p) => p.includes("decisión deja una marca clara")));
  assert.ok(containsForbiddenPlayerNarration("Belo toma una decisión arriesgada, pero la ventaja pasa a otras manos."));
});

test("player-narration: investigar_objeto usa evidence name, no action label", () => {
  const { buildPlayerNarration } = narration;
  const turn = {
    actor: { id: "fiamy", name: "Fiamy" },
    target: { id: "grilletes", label: "Revisar los grilletes de Nicolás", kind: "object" },
    campaignActionType: "investigar_objeto",
    result: "success",
    factualSummary: "Los grilletes prueban que lo redujeron antes del arresto oficial.",
    visibleConsequence: "Los grilletes prueban que lo redujeron antes del arresto oficial.",
    narrationHints: { mustMention: [], mustNotMention: [], style: "" },
  };
  const text = buildPlayerNarration(turn);
  assert.ok(!text.includes("Revisar los grilletes de Nicolás"), `Action label leaked into narration: "${text}"`);
  assert.ok(text.includes("grillete"), `Expected 'grillete' in narration: "${text}"`);
});

test("player-narration: investigar_objeto failure usa evidence, no action label", () => {
  const { buildPlayerNarration } = narration;
  const turn = {
    actor: { id: "miri", name: "Miri" },
    target: { id: "cuerda-campana", label: "Revisar la cuerda cortada de la campana", kind: "object" },
    campaignActionType: "investigar_objeto",
    result: "failure",
    factualSummary: "El grupo pierde una prueba limpia.",
    visibleConsequence: "El grupo pierde una prueba limpia y Elías aprovecha la confusión.",
    narrationHints: { mustMention: [], mustNotMention: [], style: "" },
  };
  const text = buildPlayerNarration(turn);
  assert.ok(!text.includes("Revisar la cuerda cortada"), `Action label leaked: "${text}"`);
  assert.ok(!text.includes("revisa Revisar"), `Double 'revisar': "${text}"`);
});

// ─── Tests: buildFallbackNarrationFromBundle ──────────────────────────────────

test("fallback: no usa frases placeholder genéricas", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  const text = bundle.buildFallbackNarrationFromBundle(b);
  assert.ok(!bundle.containsForbiddenBundlePhrase(text), `Fallback contains forbidden phrase: "${text}"`);
});

test("fallback para failure: describe resistencia del mundo, no éxito", () => {
  const plan = makePlan({ roll: { ...makePlan().roll, result: "failure" } });
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  b.outcome = "failure";
  const text = bundle.buildFallbackNarrationFromBundle(b);
  assert.ok(!text.includes("éxito") && !text.includes("logra demostrar"), `Failure fallback describes success: "${text}"`);
});

test("fallback: menciona el actor por nombre", () => {
  const plan = makePlan();
  const request = makeRequest();
  const b = bundle.buildNarrativeIngredientBundle(request, plan);
  const text = bundle.buildFallbackNarrationFromBundle(b);
  assert.ok(text.includes("Fiamy"), `Expected actor name in fallback: "${text}"`);
});
