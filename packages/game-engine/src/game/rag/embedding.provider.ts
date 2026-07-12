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

/** Embedding local por feature hashing. A diferencia del mock histórico que
 * convertía el texto completo en ruido, palabras compartidas y trigramas
 * morfológicos aterrizan en las mismas dimensiones; por eso el coseno expresa
 * similitud real sin red, claves ni IO. */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name: string = "local-feature-hash-v1";
  readonly dimensions: number;

  constructor(dimensions = 256) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const words = text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .match(/[a-z0-9_]{2,}/g) ?? [];
    const vector = Array.from({ length: this.dimensions }, () => 0);
    const add = (feature: string, weight: number) => {
      const hash = hashText(feature, 2166136261);
      const index = hash % this.dimensions;
      vector[index] += (hash & 0x80000000 ? -1 : 1) * weight;
    };
    for (const word of words) {
      add(`w:${word}`, 1);
      const padded = `^${word}$`;
      for (let i = 0; i <= padded.length - 3; i += 1) add(`g:${padded.slice(i, i + 3)}`, 0.22);
    }
    for (let i = 0; i < words.length - 1; i += 1) add(`b:${words[i]}_${words[i + 1]}`, 0.45);
    return normalizeVector(vector);
  }
}

/** Compatibilidad con tests e integraciones anteriores. */
export class MockEmbeddingProvider extends LocalEmbeddingProvider {
  readonly name = "mock-compatible-local-feature-hash-v1";

  constructor(dimensions = 64) {
    super(dimensions);
  }
}
