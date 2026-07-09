import type { SessionConfig } from "./types";

// Escalado de sesión para party con amigos: con más gente la historia se alarga
// y se vuelve más compleja. Reglas de Fiamy (2026-07-09):
//   - Máximo 4 invitados por host (5 asientos en total).
//   - Con amigos, la capacidad total de rondas es de 20 COMO MÍNIMO
//     (maxScenes × maxRoundsPerScene ≥ 20), y crece con cada invitado.
//   - El reloj de sesión también crece: nadie quiere que el tiempo corte
//     una historia de cinco personas a los 15 minutos.

export const MAX_PARTY_GUESTS = 4;
export const MIN_PARTY_TOTAL_ROUNDS = 20;

export function scalePartySession(config: SessionConfig, guestCount: number): SessionConfig {
  if (guestCount <= 0) return config;
  const guests = Math.min(guestCount, MAX_PARTY_GUESTS);
  const scenes = Math.max(1, config.maxScenes);
  // +2 rondas por escena por invitado, y nunca menos de lo que exige el mínimo total.
  const roundsPerScene = Math.max(
    config.maxRoundsPerScene + 2 * guests,
    Math.ceil(MIN_PARTY_TOTAL_ROUNDS / scenes)
  );
  return {
    ...config,
    maxRoundsPerScene: roundsPerScene,
    maxMinutes: config.maxMinutes + 10 * guests
  };
}
