import type { RagDocument, RagKind } from "../rag/rag.types";
import { literaryCampaignRegistry } from "./campaign.registry";

const kindByFile: Record<string, RagKind> = {
  "overview.md": "overview",
  "style.md": "style",
  "walkthrough.md": "walkthrough",
  "cast.md": "cast",
  "npcs.md": "npc",
  "secondary-npcs.md": "secondary_npc",
  "factions.md": "faction",
  "locations.md": "location",
  "objects.md": "object",
  "object-stats.md": "object_stats",
  "relics-and-nfts.md": "relic_nft",
  "creatures.md": "creature",
  "clues.md": "clue",
  "clue-graph.md": "clue_graph",
  "routes.md": "route",
  "endings.md": "ending",
  "dialogue-bank.md": "dialogue_bank",
  "consequence-tables.md": "consequence_table",
  "scene-events.md": "scene_event",
  "mechanics.md": "mechanics"
};

export function inferRagKind(path: string): RagKind {
  const file = path.split(/[\\/]/).pop() ?? path;
  if (path.includes("/scenes/") || path.includes("\\scenes\\")) return "scene";
  return kindByFile[file] ?? "overview";
}

export function documentsFromMarkdownMap(markdownByPath: Record<string, string>): RagDocument[] {
  return Object.entries(markdownByPath).map(([path, text]) => {
    const campaign = literaryCampaignRegistry.find((entry) => path.includes(`/${entry.slug}/`) || path.includes(`\\${entry.slug}\\`));
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? path.split(/[\\/]/).pop() ?? path;
    const tags = Array.from(new Set([...(text.match(/tags:\s*\[([^\]]+)\]/)?.[1]?.split(",").map((tag) => tag.trim()) ?? []), inferRagKind(path)]));
    return {
      id: path.replace(/[^a-zA-Z0-9_-]+/g, "-"),
      campaignId: campaign?.id ?? "unknown",
      path,
      kind: inferRagKind(path),
      title,
      tags,
      text
    };
  });
}
