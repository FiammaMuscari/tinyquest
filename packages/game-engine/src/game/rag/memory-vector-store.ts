import type { EmbeddedMemory } from "./embedded-memory.types";

export interface MemoryVectorStore {
  add(memory: EmbeddedMemory): Promise<void>;
  addMany(memories: EmbeddedMemory[]): Promise<void>;
  listByRoom(roomId: string): Promise<EmbeddedMemory[]>;
  listByCampaign(campaignId: string): Promise<EmbeddedMemory[]>;
  update(memory: EmbeddedMemory): Promise<void>;
  markUsed(memoryIds: string[], turn: number): Promise<void>;
  clearRoom(roomId: string): Promise<void>;
}

export class InMemoryVectorStore implements MemoryVectorStore {
  private readonly store = new Map<string, EmbeddedMemory>();

  async add(memory: EmbeddedMemory): Promise<void> {
    this.store.set(memory.id, memory);
  }

  async addMany(memories: EmbeddedMemory[]): Promise<void> {
    for (const memory of memories) this.store.set(memory.id, memory);
  }

  async listByRoom(roomId: string): Promise<EmbeddedMemory[]> {
    return Array.from(this.store.values()).filter((m) => m.roomId === roomId);
  }

  async listByCampaign(campaignId: string): Promise<EmbeddedMemory[]> {
    return Array.from(this.store.values()).filter((m) => m.campaignId === campaignId);
  }

  async update(memory: EmbeddedMemory): Promise<void> {
    this.store.set(memory.id, memory);
  }

  async markUsed(memoryIds: string[], turn: number): Promise<void> {
    for (const id of memoryIds) {
      const m = this.store.get(id);
      if (m) this.store.set(id, { ...m, lastUsedTurn: turn });
    }
  }

  async clearRoom(roomId: string): Promise<void> {
    for (const [id, m] of this.store) {
      if (m.roomId === roomId) this.store.delete(id);
    }
  }
}
