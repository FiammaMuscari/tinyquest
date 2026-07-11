import type { DangerBand } from "./game/campaigns/campaign.types";

export type { DangerBand };

export function getDangerBand(danger: number): DangerBand {
  if (danger <= 3) return "low";
  if (danger <= 6) return "medium";
  if (danger <= 8) return "high";
  return "critical";
}

export function getDangerLabel(danger: number): string {
  const band = getDangerBand(danger);

  if (band === "low") {
    return "Bajo: todavía hay margen para investigar, negociar o preparar una ventaja.";
  }

  if (band === "medium") {
    return "Medio: las consecuencias pesan más y los NPCs reaccionan con más presión.";
  }

  if (band === "high") {
    return "Alto: la amenaza actúa, las rutas empiezan a cerrarse y cada fallo puede costar caro.";
  }

  return "Crítico: la escena puede cerrarse, una crisis estalla o el avance se fuerza.";
}

export function shouldForceSceneAdvance(params: {
  danger: number;
  round: number;
  maxRounds: number;
  sceneClockFull: boolean;
  walkthroughForcedAdvance: boolean;
}): boolean {
  const band = getDangerBand(params.danger);

  return (
    params.round >= params.maxRounds ||
    band === "critical" ||
    params.sceneClockFull ||
    params.walkthroughForcedAdvance
  );
}

// Techo de peligro por ronda ESCALADO por tamaño del grupo: con más gente en
// escena hay más acciones por ronda y más caos, así que la amenaza puede subir
// más rápido (proporcional). Base 2/ronda (solo) + 1 por cada jugador extra —
// 2 jugadores → 3, party llena de 5 → 6. Sin esto, una mesa de 5 acumulaba
// peligro al mismo ritmo que en solitario, restándole tensión al multijugador.
export function dangerCapForParty(playerCount: number): number {
  const extraPlayers = Math.max(0, Math.floor(playerCount) - 1);
  return 2 + extraPlayers;
}

export function capDangerGainForRound(params: {
  requestedGain: number;
  currentRoundGain: number;
  maxGainPerRound?: number;
}): number {
  const requestedGain = Math.max(0, params.requestedGain);
  const maxGainPerRound = params.maxGainPerRound ?? 2;
  const remainingGain = Math.max(0, maxGainPerRound - Math.max(0, params.currentRoundGain));
  return Math.min(requestedGain, remainingGain);
}
