import type { StatKey } from "@tiny-quest/game-engine";

export const characterStatAssets: Record<StatKey, string> = {
  body: "/assets/character/stats/body.webp",
  mind: "/assets/character/stats/mind.webp",
  charm: "/assets/character/stats/charm.webp",
  creativity: "/assets/character/stats/creativity.webp",
  courage: "/assets/character/stats/courage.webp",
  focus: "/assets/character/stats/focus.webp",
  luck: "/assets/character/stats/luck.webp"
};

export const characterTalentAssets = [
  { id: "flame", name: "Fulgor", url: "/assets/character/talents/flame.webp" },
  { id: "shield", name: "Custodia", url: "/assets/character/talents/shield.webp" },
  { id: "arcane", name: "Arcano", url: "/assets/character/talents/arcane.webp" },
  { id: "verdant", name: "Vínculo", url: "/assets/character/talents/verdant.webp" }
] as const;
