// Relojes de historia (story clocks) — presión estructurada, estilo Blades in the Dark.
//
// POR QUÉ: hasta ahora la única presión era `dangerClock` (0-10), un eje plano que
// sube y baja sin decir QUÉ se acerca. Un reloj tiene NOMBRE y PAGO: el jugador ve
// "La Guardia cierra los muros ●●●○○○" y sabe exactamente qué está perdiendo tiempo.
//
// INVARIANTE (el motor es la verdad): los relojes avanzan SOLO por hechos ya
// resueltos por el motor (resultado del check, peligro ganado, pistas reveladas).
// El LLM jamás mueve un segmento: recibe el estado y lo narra. Igual que los dados.
//
// Puro: sin IO, sin fechas, sin azar. Mismo input → mismo output.

import type { Campaign, CheckOutcome } from "./types";

export type StoryClockKind = "threat" | "opportunity" | "mystery";

export type StoryClock = {
  id: string;
  /** Nombre in-world, se muestra al jugador cuando el reloj está revelado. */
  name: string;
  kind: StoryClockKind;
  /** Cuántos segmentos tiene. Más segmentos = presión más lenta. */
  segments: number;
  filled: number;
  /** Qué pasa al llenarse. Viaja al narrador como hecho consumado. */
  payoff: string;
  /** Los relojes de amenaza nacen OCULTOS: aparecer a mitad de carga da miedo. */
  revealed: boolean;
  /** Turno en que se llenó. Un reloj lleno no vuelve a avanzar. */
  firedAtTurn?: number;
};

/** Lo que cambió en un reloj este turno — para narrador y UI. */
export type ClockTick = {
  clockId: string;
  name: string;
  kind: StoryClockKind;
  from: number;
  to: number;
  segments: number;
  /** El reloj se destapó recién (pasó de oculto a visible). */
  justRevealed: boolean;
  /** Se llenó en este turno. */
  fired: boolean;
  payoff?: string;
};

export type ClockAdvanceInput = {
  outcome: CheckOutcome;
  /** Peligro ganado por el motor este turno (ya capado por danger.ts). */
  dangerDelta: number;
  /** Cuántas pistas se revelaron en este turno. */
  revealedClueCount: number;
  turn: number;
};

export type ClockAdvanceResult = {
  clocks: StoryClock[];
  ticks: ClockTick[];
  /** Peligro que aportan los relojes que se llenaron (amenaza sube, oportunidad baja). */
  dangerDelta: number;
  /** `clock_fired:<id>` por cada reloj completado — engancha con unlockableOptions. */
  flags: string[];
};

/** Tope por turno y por reloj: ningún turno solo puede llenar un reloj de golpe. */
const MAX_TICK_PER_TURN = 2;

const DEFAULT_SEGMENTS: Record<StoryClockKind, number> = {
  threat: 8,
  opportunity: 6,
  mystery: 6
};

function clampSegments(value: number | undefined, kind: StoryClockKind): number {
  const raw = value ?? DEFAULT_SEGMENTS[kind];
  return Math.max(4, Math.min(10, Math.round(raw)));
}

/**
 * Cuánto avanza un reloj este turno, según el hecho que YA resolvió el motor.
 *
 * - amenaza: el fracaso la alimenta; el éxito no la mueve. El peligro ganado suma.
 * - oportunidad: el éxito la llena; el fracaso no la retrocede (no castigamos dos veces).
 * - misterio: solo avanza con pistas reales reveladas.
 */
function tickFor(clock: StoryClock, input: ClockAdvanceInput): number {
  if (clock.kind === "threat") {
    const byOutcome = input.outcome === "failure" ? 2 : input.outcome === "partial_success" ? 1 : 0;
    const byDanger = input.dangerDelta >= 2 ? 1 : 0;
    return Math.min(MAX_TICK_PER_TURN, byOutcome + byDanger);
  }
  if (clock.kind === "opportunity") {
    return input.outcome === "success" ? 2 : input.outcome === "partial_success" ? 1 : 0;
  }
  return Math.min(MAX_TICK_PER_TURN, Math.max(0, input.revealedClueCount));
}

/** Un reloj oculto se destapa al llegar a la mitad: el jugador siente que algo se movía. */
function shouldReveal(clock: StoryClock, filled: number): boolean {
  return clock.revealed || filled * 2 >= clock.segments;
}

export function advanceClocks(clocks: StoryClock[] | undefined, input: ClockAdvanceInput): ClockAdvanceResult {
  const source = clocks ?? [];
  if (!source.length) return { clocks: source, ticks: [], dangerDelta: 0, flags: [] };

  const ticks: ClockTick[] = [];
  const flags: string[] = [];
  let dangerDelta = 0;

  const nextClocks = source.map((clock) => {
    // Un reloj ya disparado queda como cicatriz: se muestra lleno y no avanza más.
    if (clock.firedAtTurn !== undefined) return clock;
    const step = tickFor(clock, input);
    if (step <= 0) return clock;

    const filled = Math.min(clock.segments, clock.filled + step);
    if (filled === clock.filled) return clock;

    const revealed = shouldReveal(clock, filled);
    const fired = filled >= clock.segments;
    const updated: StoryClock = {
      ...clock,
      filled,
      revealed,
      ...(fired ? { firedAtTurn: input.turn } : {})
    };

    ticks.push({
      clockId: clock.id,
      name: clock.name,
      kind: clock.kind,
      from: clock.filled,
      to: filled,
      segments: clock.segments,
      justRevealed: revealed && !clock.revealed,
      fired,
      ...(fired ? { payoff: clock.payoff } : {})
    });

    if (fired) {
      flags.push(`clock_fired:${clock.id}`);
      // La amenaza cumplida aprieta; la oportunidad ganada da aire. El misterio no
      // mueve el peligro: saber la verdad no te salva, solo te da con qué jugar.
      if (clock.kind === "threat") dangerDelta += 2;
      if (clock.kind === "opportunity") dangerDelta -= 1;
    }
    return updated;
  });

  return { clocks: nextClocks, ticks, dangerDelta, flags };
}

function shortLine(text: string | undefined, fallback: string): string {
  const clean = (text ?? "").trim();
  if (!clean) return fallback;
  return clean.length > 110 ? `${clean.slice(0, 107).trimEnd()}…` : clean;
}

/**
 * Siembra los relojes de una campaña. Funciona con campañas escritas a mano Y con
 * historias forjadas por el LLM: si la campaña no declara relojes, los deriva de sus
 * datos reales (amenazas, objetivo, pistas) para que TODA historia tenga presión.
 */
export function createClocksForCampaign(campaign: Campaign): StoryClock[] {
  const authored = campaign.clocks;
  if (authored?.length) {
    return authored.slice(0, 4).map((seed, index) => ({
      id: seed.id || `clock-${index + 1}`,
      name: seed.name,
      kind: seed.kind,
      segments: clampSegments(seed.segments, seed.kind),
      filled: 0,
      payoff: seed.payoff,
      // Amenaza nace oculta salvo que la campaña la declare visible a propósito.
      revealed: seed.revealed ?? seed.kind !== "threat"
    }));
  }

  const clocks: StoryClock[] = [];

  // 1) Amenaza: lo que se acerca si el grupo tropieza.
  const threat = campaign.threats?.[0];
  clocks.push({
    id: "clock-threat",
    name: threat?.name ? `${threat.name} se cierra` : "La amenaza te encuentra",
    kind: "threat",
    segments: DEFAULT_SEGMENTS.threat,
    filled: 0,
    payoff: shortLine(threat?.pressure, "Lo que te perseguía deja de esperar y actúa primero."),
    revealed: false
  });

  // 2) Misterio: la verdad se arma pista a pista. Los segmentos siguen a las pistas
  //    reales de la campaña para que llenarlo signifique haberla entendido.
  const revealableClues = campaign.clues?.length ?? 0;
  if (revealableClues >= 2) {
    clocks.push({
      id: "clock-mystery",
      name: "La verdad toma forma",
      kind: "mystery",
      segments: clampSegments(Math.min(revealableClues, 6), "mystery"),
      filled: 0,
      payoff: shortLine(campaign.forgeNotes?.summary?.firstMystery, "Las piezas encajan: ya sabés qué pasó de verdad."),
      revealed: true
    });
  }

  // 3) Oportunidad: el objetivo propio, lo que se gana empujando.
  const objective = campaign.forgeNotes?.summary?.objective;
  clocks.push({
    id: "clock-opportunity",
    name: objective ? shortLine(objective, "Tu objetivo") : "Tu ventaja crece",
    kind: "opportunity",
    segments: DEFAULT_SEGMENTS.opportunity,
    filled: 0,
    payoff: shortLine(campaign.forgeNotes?.heroBond, "Conseguiste la posición que buscabas: ahora jugás con ventaja."),
    revealed: true
  });

  return clocks;
}

/** Solo lo que el jugador puede ver. La UI nunca debe listar relojes ocultos. */
export function visibleClocks(clocks: StoryClock[] | undefined): StoryClock[] {
  return (clocks ?? []).filter((clock) => clock.revealed);
}

/**
 * Estado de relojes para el prompt del narrador. Manda TODOS (incluidos los ocultos,
 * marcados) — el narrador debe poder teñir la escena con una amenaza que el jugador
 * todavía no nombró, sin revelarla.
 */
export function clockPressureLines(clocks: StoryClock[] | undefined): string[] {
  return (clocks ?? []).map((clock) => {
    const state = clock.firedAtTurn !== undefined ? "CUMPLIDO" : `${clock.filled}/${clock.segments}`;
    const hidden = clock.revealed ? "" : " [oculto: insinuar, nunca nombrar]";
    return `${clock.name} (${clock.kind}) ${state}${hidden}`;
  });
}
