import { chunkDocument } from "./rag.chunker";
import type { RagChunk, RagDocument } from "./rag.types";

export type RagIndex = {
  documents: RagDocument[];
  chunks: RagChunk[];
};

export function buildRagIndex(documents: RagDocument[]): RagIndex {
  return {
    documents,
    chunks: documents.flatMap((document) => chunkDocument(document))
  };
}
