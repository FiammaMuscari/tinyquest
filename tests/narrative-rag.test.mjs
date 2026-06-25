import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

// ─── Transpile infrastructure ────────────────────────────────────────────────

const DIR = join(tmpdir(), `tinyquest-rag-tests-${process.pid}`);
await mkdir(DIR, { recursive: true });

async function transpile(srcRelative, outName, replacements = {}) {
  let source = await readFile(new URL(srcRelative, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  });
  await writeFile(join(DIR, outName), outputText);
}

await transpile("../packages/game-engine/src/game/rag/embedding.provider.ts", "embedding.provider.mjs");
await transpile("../packages/game-engine/src/game/rag/cosine-similarity.ts", "cosine-similarity.mjs");
await transpile("../packages/game-engine/src/game/rag/memory-vector-store.ts", "memory-vector-store.mjs");
await transpile("../packages/game-engine/src/game/rag/narrative-memory-index.ts", "narrative-memory-index.mjs", {
  'from "./cosine-similarity"': 'from "./cosine-similarity.mjs"'
});
await transpile("../packages/game-engine/src/game/rag/build-embedded-memories.ts", "build-embedded-memories.mjs");
await transpile("../packages/game-engine/src/game/memory/story-threads.ts", "story-threads.mjs");
await transpile("../packages/game-engine/src/game/memory/moral-profile.ts", "moral-profile.mjs");
await transpile("../packages/game-engine/src/game/memory/pending-consequences.ts", "pending-consequences.mjs");

await writeFile(join(DIR, "game-engine-stub.mjs"), [
  "export function getDangerBand(n) { return n < 4 ? 'low' : n < 7 ? 'medium' : n < 9 ? 'high' : 'critical'; }",
  "export function getDangerLabel(n) { return getDangerBand(n); }",
  "export function inferActionDomain() { return 'investigation'; }",
  "export function isFinalScene() { return false; }",
  "export function shouldResolveEnding() { return false; }",
].join("\n"));
await transpile("../packages/ai-master/src/prompt-builder.ts", "prompt-builder.mjs", {
  'from "@tiny-quest/game-engine"': 'from "./game-engine-stub.mjs"'
});

const { MockEmbeddingProvider } = await import(`file://${join(DIR, "embedding.provider.mjs")}`);
const { cosineSimilarity, scoreRetrievedMemory } = await import(`file://${join(DIR, "cosine-similarity.mjs")}`);
const { InMemoryVectorStore } = await import(`file://${join(DIR, "memory-vector-store.mjs")}`);
const { NarrativeMemoryIndex } = await import(`file://${join(DIR, "narrative-memory-index.mjs")}`);
const { buildEmbeddedMemoriesFromTurn } = await import(`file://${join(DIR, "build-embedded-memories.mjs")}`);
const { createStoryThread, selectRelevantStoryThreadsForPrompt } = await import(`file://${join(DIR, "story-threads.mjs")}`);
const { initialMoralProfile, summarizeMoralProfileForPrompt } = await import(`file://${join(DIR, "moral-profile.mjs")}`);
const { evaluatePendingConsequences } = await import(`file://${join(DIR, "pending-consequences.mjs")}`);
const { buildNarratorVoiceSection } = await import(`file://${join(DIR, "prompt-builder.mjs")}`);

// ─── Shared fixtures ─────────────────────────────────────────────────────────

function baseQuery(overrides = {}) {
  return {
    campaignId: "test-campaign", roomId: "test-room", turn: 5, sceneId: "scene-1",
    phase: "investigation", actionText: "examinar la daga de plata", actorId: "player-1",
    targetNpcIds: [], targetObjectIds: ["daga-plata"], clueIds: [], routeIds: [],
    presentNpcIds: ["mara"], presentObjectIds: ["daga-plata"], tags: ["success"], dangerClock: 3,
    ...overrides
  };
}

function baseMemoryInput(overrides = {}) {
  return {
    campaignId: "test-campaign", roomId: "test-room", turn: 3, sceneId: "scene-1",
    type: "clue", text: "La daga de plata tiene harina del molino en la hoja.",
    npcIds: ["mara"], objectIds: ["daga-plata"], clueIds: ["clue-harina"], playerIds: ["player-1"],
    routeIds: [], tags: ["success", "scene-1"], importance: 0.9, resolved: false,
    createdAtTurn: 3, source: "engine", truthStatus: "confirmed",
    summaryLine: "Harina en daga vs molino",
    ...overrides
  };
}

function baseMemory(overrides = {}) {
  return { id: "mem-1", embedding: [], ...baseMemoryInput(overrides) };
}

function stubRoom(dangerClock = 3, storyFlags = [], turn = 5) {
  return { dangerClock, storyFlags, turn, mysteryClues: [] };
}

// ─── MockEmbeddingProvider ───────────────────────────────────────────────────

describe("MockEmbeddingProvider", () => {
  it("is deterministic — same text yields same vector", async () => {
    const p = new MockEmbeddingProvider();
    assert.deepStrictEqual(await p.embed("la daga tiene harina"), await p.embed("la daga tiene harina"));
  });

  it("different texts yield different vectors", async () => {
    const p = new MockEmbeddingProvider();
    const a = await p.embed("harina en daga");
    const b = await p.embed("campana de la capilla");
    assert.ok(!a.every((v, i) => v === b[i]), "different texts should differ");
  });

  it("returns normalized vector (magnitude ≈ 1)", async () => {
    const p = new MockEmbeddingProvider(64);
    const v = await p.embed("turba fuera de la aldea");
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    assert.ok(Math.abs(mag - 1) < 1e-6, `magnitude was ${mag}`);
  });

  it("returns vector of correct dimension", async () => {
    const p = new MockEmbeddingProvider(32);
    assert.equal((await p.embed("texto")).length, 32);
  });
});

// ─── cosineSimilarity ────────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("identical vectors → 1", () => {
    const v = [0.6, 0.8];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9);
  });

  it("orthogonal vectors → 0", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
  });

  it("empty vectors → 0", () => {
    assert.equal(cosineSimilarity([], []), 0);
  });

  it("opposite vectors → -1", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0], [-1, 0]) + 1) < 1e-9);
  });
});

// ─── scoreRetrievedMemory ────────────────────────────────────────────────────

describe("scoreRetrievedMemory", () => {
  it("penalizes resolved memories vs unresolved", async () => {
    const p = new MockEmbeddingProvider();
    const qe = await p.embed("examinar daga");
    const me = await p.embed("La daga de plata tiene harina del molino");
    const u = scoreRetrievedMemory(qe, { ...baseMemory(), embedding: me }, baseQuery());
    const r = scoreRetrievedMemory(qe, { ...baseMemory(), embedding: me, resolved: true }, baseQuery());
    assert.ok(u.score > r.score);
  });

  it("penalizes forbidden memories", async () => {
    const p = new MockEmbeddingProvider();
    const qe = await p.embed("examinar daga");
    const me = await p.embed("La daga de plata tiene harina del molino");
    const ok = scoreRetrievedMemory(qe, { ...baseMemory(), embedding: me }, baseQuery());
    const bad = scoreRetrievedMemory(qe, { ...baseMemory(), embedding: me, truthStatus: "forbidden" }, baseQuery());
    assert.ok(ok.score > bad.score);
  });

  it("boosts memories with matching NPC in query", async () => {
    const p = new MockEmbeddingProvider();
    const me = await p.embed("Mara evitó responder.");
    const qe = await p.embed("interrogar a mara");
    const q = { ...baseQuery(), targetNpcIds: ["mara"], targetObjectIds: [] };
    const withNpc = scoreRetrievedMemory(qe, { ...baseMemory(), embedding: me, npcIds: ["mara"], objectIds: [] }, q);
    const noNpc = scoreRetrievedMemory(qe, { ...baseMemory(), embedding: me, npcIds: [], objectIds: [] }, q);
    assert.ok(withNpc.score > noNpc.score);
    assert.ok(withNpc.reasons.some((r) => r.includes("mara")));
  });

  it("returns a reasons array", async () => {
    const p = new MockEmbeddingProvider();
    const qe = await p.embed("examinar daga");
    const me = await p.embed("La daga de plata");
    const result = scoreRetrievedMemory(qe, { ...baseMemory(), embedding: me }, baseQuery());
    assert.ok(Array.isArray(result.reasons));
  });
});

// ─── InMemoryVectorStore ─────────────────────────────────────────────────────

describe("InMemoryVectorStore", () => {
  it("add and listByRoom", async () => {
    const s = new InMemoryVectorStore();
    await s.add(baseMemory());
    assert.equal((await s.listByRoom("test-room")).length, 1);
  });

  it("listByRoom filters by roomId", async () => {
    const s = new InMemoryVectorStore();
    await s.add(baseMemory({ id: "a", roomId: "room-a" }));
    await s.add(baseMemory({ id: "b", roomId: "room-b" }));
    assert.equal((await s.listByRoom("room-a")).length, 1);
  });

  it("clearRoom removes only that room", async () => {
    const s = new InMemoryVectorStore();
    await s.add(baseMemory({ id: "a", roomId: "room-a" }));
    await s.add(baseMemory({ id: "b", roomId: "room-b" }));
    await s.clearRoom("room-a");
    assert.equal((await s.listByRoom("room-a")).length, 0);
    assert.equal((await s.listByRoom("room-b")).length, 1);
  });

  it("markUsed updates lastUsedTurn", async () => {
    const s = new InMemoryVectorStore();
    await s.add(baseMemory({ id: "m1" }));
    await s.markUsed(["m1"], 10);
    assert.equal((await s.listByRoom("test-room"))[0].lastUsedTurn, 10);
  });

  it("addMany stores all memories", async () => {
    const s = new InMemoryVectorStore();
    await s.addMany([baseMemory({ id: "x1" }), baseMemory({ id: "x2" }), baseMemory({ id: "x3" })]);
    assert.equal((await s.listByRoom("test-room")).length, 3);
  });
});

// ─── NarrativeMemoryIndex ────────────────────────────────────────────────────

describe("NarrativeMemoryIndex", () => {
  it("addMemory assigns id and embedding", async () => {
    const idx = new NarrativeMemoryIndex({ embeddingProvider: new MockEmbeddingProvider(), store: new InMemoryVectorStore() });
    const m = await idx.addMemory(baseMemoryInput());
    assert.ok(m.id.startsWith("emem-"), `id was ${m.id}`);
    assert.equal(m.embedding.length, 64);
  });

  it("retrieve returns NPC memory when NPC is targeted", async () => {
    const idx = new NarrativeMemoryIndex({ embeddingProvider: new MockEmbeddingProvider(), store: new InMemoryVectorStore() });
    await idx.addMemory(baseMemoryInput({ type: "npc_memory", text: "Mara evitó responder cuando vio la daga.", npcIds: ["mara"], objectIds: ["daga-plata"], clueIds: [] }));
    const results = await idx.retrieve({ ...baseQuery(), targetNpcIds: ["mara"], limit: 5 });
    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.memory.npcIds.includes("mara")));
  });

  it("retrieve penalizes resolved memories relative to unresolved", async () => {
    const idx = new NarrativeMemoryIndex({ embeddingProvider: new MockEmbeddingProvider(), store: new InMemoryVectorStore() });
    const text = "Mara mencionó el molino brevemente.";
    const u = await idx.addMemory(baseMemoryInput({ type: "npc_memory", text, npcIds: ["mara"], objectIds: [], resolved: false }));
    const r = await idx.addMemory(baseMemoryInput({ type: "npc_memory", text, npcIds: ["mara"], objectIds: [], resolved: true }));
    const results = await idx.retrieve({ ...baseQuery(), targetNpcIds: ["mara"], includeResolved: true });
    const ur = results.find((x) => x.memory.id === u.id);
    const rr = results.find((x) => x.memory.id === r.id);
    if (ur && rr) assert.ok(ur.score >= rr.score);
  });

  it("forbidden memories score < 0.1", async () => {
    const idx = new NarrativeMemoryIndex({ embeddingProvider: new MockEmbeddingProvider(), store: new InMemoryVectorStore() });
    await idx.addMemory(baseMemoryInput({ type: "fact", text: "Dato prohibido.", npcIds: [], objectIds: [], truthStatus: "forbidden" }));
    const results = await idx.retrieve(baseQuery());
    const f = results.find((r) => r.memory.truthStatus === "forbidden");
    assert.ok(!f || f.score < 0.1);
  });

  it("if embed throws, retrieve propagates the error", async () => {
    const broken = { name: "broken", dimensions: 64, embed: async () => { throw new Error("network error"); } };
    const idx = new NarrativeMemoryIndex({ embeddingProvider: broken, store: new InMemoryVectorStore() });
    await assert.rejects(() => idx.retrieve(baseQuery()), /network error/);
  });
});

// ─── buildEmbeddedMemoriesFromTurn ───────────────────────────────────────────

describe("buildEmbeddedMemoriesFromTurn", () => {
  // scene needs actionChoices; room needs sessionLog
  function minRoom(overrides = {}) {
    return {
      id: "test-room", turn: 4, dangerClock: 3, sceneId: "scene-1",
      campaign: {
        id: "c1", clues: [{ id: "clue-harina", text: "Harina en la hoja de la daga." }],
        npcs: [{ id: "mara", name: "Mara" }], storyObjects: [],
        scenes: [{ id: "scene-1", actionChoices: [] }], possibleEndings: []
      },
      mysteryClues: [], storyFlags: [], sessionLog: [],
      livingState: { discoveredClues: {}, npcStates: {}, objectStates: {} },
      ...overrides
    };
  }

  function minRes({ outcome = "success", npcChanges = [], objectChanges = [], revealedClueIds = [] } = {}) {
    return {
      check: { outcome },
      narrationRequest: {
        currentScene: { id: "scene-1", actionChoices: [] },
        activePlayer: { id: "player-1", name: "Fiamy" },
        rawAction: "examinar la daga",
        resolutionPlan: { consequence: { summary: "La daga brilla.", tags: [] }, cluePolicy: { canRevealNewClue: false, allowedClueIds: [] }, validContext: { targetId: "" } },
        storyFlags: []
      },
      turnResolution: { npcChanges, objectChanges, revealedClueIds, patches: [], factualSummary: "" }
    };
  }

  it("always generates at least one fact memory", () => {
    const mems = buildEmbeddedMemoriesFromTurn({ roomBefore: minRoom(), roomAfter: minRoom({ turn: 5 }), resolution: minRes() });
    assert.ok(mems.length >= 1);
    assert.ok(mems.some((m) => m.type === "fact"));
  });

  it("does not generate more than 8 memories per turn", () => {
    const mems = buildEmbeddedMemoriesFromTurn({
      roomBefore: minRoom(), roomAfter: minRoom({ turn: 5 }),
      resolution: minRes({ outcome: "partial_success", npcChanges: [{ id: "mara" }, { id: "b" }], objectChanges: [{ id: "o1", state: "broken" }, { id: "o2", state: "used" }], revealedClueIds: ["clue-harina"] })
    });
    assert.ok(mems.length <= 8, `generated ${mems.length} memories, expected ≤ 8`);
  });

  it("generates clue memory when clue is revealed", () => {
    const mems = buildEmbeddedMemoriesFromTurn({ roomBefore: minRoom(), roomAfter: minRoom({ turn: 5 }), resolution: minRes({ revealedClueIds: ["clue-harina"] }) });
    assert.ok(mems.some((m) => m.type === "clue"), "should have a clue memory");
    assert.ok(mems.some((m) => m.clueIds.includes("clue-harina")), "clue id should be indexed");
  });

  it("generates npc_memory when NPC changes", () => {
    const mems = buildEmbeddedMemoriesFromTurn({ roomBefore: minRoom(), roomAfter: minRoom({ turn: 5 }), resolution: minRes({ npcChanges: [{ id: "mara", trust: 1 }] }) });
    assert.ok(mems.some((m) => m.type === "npc_memory"), "should have an npc_memory");
  });

  it("generates failed_action when outcome is failure", () => {
    const mems = buildEmbeddedMemoriesFromTurn({ roomBefore: minRoom(), roomAfter: minRoom({ turn: 5 }), resolution: minRes({ outcome: "failure" }) });
    assert.ok(mems.some((m) => m.type === "failed_action"), "should have a failed_action");
  });

  it("all summaryLines are ≤120 chars", () => {
    const mems = buildEmbeddedMemoriesFromTurn({ roomBefore: minRoom(), roomAfter: minRoom({ turn: 5 }), resolution: minRes({ revealedClueIds: ["clue-harina"], npcChanges: [{ id: "mara", trust: 0 }] }) });
    for (const m of mems) assert.ok(m.summaryLine.length <= 120, `summaryLine too long (${m.summaryLine.length}): "${m.summaryLine}"`);
  });
});

// ─── StoryThread helpers ─────────────────────────────────────────────────────

describe("StoryThread helpers", () => {
  function makeThread(overrides = {}) {
    return createStoryThread({
      title: "Test", status: "open", createdByTurn: 1, updatedAtTurn: 1,
      involvedNpcIds: [], involvedClueIds: [], involvedObjectIds: [], involvedSceneIds: [],
      unresolvedQuestion: "?", memoryLine: "", importance: 0.5, ...overrides
    });
  }

  it("createStoryThread assigns an id", () => {
    const t = makeThread({ title: "Mara bajo presión", involvedNpcIds: ["mara"] });
    assert.ok(t.id.startsWith("thread-"), `id was ${t.id}`);
    assert.equal(t.status, "open");
  });

  it("selectRelevantStoryThreadsForPrompt prioritizes present NPCs", () => {
    const threads = [makeThread({ title: "A", involvedNpcIds: ["tomas"], importance: 0.5 }), makeThread({ title: "B", involvedNpcIds: ["mara"], importance: 0.9 })];
    assert.equal(selectRelevantStoryThreadsForPrompt(threads, ["mara"])[0].title, "B");
  });

  it("selectRelevantStoryThreadsForPrompt excludes resolved threads", () => {
    const threads = [makeThread({ title: "Open" }), makeThread({ title: "Resolved", status: "resolved" })];
    assert.ok(!selectRelevantStoryThreadsForPrompt(threads, []).find((t) => t.status === "resolved"));
  });
});

// ─── MoralProfile ─────────────────────────────────────────────────────────────

describe("MoralProfile", () => {
  it("initialMoralProfile starts at zero", () => {
    const p = initialMoralProfile();
    assert.equal(p.truth, 0);
    assert.equal(p.mercy, 0);
    assert.equal(p.rememberedByNpcIds.length, 0);
  });

  it("summarizeMoralProfileForPrompt returns empty string for all-zero profile", () => {
    assert.equal(summarizeMoralProfileForPrompt(initialMoralProfile(), "Fiamy"), "");
  });

  it("summarizeMoralProfileForPrompt returns non-empty string for non-zero profile", () => {
    const p = { ...initialMoralProfile(), truth: 3, rememberedByNpcIds: ["mara"] };
    const s = summarizeMoralProfileForPrompt(p, "Fiamy");
    assert.ok(s.length > 0, `expected non-empty string, got "${s}"`);
  });
});

// ─── PendingConsequences ─────────────────────────────────────────────────────

describe("PendingConsequences", () => {
  function makePc(id, trigger, overrides = {}) {
    return {
      id, sourceTurn: 2, status: "pending", trigger, effect: { dangerDelta: 1 }, narrativeHint: "T.",
      involvedNpcIds: [], involvedSceneIds: [], involvedObjectIds: [], involvedClueIds: [],
      expiresAtTurn: 20, importance: 0.7, ...overrides
    };
  }

  it("does not trigger when danger below threshold", () => {
    const { triggered, remaining } = evaluatePendingConsequences([makePc("pc-1", { kind: "score", id: "danger", value: 6, op: "gte" })], stubRoom(3));
    assert.equal(triggered.length, 0);
    assert.equal(remaining[0].status, "pending");
  });

  it("triggers when danger >= threshold", () => {
    const { triggered } = evaluatePendingConsequences([makePc("pc-2", { kind: "score", id: "danger", value: 6, op: "gte" })], stubRoom(7));
    assert.equal(triggered.length, 1);
    assert.equal(triggered[0].status, "triggered");
  });

  it("expires when turn >= expiresAtTurn", () => {
    const { remaining } = evaluatePendingConsequences([makePc("pc-3", { kind: "score", id: "danger", value: 6, op: "gte" }, { expiresAtTurn: 4 })], stubRoom(3, [], 5));
    assert.equal(remaining[0].status, "expired");
  });

  it("triggers flag-based consequence when flag present", () => {
    const { triggered } = evaluatePendingConsequences([makePc("pc-4", { kind: "flag", id: "object_used:daga-plata" })], stubRoom(3, ["object_used:daga-plata"]));
    assert.equal(triggered.length, 1);
  });

  it("does not trigger flag-based consequence when flag absent", () => {
    const { triggered } = evaluatePendingConsequences([makePc("pc-5", { kind: "flag", id: "object_used:daga-plata" })], stubRoom(3, []));
    assert.equal(triggered.length, 0);
  });
});

// ─── NarratorVoice (prompt-builder) ─────────────────────────────────────────

describe("NarratorVoice", () => {
  it("returns empty string for undefined voice", () => {
    assert.equal(buildNarratorVoiceSection(undefined), "");
  });

  it("includes genre, tone, forbidden styles and examples", () => {
    const voice = {
      genre: "gothic folk horror", tone: "melancólico", rhythm: "párrafos breves", diction: "sensorial y física",
      forbiddenStyle: ["genérico fantasy", "anime"],
      examples: {
        success: "La hoja brilló en la penumbra y Mara palideció.",
        partial: "Encontró la marca, pero sus manos temblaron al tocarla.",
        failure: "La evidencia se escurrió entre sus dedos como agua fría.",
        npcDialogue: "—No fui yo —susurró Mara sin mirar."
      }
    };
    const s = buildNarratorVoiceSection(voice);
    assert.ok(s.includes("gothic folk horror"));
    assert.ok(s.includes("melancólico"));
    assert.ok(s.includes("genérico fantasy"));
    assert.ok(s.includes("La hoja brilló"));
  });
});
