import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

// `clocks.ts` solo importa TIPOS (import type) — se transpila sola, sin dependencias.
const dir = join(tmpdir(), `tinyquest-clocks-${process.pid}`);
await mkdir(dir, { recursive: true });
const source = await readFile(new URL("../packages/game-engine/src/clocks.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
await writeFile(join(dir, "clocks.mjs"), outputText);
const clocks = await import(join(dir, "clocks.mjs"));

function threatClock(overrides = {}) {
  return { id: "t", name: "La Guardia cierra los muros", kind: "threat", segments: 4, filled: 0, payoff: "Los muros se cierran.", revealed: false, ...overrides };
}
function opportunityClock(overrides = {}) {
  return { id: "o", name: "Tu ventaja crece", kind: "opportunity", segments: 4, filled: 0, payoff: "Ganás posición.", revealed: true, ...overrides };
}
function mysteryClock(overrides = {}) {
  return { id: "m", name: "La verdad toma forma", kind: "mystery", segments: 4, filled: 0, payoff: "Sabés qué pasó.", revealed: true, ...overrides };
}

const baseInput = { outcome: "success", dangerDelta: 0, revealedClueCount: 0, turn: 3 };

test("1) la amenaza se alimenta del fracaso y el éxito no la mueve", () => {
  const onFailure = clocks.advanceClocks([threatClock()], { ...baseInput, outcome: "failure" });
  assert.equal(onFailure.clocks[0].filled, 2, "un fracaso avanza 2 segmentos");

  const onSuccess = clocks.advanceClocks([threatClock()], { ...baseInput, outcome: "success" });
  assert.equal(onSuccess.clocks[0].filled, 0, "el éxito no alimenta la amenaza");
  assert.equal(onSuccess.ticks.length, 0, "sin cambio no hay tick");

  const onPartial = clocks.advanceClocks([threatClock()], { ...baseInput, outcome: "partial_success" });
  assert.equal(onPartial.clocks[0].filled, 1);
});

test("2) ningún turno avanza más de 2 segmentos, ni combinando fracaso y peligro", () => {
  const brutal = clocks.advanceClocks([threatClock({ segments: 8 })], { ...baseInput, outcome: "failure", dangerDelta: 5 });
  assert.equal(brutal.clocks[0].filled, 2, "el tope por turno protege el pacing");
});

test("3) la oportunidad la llena el éxito y el fracaso no la retrocede", () => {
  const won = clocks.advanceClocks([opportunityClock({ filled: 1 })], { ...baseInput, outcome: "success" });
  assert.equal(won.clocks[0].filled, 3);

  const lost = clocks.advanceClocks([opportunityClock({ filled: 3 })], { ...baseInput, outcome: "failure" });
  assert.equal(lost.clocks[0].filled, 3, "no castigamos dos veces el mismo fallo");
});

test("4) el misterio solo avanza con pistas reales reveladas", () => {
  const noClue = clocks.advanceClocks([mysteryClock()], { ...baseInput, outcome: "success" });
  assert.equal(noClue.clocks[0].filled, 0, "un éxito sin pista no arma la verdad");

  const withClues = clocks.advanceClocks([mysteryClock()], { ...baseInput, revealedClueCount: 3 });
  assert.equal(withClues.clocks[0].filled, 2, "capado al tope por turno");
});

test("5) la amenaza nace oculta y se destapa a mitad de carga", () => {
  const hidden = clocks.advanceClocks([threatClock({ segments: 8 })], { ...baseInput, outcome: "partial_success" });
  assert.equal(hidden.clocks[0].revealed, false, "1/8 sigue oculta");

  const surfaced = clocks.advanceClocks([threatClock({ segments: 8, filled: 3 })], { ...baseInput, outcome: "partial_success" });
  assert.equal(surfaced.clocks[0].revealed, true, "4/8 se destapa");
  assert.equal(surfaced.ticks[0].justRevealed, true, "el tick avisa que recién apareció");
});

test("6) al llenarse dispara pago, flag y presión de peligro; después queda congelado", () => {
  const fired = clocks.advanceClocks([threatClock({ filled: 3 })], { ...baseInput, outcome: "failure" });
  const clock = fired.clocks[0];
  assert.equal(clock.filled, 4);
  assert.equal(clock.firedAtTurn, 3);
  assert.equal(fired.dangerDelta, 2, "la amenaza cumplida aprieta el peligro");
  assert.deepEqual(fired.flags, ["clock_fired:t"]);
  assert.equal(fired.ticks[0].fired, true);
  assert.equal(fired.ticks[0].payoff, "Los muros se cierran.");

  const again = clocks.advanceClocks(fired.clocks, { ...baseInput, outcome: "failure", turn: 9 });
  assert.equal(again.clocks[0].filled, 4, "un reloj cumplido no vuelve a avanzar");
  assert.equal(again.ticks.length, 0);
  assert.equal(again.dangerDelta, 0, "el pago no se cobra dos veces");
});

test("7) la oportunidad cumplida da aire y el misterio no toca el peligro", () => {
  const opp = clocks.advanceClocks([opportunityClock({ filled: 3 })], { ...baseInput, outcome: "success" });
  assert.equal(opp.dangerDelta, -1, "ganar posición baja la presión");

  const mys = clocks.advanceClocks([mysteryClock({ filled: 3 })], { ...baseInput, revealedClueCount: 2 });
  assert.equal(mys.clocks[0].firedAtTurn, 3);
  assert.equal(mys.dangerDelta, 0, "saber la verdad no te salva, solo te da con qué jugar");
});

test("8) sin relojes no explota y no inventa presión", () => {
  const empty = clocks.advanceClocks(undefined, { ...baseInput, outcome: "failure" });
  assert.deepEqual(empty.clocks, []);
  assert.deepEqual(empty.ticks, []);
  assert.equal(empty.dangerDelta, 0);
});

test("9) toda campaña recibe presión, incluso una forjada sin relojes escritos", () => {
  const forged = clocks.createClocksForCampaign({
    id: "forjada", title: "X", clues: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
    threats: [{ id: "th", name: "El Cobrador", pressure: "El Cobrador reclama la deuda en sangre." }],
    forgeNotes: { summary: { objective: "Salvar a tu hermana antes del alba" } }
  });
  const kinds = forged.map((clock) => clock.kind);
  assert.ok(kinds.includes("threat") && kinds.includes("mystery") && kinds.includes("opportunity"));

  const threat = forged.find((clock) => clock.kind === "threat");
  assert.match(threat.name, /Cobrador/, "usa la amenaza real de la campaña");
  assert.equal(threat.payoff, "El Cobrador reclama la deuda en sangre.");
  assert.equal(threat.revealed, false, "la amenaza nace oculta");

  const mystery = forged.find((clock) => clock.kind === "mystery");
  assert.equal(mystery.segments, 4, "los segmentos siguen a las pistas reales (mínimo 4)");
});

test("10) una campaña sin datos igual arranca con una amenaza jugable", () => {
  const bare = clocks.createClocksForCampaign({ id: "vacia", title: "X", clues: [] });
  const threat = bare.find((clock) => clock.kind === "threat");
  assert.ok(threat && threat.payoff.length > 0, "hay pago aunque la campaña no declare nada");
  assert.ok(!bare.some((clock) => clock.kind === "mystery"), "sin pistas no hay reloj de misterio vacío");
});

test("11) la UI solo ve relojes revelados; el narrador los ve todos y marca los ocultos", () => {
  const set = [threatClock(), opportunityClock()];
  assert.deepEqual(clocks.visibleClocks(set).map((clock) => clock.id), ["o"]);

  const lines = clocks.clockPressureLines(set);
  assert.match(lines[0], /oculto/, "el narrador sabe que no debe nombrarla");
  assert.doesNotMatch(lines[1], /oculto/);

  const done = clocks.clockPressureLines([threatClock({ filled: 4, firedAtTurn: 2 })]);
  assert.match(done[0], /CUMPLIDO/);
});

test("12) el nombre del reloj es etiqueta, no oración: cabe en el rail de la partida", () => {
  // El LLM escribe objetivos como frase completa. En el rail de 279px eso parte en
  // dos líneas y el reloj deja de leerse como reloj.
  const largo = clocks.createClocksForCampaign({
    id: "larga", title: "X", clues: [],
    forgeNotes: { summary: { objective: "Impugná la deuda falsa antes de que el consejo la cobre." } }
  });
  const oportunidad = largo.find((clock) => clock.kind === "opportunity");
  assert.equal(oportunidad.name, "Impugná la deuda falsa", "corta en la subordinada, no a mitad de idea");

  // Sin subordinada donde cortar: recorte por longitud, siempre en borde de palabra.
  const sinCorte = clocks.createClocksForCampaign({
    id: "sincorte", title: "X", clues: [],
    forgeNotes: { summary: { objective: "Recuperar el sello menor del archivo inundado de Veldaran" } }
  });
  const recortado = sinCorte.find((clock) => clock.kind === "opportunity");
  assert.ok(recortado.name.length <= 35, `demasiado largo: ${recortado.name}`);
  assert.match(recortado.name, /…$/, "avisa que hay más texto");
  assert.doesNotMatch(recortado.name, /\s…$/, "no deja espacio colgando antes de los puntos");

  // El pago conserva la frase entera: el recorte es solo de UI.
  assert.ok(recortado.payoff.length > 0);

  // Un nombre que ya es etiqueta no se toca.
  const corto = clocks.createClocksForCampaign({
    id: "corta", title: "X", clues: [],
    forgeNotes: { summary: { objective: "Robar el sello" } }
  });
  assert.equal(corto.find((clock) => clock.kind === "opportunity").name, "Robar el sello");
});
