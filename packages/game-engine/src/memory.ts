import type { MemorySummary } from "./types";

export const initialMemory: MemorySummary = {
  clues: [],
  unresolvedThreads: ["Quien traiciono a la Casa del Lobo?", "Por que las almas dragon fueron encerradas?"],
  lastBeat: "El grupo inicia una travesia corta hacia una mazmorra llena de pactos rotos.",
  suspects: ["Lobo Acusado", "Bestia Maldita", "un heredero sin nombre"],
  betrayals: ["Alguien falsifico las garras para romper el pacto del clan."],
  bonds: ["Fiamy carga una deuda antigua con las almas dragon.", "Belo teme que proteger al inocente condene a la aldea.", "Miri escucha juramentos que nadie recuerda haber hecho."],
  stakes: ["Si el peligro llega a diez, la turba fuerza un juicio o una caceria."],
  currentTwist: "Las marcas parecen bestia, pero fueron hechas por una herramienta ritual.",
  facts: [],
  objects: [],
  npcs: [],
  locations: [],
  dangers: [],
  forbiddenContradictions: [],
  confirmedFacts: [],
  suspicions: [],
  damagedClues: [],
  npcStates: [],
  objectStates: [],
  openQuestions: ["Quien traiciono a la Casa del Lobo?", "Por que las almas dragon fueron encerradas?"]
};
