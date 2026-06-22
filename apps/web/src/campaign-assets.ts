export const campaignCardAssets: Record<string, string> = {
  "masked-duke": "/assets/campaigns/masked-duke.webp",
  "red-moon-killer": "/assets/campaigns/red-moon-killer.webp",
  "buried-crown": "/assets/campaigns/buried-crown.webp",
  "broken-oath-academy": "/assets/campaigns/broken-oath-academy.webp",
  "black-salt-pirates": "/assets/campaigns/black-salt-pirates.webp",
  "remembering-house": "/assets/campaigns/remembering-house.webp",
  "kitchen-moon": "/assets/campaigns/kitchen-moon.webp"
};

export function campaignCardImage(campaignId: string) {
  return campaignCardAssets[campaignId] ?? "/assets/campaigns/red-moon-killer.webp";
}
