import type { Player } from "./types";

export function regenerateRoundEnergy(players: Player[], maxEnergy = 6, amount = 1): Player[] {
  return players.map((player) => player.status === "dead"
    ? player
    : {
      ...player,
      character: {
        ...player.character,
        energy: Math.min(maxEnergy, Math.max(0, player.character.energy) + amount)
      }
    });
}
