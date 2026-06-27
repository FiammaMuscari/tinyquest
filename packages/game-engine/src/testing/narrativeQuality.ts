import { validateTurnContextCoherence } from "../context-coherence";
import { getBotPersonalityProfile, validateBotPersonalityConsistency } from "../bot-personality";
import type { DungeonNarrationOutput } from "../types";
import type { ResolutionPlan } from "../resolution-plan";

export interface NarrativeQualityScore {
  coherence: number;
  tension: number;
  consequence: number;
  characterConsistency: number;
  sceneContinuity: number;
  clueValidity: number;
  emotionalImpact: number;
  uiClarity: number;
  dndFeeling: number;
  overall: number;
}

export interface NarrativeIssue {
  type:
    | "GENERIC_CONSEQUENCE"
    | "REPETITIVE_PHRASE"
    | "INVALID_CLUE"
    | "INVALID_NPC"
    | "WEAK_BOT_ACTION"
    | "FAILURE_LOOKS_LIKE_SUCCESS"
    | "NO_WORLD_CHANGE"
    | "DANGER_NOT_MANIFESTED"
    | "LOW_UI_CLARITY"
    | "LOW_TENSION"
    | "CONTINUITY_WARNING"
    | "AWKWARD_CONSEQUENCE"
    | "DOMAIN_MISMATCH"
    | "IMPOSSIBLE_OBJECT_ACTION"
    | "INCOMPATIBLE_CLUE"
    | "WRONG_TARGET_CONSEQUENCE"
    | "BOT_PERSONALITY_MISMATCH"
    | "BOT_GENERIC_MOMENT"
    | "BOT_ROLE_DRIFT"
    | "BOT_MEMORY_IGNORED";
  severity: "low" | "medium" | "high";
  message: string;
  evidence?: string;
}

export interface NarrativePlaytestTurn {
  turnNumber: number;
  actorId: string;
  actorName: string;
  actionText: string;
  rollTotal: number;
  dc: number;
  result: "success" | "partial" | "failure";
  phase: string;
  dangerBefore: number;
  dangerAfter: number;
  resolutionPlanSummary: {
    mustHappen: string[];
    mustNotHappen: string[];
    consequence: string;
    uiFocus?: unknown;
  };
  narration: string;
  warnings: string[];
  score: NarrativeQualityScore;
  issues: NarrativeIssue[];
  resolutionPlan?: ResolutionPlan;
  structuredNarration?: DungeonNarrationOutput;
}

export interface NarrativePlaytestReport {
  campaignId: string;
  campaignTitle: string;
  totalTurns: number;
  overallScore: NarrativeQualityScore;
  turns: NarrativePlaytestTurn[];
  bestTurns: NarrativePlaytestTurn[];
  worstTurns: NarrativePlaytestTurn[];
  repeatedPhrases: string[];
  topIssues: NarrativeIssue[];
  recommendations: string[];
  markdown: string;
}

const genericConsequencePattern = /\b(la tensión aumenta|la tension aumenta|el peligro gana terreno|la oposición aprovecha|la oposicion aprovecha|la ventaja se conserva|ventaja concreta|complicación concreta|complicacion concreta|puede revelar pista|puede revelar una pista|reducir peligro o abrir combate breve|algo cambia en el ambiente|lo ocurrido antes cambia|la escena cambia|la presión sube|la presion sube)\b/i;
const successLanguagePattern = /\b(revela toda la verdad|revela la verdad|descubre la verdad|confirma la prueba|resuelve el misterio|queda absuelto|obtiene una victoria limpia|ventaja clara|pista completa)\b/i;
const dangerManifestationPattern = /\b(turba|grito|campana|amenaza|bestia|sangre|huir|muerte|crisis|peligro|arma|golpe|temblor|persecución|persecucion|fuego|acorrala|rompe|corre)\b/i;
const concreteChangePattern = /\b(queda|deja|rompe|corta|abre|cierra|huye|confiesa|declara|pierde|gana|marca|mancha|bloquea|revela|duda|retrocede|avanza|cae|protege|hiere|alerta|contamina|desbloquea|desvía|desvia|aparta|expone|conserva|muestra|obliga)\b/i;
const weakBotPattern = /\b(proteger lo conseguido|tomar una decisión arriesgada|tomar una decision arriesgada|aceptar un coste|ayudar al grupo sin tomar riesgos|cubre al grupo sin alejarse)\b/i;
const awkwardConsequencePattern = /\buna parte de\s+(la|el|los|las)\b|para la escena|\bo aprovecha\b|\bo alguien\b|\bo lo\b|\bpuede\b|\bpodría\b|\bpodria\b|deja una contradicción visible|avance como provocación|\b(o|u)\b[^.]{0,32}\b(o|u)\b/i;
const actionVerbPattern = /\b(baja|mira|toca|cubre|aparta|cierra|abre|rompe|marca|mancha|retrocede|avanza|admite|calla|protege|encuentra|nota|limpia|golpea|bloquea|entrega|pierde|gana|separa|deja|coloca|empuja|vibra|responde|sostiene|coincide|conserva|muestra|muestran|declara|planta|patea|acusa|cae|detiene)\b/i;

function clampScore(value: number) {
  return Math.max(0, Math.min(10, Math.round(value * 10) / 10));
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function severityPenalty(issue: NarrativeIssue) {
  if (issue.severity === "high") return 2.5;
  if (issue.severity === "medium") return 1.4;
  return 0.7;
}

export function detectGenericConsequence(text: string) {
  return genericConsequencePattern.test(text.trim());
}

export function detectAwkwardConsequence(text: string): NarrativeIssue[] {
  const value = text.trim();
  const issues: NarrativeIssue[] = [];
  if (awkwardConsequencePattern.test(value)) issues.push({ type: "AWKWARD_CONSEQUENCE", severity: "high", message: "La consecuencia suena armada, condicional o contiene alternativas.", evidence: text });
  if (value.length < 48) issues.push({ type: "AWKWARD_CONSEQUENCE", severity: "medium", message: "La consecuencia es demasiado corta para explicar un cambio jugable.", evidence: text });
  if (!actionVerbPattern.test(value)) issues.push({ type: "AWKWARD_CONSEQUENCE", severity: "medium", message: "La consecuencia no contiene un verbo físico o social claro.", evidence: text });
  if (!/^[A-ZÁÉÍÓÚÑ][^.!?]{2,}/.test(value)) issues.push({ type: "AWKWARD_CONSEQUENCE", severity: "low", message: "La consecuencia no empieza con un sujeto claro.", evidence: text });
  return issues;
}

export function detectFailureLooksLikeSuccess(turn: Pick<NarrativePlaytestTurn, "result" | "narration" | "resolutionPlanSummary">) {
  if (turn.result !== "failure") return false;
  return successLanguagePattern.test(`${turn.narration}\n${turn.resolutionPlanSummary.consequence}`);
}

export function detectDangerNotManifested(turn: Pick<NarrativePlaytestTurn, "dangerAfter" | "narration" | "resolutionPlanSummary">) {
  if (turn.dangerAfter < 8) return false;
  return !dangerManifestationPattern.test(`${turn.narration}\n${turn.resolutionPlanSummary.consequence}`);
}

export function detectWeakBotBehavior(turn: Pick<NarrativePlaytestTurn, "actorId" | "actionText" | "narration">) {
  if (!turn.actorId.startsWith("bot-")) return false;
  return weakBotPattern.test(`${turn.actionText}\n${turn.narration}`);
}

export function detectNoWorldChange(turn: Pick<NarrativePlaytestTurn, "resolutionPlanSummary" | "narration">) {
  const text = `${turn.resolutionPlanSummary.consequence}\n${turn.narration}`;
  return !concreteChangePattern.test(text) || detectGenericConsequence(turn.resolutionPlanSummary.consequence);
}

export function detectRepetition(turns: Array<Pick<NarrativePlaytestTurn, "narration">>) {
  const counts = new Map<string, number>();
  for (const turn of turns) {
    const sentences = turn.narration
      .split(/[.!?\n]+/)
      .map((sentence) => sentence.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñáéíóúü\s]/gi, " ").replace(/\s+/g, " ").trim())
      .filter((sentence) => sentence.length >= 24);
    for (const sentence of new Set(sentences)) counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).map(([phrase]) => phrase);
}

function detectTurnIssues(turn: NarrativePlaytestTurn, previousTurns: NarrativePlaytestTurn[] = []): NarrativeIssue[] {
  const issues: NarrativeIssue[] = [];
  if (detectGenericConsequence(turn.resolutionPlanSummary.consequence)) issues.push({ type: "GENERIC_CONSEQUENCE", severity: "medium", message: "La consecuencia oficial suena vaga o reutilizable.", evidence: turn.resolutionPlanSummary.consequence });
  issues.push(...detectAwkwardConsequence(turn.resolutionPlanSummary.consequence));
  if (detectFailureLooksLikeSuccess(turn)) issues.push({ type: "FAILURE_LOOKS_LIKE_SUCCESS", severity: "high", message: "Un fallo está narrado como si revelara verdad o recompensa limpia.", evidence: turn.narration });
  if (detectDangerNotManifested(turn)) issues.push({ type: "DANGER_NOT_MANIFESTED", severity: "high", message: "El peligro alto no aparece físicamente en la escena.", evidence: turn.narration });
  if (detectWeakBotBehavior(turn)) issues.push({ type: "WEAK_BOT_ACTION", severity: "medium", message: "El bot conserva una acción abstracta en vez de una acción física concreta.", evidence: turn.actionText });
  if (detectNoWorldChange(turn)) issues.push({ type: "NO_WORLD_CHANGE", severity: "medium", message: "No queda claro qué cambió en el mundo o la escena.", evidence: turn.resolutionPlanSummary.consequence });
  if (!turn.resolutionPlanSummary.uiFocus && !turn.structuredNarration?.uiFocus) issues.push({ type: "LOW_UI_CLARITY", severity: "medium", message: "El turno no indica foco claro para la UI." });
  if (turn.structuredNarration) {
    if (!turn.structuredNarration.consequence?.summary) issues.push({ type: "NO_WORLD_CHANGE", severity: "high", message: "structuredNarration no trae consequence.summary." });
    if (turn.dangerAfter !== turn.dangerBefore && !turn.structuredNarration.dangerChange.manifestation.trim()) issues.push({ type: "DANGER_NOT_MANIFESTED", severity: "medium", message: "dangerChange no tiene manifestación." });
    const allowedSpeakers = new Set([turn.actorId, "narrator", ...(turn.resolutionPlan?.validContext.presentNpcIds ?? []), ...(turn.resolutionPlan?.botDirectives.map((bot) => bot.botId) ?? [])]);
    for (const line of turn.structuredNarration.dialogue) if (line.speakerKind !== "narrator" && !allowedSpeakers.has(line.speakerId)) issues.push({ type: "INVALID_NPC", severity: "high", message: `speakerId inválido en diálogo: ${line.speakerId}` });
    const allowedClues = new Set(turn.resolutionPlan?.cluePolicy.allowedClueIds ?? []);
    for (const clue of turn.structuredNarration.clueReveals) if (!turn.resolutionPlan?.cluePolicy.canRevealNewClue || !allowedClues.has(clue.clueId)) issues.push({ type: "INVALID_CLUE", severity: "high", message: `clueReveal inválido: ${clue.clueId}` });
    for (const moment of (turn.structuredNarration.companionMoments ?? [])) {
      if (/ayuda|apoya|hace algo|se mantiene/i.test(moment.action) && moment.action.length < 40) issues.push({ type: "BOT_GENERIC_MOMENT", severity: "medium", message: "companionMoment demasiado genérico." });
      const profile = getBotPersonalityProfile(moment.characterId);
      for (const code of validateBotPersonalityConsistency(moment, profile)) {
        issues.push({ type: code as NarrativeIssue["type"], severity: code === "BOT_ROLE_DRIFT" ? "high" : "medium", message: `${moment.characterName} contradice perfil ${profile.archetype}.`, evidence: moment.action });
      }
    }
    if (turn.resolutionPlan) {
      // The authored cast for this turn counts as "known" NPCs (not invented by the narrator).
      const castMemory = { npcs: turn.resolutionPlan.npcDirectives.map((npc) => npc.name).filter(Boolean) };
      for (const item of validateTurnContextCoherence(turn.resolutionPlan, turn.structuredNarration, { memory: castMemory })) {
        issues.push({ type: item.code === "DOMAIN_MISMATCH" ? "DOMAIN_MISMATCH" : item.code === "IMPOSSIBLE_OBJECT_ACTION" ? "IMPOSSIBLE_OBJECT_ACTION" : item.code === "INCOMPATIBLE_CLUE" ? "INCOMPATIBLE_CLUE" : item.code.includes("clue") ? "INVALID_CLUE" : item.code.includes("target") || item.code.includes("object") ? "WRONG_TARGET_CONSEQUENCE" : item.code.includes("npc") ? "INVALID_NPC" : item.code.includes("danger") ? "DANGER_NOT_MANIFESTED" : item.code.includes("failure") ? "FAILURE_LOOKS_LIKE_SUCCESS" : item.code.includes("partial") || item.code.includes("success") ? "NO_WORLD_CHANGE" : "GENERIC_CONSEQUENCE", severity: item.level === "error" ? "high" : "medium", message: item.message, evidence: item.evidence });
      }
    }
  }
  if (turn.narration.length < 80) issues.push({ type: "LOW_TENSION", severity: "low", message: "La narración es demasiado breve para generar tensión." });
  for (const warning of turn.warnings) issues.push({ type: "CONTINUITY_WARNING", severity: "medium", message: warning });
  const repeated = detectRepetition([...previousTurns, turn]);
  if (repeated.length) issues.push({ type: "REPETITIVE_PHRASE", severity: "medium", message: "Se repite una frase narrativa entre turnos.", evidence: repeated[0] });
  return issues;
}

export function scoreDungeonMasterOutput(turn: NarrativePlaytestTurn) {
  let coherence = 8.5;
  let tension = turn.dangerAfter >= 7 ? 8 : 6.8;
  let consequence = 8;
  let characterConsistency = 8;
  let sceneContinuity = 8;
  let clueValidity = 8.5;
  let emotionalImpact = 6.8;
  let uiClarity = turn.resolutionPlanSummary.uiFocus || turn.structuredNarration?.uiFocus ? 8 : 5;
  let dndFeeling = 7.2;

  for (const issue of turn.issues) {
    const penalty = severityPenalty(issue);
    if (issue.type === "GENERIC_CONSEQUENCE" || issue.type === "NO_WORLD_CHANGE" || issue.type === "AWKWARD_CONSEQUENCE") consequence -= penalty;
    if (issue.type === "REPETITIVE_PHRASE") { emotionalImpact -= penalty; dndFeeling -= penalty * 0.6; }
    if (issue.type === "INVALID_CLUE" || issue.type === "INCOMPATIBLE_CLUE") clueValidity -= penalty * 1.5;
    if (issue.type === "DOMAIN_MISMATCH" || issue.type === "IMPOSSIBLE_OBJECT_ACTION" || issue.type === "WRONG_TARGET_CONSEQUENCE") { coherence -= penalty * 1.2; consequence -= penalty; }
    if (issue.type === "INVALID_NPC" || issue.type === "WEAK_BOT_ACTION") characterConsistency -= penalty;
    if (issue.type === "BOT_PERSONALITY_MISMATCH" || issue.type === "BOT_GENERIC_MOMENT" || issue.type === "BOT_ROLE_DRIFT" || issue.type === "BOT_MEMORY_IGNORED") characterConsistency -= penalty * 1.4;
    if (issue.type === "FAILURE_LOOKS_LIKE_SUCCESS") { coherence -= penalty * 1.4; clueValidity -= penalty; dndFeeling -= penalty; }
    if (issue.type === "DANGER_NOT_MANIFESTED" || issue.type === "LOW_TENSION") tension -= penalty;
    if (issue.type === "LOW_UI_CLARITY") uiClarity -= penalty;
    if (issue.type === "CONTINUITY_WARNING") sceneContinuity -= penalty * 0.7;
  }

  if (!turn.narration.includes(turn.resolutionPlanSummary.consequence.slice(0, 24))) consequence -= 0.6;
  if (turn.result === "partial" && !/coste|pero|aunque|pierde|sube|duda|daña|expone|deuda/i.test(`${turn.narration} ${turn.resolutionPlanSummary.consequence}`)) consequence -= 1.2;
  if (turn.result === "success" && !/ventaja|abre|confirma|gana|revela|encuentra|avanza|reduce|conserva|muestra|obliga|aparta|desvía|desvia|protege|expone/i.test(`${turn.narration} ${turn.resolutionPlanSummary.consequence}`)) consequence -= 1;

  const core = {
    coherence: clampScore(coherence),
    tension: clampScore(tension),
    consequence: clampScore(consequence),
    characterConsistency: clampScore(characterConsistency),
    sceneContinuity: clampScore(sceneContinuity),
    clueValidity: clampScore(clueValidity),
    emotionalImpact: clampScore(emotionalImpact),
    uiClarity: clampScore(uiClarity),
    dndFeeling: clampScore(dndFeeling),
    overall: 0
  };
  core.overall = clampScore(average([core.coherence, core.tension, core.consequence, core.characterConsistency, core.sceneContinuity, core.clueValidity, core.emotionalImpact, core.uiClarity, core.dndFeeling]));
  return core;
}

export function evaluateNarrativeQuality(turn: NarrativePlaytestTurn, previousTurns: NarrativePlaytestTurn[] = []) {
  const issues = detectTurnIssues(turn, previousTurns);
  const scoredTurn = { ...turn, issues };
  const score = scoreDungeonMasterOutput(scoredTurn);
  return { score, issues };
}

function combineScores(turns: NarrativePlaytestTurn[]): NarrativeQualityScore {
  const keys: Array<keyof Omit<NarrativeQualityScore, "overall">> = ["coherence", "tension", "consequence", "characterConsistency", "sceneContinuity", "clueValidity", "emotionalImpact", "uiClarity", "dndFeeling"];
  const score = Object.fromEntries(keys.map((key) => [key, clampScore(average(turns.map((turn) => turn.score[key])))])) as Omit<NarrativeQualityScore, "overall">;
  return { ...score, overall: clampScore(average(keys.map((key) => score[key]))) };
}

function buildRecommendations(issues: NarrativeIssue[]) {
  const types = new Set(issues.map((issue) => issue.type));
  const recommendations: string[] = [];
  if (types.has("GENERIC_CONSEQUENCE") || types.has("NO_WORLD_CHANGE") || types.has("AWKWARD_CONSEQUENCE")) recommendations.push("Forzar consecuencias físicas concretas desde ResolutionPlan.consequence antes de narrar.");
  if (types.has("FAILURE_LOOKS_LIKE_SUCCESS")) recommendations.push("Revisar cluePolicy: los fallos deben complicar sin entregar pistas completas.");
  if (types.has("DANGER_NOT_MANIFESTED")) recommendations.push("Cuando danger >= 8, agregar mustHappen físico: turba, amenaza, pérdida o crisis inmediata.");
  if (types.has("WEAK_BOT_ACTION")) recommendations.push("Convertir intenciones de bots en acciones con ubicación, objeto o NPC presente.");
  if (types.has("REPETITIVE_PHRASE")) recommendations.push("Agregar lista de frases recientes prohibidas al prompt y al narrador local.");
  if (!recommendations.length) recommendations.push("Mantener ResolutionPlan como fuente de verdad y ampliar casos de playtest por campaña.");
  return recommendations;
}

export function generateNarrativeReport(turns: NarrativePlaytestTurn[], campaignId = "unknown", campaignTitle = "Campaña") : NarrativePlaytestReport {
  const sorted = [...turns].sort((a, b) => a.score.overall - b.score.overall);
  const repeatedPhrases = detectRepetition(turns);
  const allIssues = turns.flatMap((turn) => turn.issues);
  const issueCounts = new Map<string, NarrativeIssue & { count: number }>();
  for (const issue of allIssues) {
    const key = `${issue.type}:${issue.message}`;
    const current = issueCounts.get(key);
    issueCounts.set(key, { ...issue, evidence: current?.evidence ?? issue.evidence, count: (current?.count ?? 0) + 1 });
  }
  const topIssues = [...issueCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8).map(({ count: _count, ...issue }) => issue);
  const overallScore = combineScores(turns);
  const recommendations = buildRecommendations(allIssues);
  const bestTurns = sorted.slice(-3).reverse();
  const worstTurns = sorted.slice(0, 3);
  const markdown = buildMarkdown({ campaignId, campaignTitle, turns, overallScore, repeatedPhrases, topIssues, recommendations, bestTurns, worstTurns, totalTurns: turns.length });
  return { campaignId, campaignTitle, totalTurns: turns.length, overallScore, turns, bestTurns, worstTurns, repeatedPhrases, topIssues, recommendations, markdown };
}

function buildMarkdown(report: Omit<NarrativePlaytestReport, "markdown">) {
  const lines: string[] = [
    "# Narrative Playtest Report",
    "",
    "## Score general",
    `Overall: ${report.overallScore.overall}/10`,
    "",
    "## Resumen de campaña",
    `Campaña: ${report.campaignTitle} (${report.campaignId})`,
    `Turnos simulados: ${report.totalTurns}`,
    "",
    "## Peores turnos",
    ...report.worstTurns.map((turn) => `- Turno ${turn.turnNumber}: ${turn.score.overall}/10 — ${turn.issues[0]?.message ?? "sin issue crítico"}`),
    "",
    "## Mejores turnos",
    ...report.bestTurns.map((turn) => `- Turno ${turn.turnNumber}: ${turn.score.overall}/10 — ${turn.actionText}`),
    "",
    "## Issues repetidos",
    ...(report.topIssues.length ? report.topIssues.map((issue) => `- ${issue.type}: ${issue.message}`) : ["- Sin issues repetidos fuertes."]),
    "",
    "## Turnos"
  ];
  for (const turn of report.turns) {
    lines.push("", `### Turno ${turn.turnNumber}`, `- Actor: ${turn.actorName}`, `- Acción: ${turn.actionText}`, `- Tirada: ${turn.rollTotal} vs ${turn.dc}`, `- Resultado: ${turn.result}`, `- Fase: ${turn.phase}`, `- Peligro: ${turn.dangerBefore} → ${turn.dangerAfter}`, `- Must happen: ${turn.resolutionPlanSummary.mustHappen.join("; ")}`, `- Must not happen: ${turn.resolutionPlanSummary.mustNotHappen.join("; ")}`, `- Consecuencia oficial: ${turn.resolutionPlanSummary.consequence}`, `- Narración: ${turn.narration}`, `- Score: ${turn.score.overall}/10`, `- Issues: ${turn.issues.map((issue) => issue.type).join(", ") || "ninguno"}`);
  }
  lines.push("", "## Recomendaciones", ...report.recommendations.map((item) => `- ${item}`));
  return lines.join("\n");
}
