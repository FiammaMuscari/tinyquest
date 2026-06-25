import type { EmbeddedMemory, NarrativeRetrievalQuery, RetrievedMemory } from "./embedded-memory.types";

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const matches = a.filter((id) => setB.has(id)).length;
  return matches / Math.max(a.length, b.length);
}

function typeBoost(type: EmbeddedMemory["type"], query: NarrativeRetrievalQuery): number {
  if (type === "moral_choice" && query.targetNpcIds.length > 0) return 0.05;
  if (type === "causal_link") return 0.04;
  if (type === "clue") return 0.03;
  if (type === "pending_consequence") return 0.05;
  if (type === "story_thread") return 0.03;
  return 0;
}

export function scoreRetrievedMemory(
  queryEmbedding: number[],
  memory: EmbeddedMemory,
  query: NarrativeRetrievalQuery
): RetrievedMemory {
  const reasons: string[] = [];

  // --- cosine (40%) ---
  const cosine = cosineSimilarity(queryEmbedding, memory.embedding);

  // --- entity overlap (25%) ---
  const npcOverlap = overlapScore(memory.npcIds, [...query.targetNpcIds, ...query.presentNpcIds]);
  const objOverlap = overlapScore(memory.objectIds, [...query.targetObjectIds, ...query.presentObjectIds]);
  const clueOverlap = overlapScore(memory.clueIds, query.clueIds);
  const routeOverlap = overlapScore(memory.routeIds, query.routeIds);
  const entityOverlapScore = (npcOverlap * 0.5 + objOverlap * 0.25 + clueOverlap * 0.15 + routeOverlap * 0.1);

  // --- scene (8%) ---
  const sceneScore = memory.sceneId === query.sceneId ? 1 : 0;

  // --- importance (10%) ---
  const importanceScore = memory.importance;

  // --- recency (5%): decay over 10 turns ---
  const turnAge = Math.max(0, query.turn - memory.createdAtTurn);
  const recencyScore = Math.max(0, 1 - turnAge / 10);

  // --- unresolved boost (7%) ---
  const unresolvedBoost = !memory.resolved ? 1 : 0;

  // --- type boost (5%) ---
  const typeBoostScore = typeBoost(memory.type, query);

  // --- penalties ---
  let penalty = 0;
  if (memory.resolved) penalty += 0.05;
  if (memory.truthStatus === "forbidden") penalty += 0.50;
  if (memory.truthStatus === "contradicted") penalty += 0.20;
  if (!query.includeResolved && memory.resolved) penalty += 0.15;

  const score =
    cosine * 0.40 +
    entityOverlapScore * 0.25 +
    sceneScore * 0.08 +
    importanceScore * 0.10 +
    recencyScore * 0.05 +
    unresolvedBoost * 0.07 +
    typeBoostScore -
    penalty;

  // collect reasons
  if (cosine > 0.6) reasons.push(`high text similarity (${cosine.toFixed(2)})`);
  for (const id of query.targetNpcIds) {
    if (memory.npcIds.includes(id)) reasons.push(`same NPC: ${id}`);
  }
  for (const id of query.presentNpcIds) {
    if (memory.npcIds.includes(id) && !query.targetNpcIds.includes(id)) reasons.push(`NPC present: ${id}`);
  }
  for (const id of query.targetObjectIds) {
    if (memory.objectIds.includes(id)) reasons.push(`same object: ${id}`);
  }
  for (const id of query.presentObjectIds) {
    if (memory.objectIds.includes(id) && !query.targetObjectIds.includes(id)) reasons.push(`object present: ${id}`);
  }
  for (const id of query.clueIds) {
    if (memory.clueIds.includes(id)) reasons.push(`same clue: ${id}`);
  }
  if (sceneScore === 1) reasons.push("same scene");
  if (!memory.resolved) reasons.push("unresolved");
  if (memory.type === "moral_choice") reasons.push("unresolved moral choice");
  if (memory.type === "causal_link") reasons.push("causal link with current action");
  if (memory.type === "pending_consequence") reasons.push("pending consequence");
  if (memory.importance >= 0.8) reasons.push("high importance memory");
  if (recencyScore > 0.8) reasons.push("recent memory");

  return { memory, score: Math.max(0, score), reasons };
}
