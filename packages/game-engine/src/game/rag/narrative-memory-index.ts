import type { EmbeddingProvider } from "./embedding.provider";
import type { EmbeddedMemory, EmbeddedMemoryInput, NarrativeRetrievalQuery, RetrievedMemory } from "./embedded-memory.types";
import type { MemoryVectorStore } from "./memory-vector-store";
import { scoreRetrievedMemory } from "./cosine-similarity";

let idCounter = 0;
function nextId(): string {
  return `emem-${Date.now()}-${(idCounter++).toString(36)}`;
}

export class NarrativeMemoryIndex {
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly store: MemoryVectorStore;

  constructor(options: { embeddingProvider: EmbeddingProvider; store: MemoryVectorStore }) {
    this.embeddingProvider = options.embeddingProvider;
    this.store = options.store;
  }

  async addMemory(input: EmbeddedMemoryInput): Promise<EmbeddedMemory> {
    const embedding = await this.embeddingProvider.embed(input.text);
    const memory: EmbeddedMemory = { ...input, id: nextId(), embedding };
    await this.store.add(memory);
    return memory;
  }

  async addMemories(inputs: EmbeddedMemoryInput[]): Promise<EmbeddedMemory[]> {
    const results: EmbeddedMemory[] = [];
    for (const input of inputs) {
      const embedding = await this.embeddingProvider.embed(input.text);
      results.push({ ...input, id: nextId(), embedding });
    }
    await this.store.addMany(results);
    return results;
  }

  async retrieve(query: NarrativeRetrievalQuery): Promise<RetrievedMemory[]> {
    const queryText = [query.actionText, ...query.tags, ...query.targetNpcIds, ...query.targetObjectIds, ...query.clueIds].join(" ");
    const queryEmbedding = await this.embeddingProvider.embed(queryText);
    const candidates = await this.store.listByRoom(query.roomId);

    const scored = candidates
      .filter((m) => m.campaignId === query.campaignId)
      .filter((m) => query.includeResolved || !m.resolved || m.type === "pending_consequence")
      .map((m) => scoreRetrievedMemory(queryEmbedding, m, query))
      .filter((r) => r.score > 0.01)
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? 6);

    const ids = scored.map((r) => r.memory.id);
    if (ids.length > 0) {
      await this.store.markUsed(ids, query.turn).catch(() => undefined);
    }

    return scored;
  }
}
