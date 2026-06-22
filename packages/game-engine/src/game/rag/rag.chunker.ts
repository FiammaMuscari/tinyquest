import type { RagChunk, RagDocument } from "./rag.types";

const stopwords = new Set(["que", "para", "con", "una", "los", "las", "del", "por", "como", "este", "esta", "scene", "campaign"]);

export function keywordsFor(text: string) {
  return Array.from(new Set(text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").match(/[a-z0-9_]{3,}/g) ?? []))
    .filter((word) => !stopwords.has(word))
    .slice(0, 80);
}

export function chunkDocument(document: RagDocument, maxChars = 1300): RagChunk[] {
  const sections = document.text.split(/\n(?=##? )/g).map((part) => part.trim()).filter(Boolean);
  const chunks: RagChunk[] = [];
  for (const [index, section] of sections.entries()) {
    const parts = section.length <= maxChars ? [section] : section.match(new RegExp(`.{1,${maxChars}}(?:\\s|$)`, "gs")) ?? [section];
    for (const [partIndex, text] of parts.entries()) {
      chunks.push({
        id: `${document.id}:${index}:${partIndex}`,
        documentId: document.id,
        campaignId: document.campaignId,
        kind: document.kind,
        title: document.title,
        tags: document.tags,
        text: text.trim(),
        keywords: keywordsFor(`${document.title} ${document.tags.join(" ")} ${text}`)
      });
    }
  }
  return chunks;
}
