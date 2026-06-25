export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

function hashText(text: string, seed: number): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (Math.imul(h, 0x9e3779b9) + (h << 6) + (h >> 2)) >>> 0;
  }
  return h;
}

function normalizeVector(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  if (mag === 0) return v;
  return v.map((x) => x / mag);
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "mock";
  readonly dimensions: number;

  constructor(dimensions = 64) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const normalized = text.toLowerCase().trim();
    const raw = Array.from({ length: this.dimensions }, (_, i) => {
      const h = hashText(normalized, i * 2654435761);
      return (((h >>> 16) ^ (h & 0xffff)) / 0xffff) * 2 - 1;
    });
    return normalizeVector(raw);
  }
}
