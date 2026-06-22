export type RagKind =
  | "overview" | "style" | "walkthrough" | "cast" | "npc" | "secondary_npc"
  | "faction" | "location" | "object" | "object_stats" | "relic_nft" | "creature"
  | "clue" | "clue_graph" | "route" | "ending" | "dialogue_bank" | "consequence_table"
  | "scene_event" | "mechanics" | "scene";

export type RagDocument = {
  id: string;
  campaignId: string;
  path: string;
  kind: RagKind;
  title: string;
  tags: string[];
  text: string;
};

export type RagChunk = {
  id: string;
  documentId: string;
  campaignId: string;
  kind: RagKind;
  title: string;
  tags: string[];
  text: string;
  keywords: string[];
};

export type RagQuery = {
  campaignId: string;
  sceneId?: string;
  actionId?: string;
  tags?: string[];
  npcIds?: string[];
  objectIds?: string[];
  clueIds?: string[];
  text?: string;
  limit?: number;
};
