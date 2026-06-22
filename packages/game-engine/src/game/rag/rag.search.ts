import { keywordsFor } from "./rag.chunker";
import type { RagIndex } from "./rag.indexer";
import type { RagChunk, RagQuery } from "./rag.types";

function scoreChunk(chunk: RagChunk, queryWords: Set<string>, query: RagQuery) {
  let score = 0;
  if (chunk.campaignId !== query.campaignId) return -1;
  if (query.sceneId && chunk.text.includes(query.sceneId)) score += 8;
  for (const tag of query.tags ?? []) if (chunk.tags.includes(tag) || chunk.keywords.includes(tag)) score += 3;
  for (const id of [...(query.npcIds ?? []), ...(query.objectIds ?? []), ...(query.clueIds ?? [])]) if (chunk.text.includes(id)) score += 5;
  for (const word of queryWords) if (chunk.keywords.includes(word)) score += 1;
  if (chunk.kind === "scene") score += 2;
  if (chunk.kind === "walkthrough") score += 2;
  if (chunk.kind === "style") score += 1;
  return score;
}

export function searchRag(index: RagIndex, query: RagQuery): RagChunk[] {
  const words = new Set(keywordsFor(query.text ?? [...(query.tags ?? []), ...(query.clueIds ?? []), ...(query.objectIds ?? []), ...(query.npcIds ?? [])].join(" ")));
  return index.chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, words, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, query.limit ?? 7)
    .map((item) => item.chunk);
}
