import { rollDie } from "./dice";
import type { CampaignActionType, CheckOutcome, ConsequenceEntry, ConsequenceResult } from "./types";

export type ConsequenceContext = {
  actionType?: CampaignActionType;
  targetKind?: string;
  outcome?: CheckOutcome;
  dangerBand?: "low" | "medium" | "high" | "critical";
  usedTexts?: string[];               // consecuencias ya narradas en la escena (no repetir)
  campaignBank?: ConsequenceEntry[];  // cascada: campaña → default
};

// Banco default: concreto y jugable, agrupado por tipo de acción y banda de peligro.
// Los campos de match ausentes son comodín.
export const DEFAULT_CONSEQUENCE_BANK: ConsequenceEntry[] = [
  // Genéricas (siempre matchean) — las 6 originales, conservadas como piso.
  { id: "core-energy", text: "Pierdes 1 energia: el esfuerzo deja a tu personaje sin aire en el peor momento.", effects: { energyDelta: -1 } },
  { id: "core-danger", text: "Peligro +2: una patrulla, trampa o testigo hostil gana posicion.", effects: { dangerDelta: 1 } },
  { id: "core-route", text: "La ruta cambia: el acceso directo queda cerrado y obliga a buscar otra entrada." },
  { id: "core-partial-proof", text: "La prueba queda incompleta: sirve para sospechar, pero no alcanza para acusar sin otro paso.", effects: { clue: "La prueba necesita una segunda confirmacion." } },
  { id: "core-broken-object", text: "Un objeto clave se rompe; conserva valor como prueba, pero ya no sirve como herramienta.", effects: { vitalityDelta: -1 } },
  { id: "core-threat-time", text: "La amenaza gana tiempo: se aleja, deja un rastro y obliga a elegir entre perseguir o proteger la escena.", effects: { dangerDelta: 1 } },
  // Sociales (hablar / negociar / mentir / confrontar)
  { id: "social-witness", text: "Alguien escuchó de más: la conversación tiene ahora un testigo que puede venderla.", match: { actionTypes: ["interrogar_npc", "confrontar_npc", "negociar", "mentir"] }, effects: { dangerDelta: 1 } },
  { id: "social-doubt", text: "La pregunta revela lo que el grupo sabe: la otra parte ajusta su historia antes de la próxima ronda.", match: { actionTypes: ["interrogar_npc", "confrontar_npc"] } },
  { id: "social-debt", text: "La puerta se abre, pero queda una deuda dicha en voz baja que alguien va a cobrar.", match: { actionTypes: ["negociar", "mentir"], outcomes: ["partial_success"] } },
  { id: "social-closed", text: "El tono falla y la persona se cierra: hará falta otra palanca, no más palabras.", match: { actionTypes: ["interrogar_npc", "negociar"], outcomes: ["failure"] } },
  // Investigación / evidencia
  { id: "evidence-contaminated", text: "El apuro contamina el detalle: lo visto sigue valiendo, pero cualquiera puede negarlo.", match: { actionTypes: ["investigar_objeto", "comparar_evidencia"] }, effects: { clue: "La prueba necesita una segunda confirmacion." } },
  { id: "evidence-watched", text: "Alguien nota el interés del grupo en ese detalle y ahora también lo mira.", match: { actionTypes: ["investigar_objeto", "comparar_evidencia", "usar_objeto"] }, effects: { dangerDelta: 1 } },
  { id: "evidence-time", text: "El examen consume la ventana: lo que quedaba por revisar ya no estará intacto.", match: { actionTypes: ["investigar_objeto"], outcomes: ["failure"] } },
  // Combate / físico
  { id: "combat-bruise", text: "El golpe entra igual: -1 vitalidad y la certeza de que el rival aprende rápido.", match: { actionTypes: ["combatir"] }, effects: { vitalityDelta: -1 } },
  { id: "combat-noise", text: "El choque hace ruido: refuerzos o curiosos se acercan a la escena.", match: { actionTypes: ["combatir", "proteger_aliado"] }, effects: { dangerDelta: 1 } },
  { id: "combat-ground", text: "El rival cede terreno pero elige dónde: la próxima posición lo favorece.", match: { actionTypes: ["combatir"], outcomes: ["partial_success"] } },
  // Peligro alto / crítico
  { id: "danger-exposure", text: "Con la presión al límite, el error deja a alguien del grupo expuesto a la vista de todos.", match: { dangerBands: ["high", "critical"] }, effects: { dangerDelta: 1 } },
  { id: "danger-forced-choice", text: "Ya no hay margen: la próxima acción tendrá que elegir entre dos cosas que importan.", match: { dangerBands: ["critical"] } }
];

function entryMatches(entry: ConsequenceEntry, ctx: ConsequenceContext): boolean {
  const match = entry.match;
  if (!match) return true;
  if (match.actionTypes && (!ctx.actionType || !match.actionTypes.includes(ctx.actionType))) return false;
  if (match.outcomes && (!ctx.outcome || !match.outcomes.includes(ctx.outcome))) return false;
  if (match.dangerBands && (!ctx.dangerBand || !match.dangerBands.includes(ctx.dangerBand))) return false;
  if (match.targetKinds && (!ctx.targetKind || !match.targetKinds.includes(ctx.targetKind))) return false;
  return true;
}

function toResult(entry: ConsequenceEntry, roll: ConsequenceResult["roll"], source: ConsequenceResult["source"]): ConsequenceResult {
  return {
    roll,
    text: entry.text,
    dangerDelta: entry.effects?.dangerDelta ?? 0,
    energyDelta: entry.effects?.energyDelta ?? 0,
    vitalityDelta: entry.effects?.vitalityDelta ?? 0,
    clue: entry.effects?.clue,
    entryId: entry.id,
    source
  };
}

// Dado visible sobre las entries que matchean, con cascada campaña → default y
// draw sin repetición dentro de la escena (usedTexts).
export function rollConsequence(ctx: ConsequenceContext = {}): ConsequenceResult {
  const used = ctx.usedTexts ?? [];
  const isUsed = (entry: ConsequenceEntry) => used.some((text) => text.includes(entry.text) || entry.text.includes(text));

  const campaignPool = (ctx.campaignBank ?? []).filter((entry) => entryMatches(entry, ctx));
  const defaultPool = DEFAULT_CONSEQUENCE_BANK.filter((entry) => entryMatches(entry, ctx));

  // Prioridad: campaña sin usar → default sin usar → campaña → default (nunca sin resultado).
  const pools: Array<[ConsequenceEntry[], ConsequenceResult["source"]]> = [
    [campaignPool.filter((entry) => !isUsed(entry)), "campaign"],
    [defaultPool.filter((entry) => !isUsed(entry)), "default"],
    [campaignPool, "campaign"],
    [defaultPool, "default"]
  ];
  const [pool, source] = pools.find(([candidates]) => candidates.length > 0) ?? [DEFAULT_CONSEQUENCE_BANK, "default"];

  // El ritual del dado se conserva: d8 si hay 7+ opciones, d6 si no.
  // Si el pool excede las caras, se priorizan las entries más específicas al contexto
  // (más criterios de match) y el dado mapea 1:1 sobre esa selección.
  const die = pool.length >= 7 ? "d8" : "d6";
  const sides = die === "d8" ? 8 : 6;
  const specificity = (entry: ConsequenceEntry) => (entry.match ? Object.keys(entry.match).length : 0);
  const ranked = [...pool].sort((a, b) => specificity(b) - specificity(a)).slice(0, sides);
  const roll = rollDie(die);
  const entry = ranked[(roll.value - 1) % ranked.length];
  return toResult(entry, roll, source);
}
