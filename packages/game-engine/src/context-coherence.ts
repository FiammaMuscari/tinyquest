import type { DungeonNarrationOutput, MemorySummary } from "./types";
import type { ResolutionPlan } from "./resolution-plan";

export type ContextCoherenceIssue = { level: "warning" | "error"; code: string; message: string; evidence?: string };

const abstractActionPattern = /\b(mover,? cubrir o negociar posición|mover,? cubrir o negociar posicion|proteger lo conseguido|tomar una decisión arriesgada|tomar una decision arriesgada|aceptar un coste|usar presión social|usar presion social|resolver la situación|resolver la situacion|buscar una ventaja|mover al aliado a cubierto|apartar la evidencia de las manos equivocadas)\b/i;
const genericLinePattern = /la decisión deja una marca clara|la decision deja una marca clara|obliga al grupo a moverse con cuidado|oposición aprovecha la repetición|oposicion aprovecha la repeticion|el peligro sube porque|la tensión aumenta|el peligro gana terreno|algo cambia/i;
const physicalDangerPattern = /turba|salida|puerta|piedra|campana|bestia|bosque|golpea|cierra|avanza|bloquea|soga|antorcha|aldeanos|grito/i;
const costPattern = /pero|coste|pierde|mancha|rompe|separa|cierra|bloquea|sube|daña|expone|retrocede|arranca|quita|tapa/i;
const advantagePattern = /admite|encuentra|nota|confirma|abre|protege|gana|limpia|revela|bloquea|separa|contradice|entrega|desvía|desvia|cae|aparta/i;

function issue(level: ContextCoherenceIssue["level"], code: string, message: string, evidence?: string): ContextCoherenceIssue {
  return { level, code, message, evidence };
}

export function isAbstractAction(action: string) {
  return abstractActionPattern.test(action.trim());
}

export function validateActionSpecificity(action: string): ContextCoherenceIssue[] {
  return isAbstractAction(action) ? [issue("error", "abstract-action", "La acción es una categoría interna y debe concretarse físicamente.", action)] : [];
}

function firstNpc(plan: ResolutionPlan) { return plan.npcDirectives[0]?.name ?? "el testigo"; }
function firstObject(plan: ResolutionPlan) { return plan.validContext.usedObjectIds?.[0]?.replace(/-/g, " ") ?? plan.validContext.presentObjectIds[0]?.replace(/-/g, " ") ?? "la prueba"; }

export function concretizeActionText(action: string, planLike: Pick<ResolutionPlan, "actorName" | "scene" | "validContext" | "npcDirectives">) {
  if (!isAbstractAction(action)) return action;
  const npc = firstNpc(planLike as ResolutionPlan);
  const object = firstObject(planLike as ResolutionPlan);
  const actor = planLike.actorName;
  if (/proteger|cubrir|mover/i.test(action)) return `${actor} se coloca entre ${npc} y la amenaza para impedir que la turba avance.`;
  if (/evidencia|conseguido/i.test(action)) return `${actor} toma ${object} y lo aparta de las manos de ${npc}.`;
  if (/negociar|presión|presion/i.test(action)) return `${actor} encara a ${npc} y exige una respuesta delante de todos.`;
  if (/arriesgada|coste|situación|situacion|ventaja/i.test(action)) return `${actor} bloquea la puerta más cercana para ganar tiempo real en ${planLike.scene.location}.`;
  return `${actor} convierte la intención en un gesto visible sobre ${object}.`;
}

function combinedOutputText(output: DungeonNarrationOutput) {
  return [
    output.narration,
    output.immediateAction.text,
    output.consequence.summary,
    output.consequence.physicalChange,
    output.consequence.socialChange,
    output.worldStateChange.text,
    output.dialogue.map((line) => line.line).join(" "),
    output.companionMoments.map((moment) => moment.action).join(" ")
  ].filter(Boolean).join("\n");
}

function allowsCrossTarget(plan: ResolutionPlan, forbiddenWord: string) {
  return [...plan.mustHappen, ...plan.mustNotHappen].some((item) => item.toLowerCase().includes(forbiddenWord));
}

export function validateActionTargetConsistency(plan: ResolutionPlan, output: DungeonNarrationOutput): ContextCoherenceIssue[] {
  const issues: ContextCoherenceIssue[] = [];
  const action = plan.actionText.toLowerCase();
  const target = `${plan.validContext.targetId ?? ""} ${firstObject(plan)}`.toLowerCase();
  const text = combinedOutputText(output).toLowerCase();
  const grilletes = /grillete|chains|cadena/.test(`${action} ${target}`);
  if (grilletes && /sello lunar|moon seal|moon-bell-seal/.test(text) && !allowsCrossTarget(plan, "sello")) {
    issues.push(issue("error", "target-drift", "El turno empieza en grilletes pero deriva al sello lunar sin permiso del ResolutionPlan.", output.consequence.summary));
  }
  const sello = /sello lunar|moon-seal|moon-bell-seal/.test(`${action} ${target}`);
  if (sello && /grillete|cadena/.test(text) && !allowsCrossTarget(plan, "grillete")) {
    issues.push(issue("warning", "target-drift", "El turno empieza en sello lunar pero menciona grilletes sin puente causal.", output.consequence.summary));
  }
  return issues;
}

export function validateSceneObjectConsistency(plan: ResolutionPlan, output: DungeonNarrationOutput): ContextCoherenceIssue[] {
  const issues: ContextCoherenceIssue[] = [];
  for (const id of output.worldStateChange.changedObjectIds) {
    if (!plan.validContext.presentObjectIds.includes(id)) issues.push(issue("error", "invalid-object", `Objeto cambiado no presente: ${id}.`, id));
  }
  return issues;
}

export function validateNpcIntroduction(plan: ResolutionPlan, output: DungeonNarrationOutput, memory?: Partial<MemorySummary>): ContextCoherenceIssue[] {
  const issues: ContextCoherenceIssue[] = [];
  const known = new Set([...(memory?.npcs ?? []), ...(memory?.npcStates ?? [])]);
  for (const line of output.dialogue) {
    if (line.speakerKind !== "npc") continue;
    const directive = plan.npcDirectives.find((npc) => npc.npcId === line.speakerId);
    if (!directive) continue;
    const knownByName = [...known].some((item) => item.includes(line.speakerName));
    const hasRoleInName = line.speakerName.includes(",") || /\b(aldeano|aldeana|alcalde|hermana|lobo acusado|testigo|aprendiz|molinero|campanera|alguacil)\b/i.test(line.speakerName);
    const intro = hasRoleInName || output.narration.includes(`${line.speakerName},`) || (directive.stateBefore && output.narration.toLowerCase().includes(directive.stateBefore.toLowerCase()));
    if (!knownByName && !intro) issues.push(issue("warning", "npc-not-introduced", `NPC nuevo sin rol o presentación: ${line.speakerName}.`, line.speakerName));
  }
  return issues;
}

export function validateNoRepeatedGenericLines(output: DungeonNarrationOutput, previousTurns: Array<{ narration?: string; consequence?: string }>): ContextCoherenceIssue[] {
  const text = combinedOutputText(output);
  const issues: ContextCoherenceIssue[] = [];
  if (genericLinePattern.test(text)) issues.push(issue("error", "generic-line", "La salida usa una frase genérica prohibida.", text.match(genericLinePattern)?.[0]));
  for (const previous of previousTurns) {
    if (previous.consequence && previous.consequence === output.consequence.summary) issues.push(issue("warning", "repeated-consequence", "La consecuencia repite exactamente un turno anterior.", output.consequence.summary));
    if (previous.narration && previous.narration === output.narration) issues.push(issue("warning", "repeated-narration", "La narración repite exactamente un turno anterior.", output.narration));
  }
  return issues;
}

export function validateOutcomeNarrationConsistency(plan: ResolutionPlan, output: DungeonNarrationOutput): ContextCoherenceIssue[] {
  const issues: ContextCoherenceIssue[] = [];
  const text = combinedOutputText(output).toLowerCase();
  if (plan.roll.result === "failure") {
    if (output.clueReveals.some((clue) => clue.mode === "full") || /revela toda la verdad|confirma la prueba|queda absuelto|resuelve/.test(text)) issues.push(issue("error", "failure-looks-success", "El fallo parece revelar una recompensa completa.", output.consequence.summary));
  }
  if (plan.roll.result === "partial" && !costPattern.test(text)) issues.push(issue("error", "partial-without-cost", "El parcial no muestra un coste concreto.", output.consequence.summary));
  if (plan.roll.result === "success" && !advantagePattern.test(text)) issues.push(issue("warning", "success-without-advantage", "El éxito no muestra una ventaja clara.", output.consequence.summary));
  if (plan.scene.dangerAfter > plan.scene.dangerBefore && !physicalDangerPattern.test(output.dangerChange.manifestation)) issues.push(issue("error", "danger-not-physical", "El aumento de peligro no se manifiesta físicamente.", output.dangerChange.manifestation));
  if (!plan.cluePolicy.canRevealNewClue && output.clueReveals.length) issues.push(issue("error", "forbidden-clue-reveal", "Hay clueReveals aunque cluePolicy lo prohíbe."));
  return issues;
}

export function validateTurnContextCoherence(plan: ResolutionPlan, output: DungeonNarrationOutput, options: { memory?: Partial<MemorySummary>; previousTurns?: Array<{ narration?: string; consequence?: string }> } = {}) {
  return [
    ...validateActionSpecificity(plan.actionText),
    ...validateActionTargetConsistency(plan, output),
    ...validateSceneObjectConsistency(plan, output),
    ...validateNpcIntroduction(plan, output, options.memory),
    ...validateNoRepeatedGenericLines(output, options.previousTurns ?? []),
    ...validateDomainConsistency(plan, output),
    ...validateObjectAffordance(plan, output),
    ...validateOutcomeNarrationConsistency(plan, output)
  ];
}

export type NarrativeDomain = "body" | "bell" | "chains" | "letter" | "seal" | "crowd" | "beast" | "npc" | "location" | "generic";

export interface ObjectAffordance {
  objectId: string;
  domain: NarrativeDomain;
  canBeHidden: boolean;
  canBeCoveredByHand: boolean;
  canBeMovedByOnePerson: boolean;
  canBeDamaged: boolean;
  canBeInspected: boolean;
  allowedPhysicalVerbs: string[];
  forbiddenPhysicalVerbs: string[];
}

export function inferActionDomain(actionText: string, targetId = "", targetKind = ""): NarrativeDomain {
  const text = `${actionText} ${targetId} ${targetKind}`.toLowerCase();
  if (/mordida|herida|cadáver|cadaver|cuerpo|sangre|garra/.test(text)) return "body";
  if (/campana|badajo|cuerda|sonido|rope|bell/.test(text)) return "bell";
  if (/grillete|cadena|cadenas|llave|muñeca|muneca|chains|silver-chain/.test(text)) return "chains";
  if (/carta|firma|tinta|deuda|coartada|letter|ledger|acta/.test(text)) return "letter";
  if (/sello|cera|lunar|plata|seal/.test(text)) return "seal";
  if (/turba|multitud|pedrada|ejecución|ejecucion|piedra|mob|nicolás|nicolas|proteger|salvar/.test(text)) return "crowd";
  if (/bestia|bosque|aullido|lobo|beast|wolf/.test(text)) return "beast";
  if (/interrogar|pedir verdad|preguntar|confrontar|negociar/.test(text) || targetKind === "npc") return "npc";
  if (/ruta|puerta|camino|salida|location/.test(text)) return "location";
  return "generic";
}

export function inferDomainFromId(id = "", label = ""): NarrativeDomain {
  const text = `${id} ${label}`.toLowerCase();
  if (id.toLowerCase() === "bell" || label.toLowerCase() === "campana") return "bell";
  if (id.toLowerCase() === "letter" || label.toLowerCase() === "carta") return "letter";
  if (id.toLowerCase() === "seal" || label.toLowerCase() === "sello") return "seal";
  if (/claw|garra|mordida|herida|cadáver|cadaver|body|sangre/.test(text)) return "body";
  if (/^bell$|bell|campana|badajo|rope|cuerda|sonido/.test(text)) return "bell";
  if (/chain|grillete|cadena|silver-burn|plata|llave/.test(text)) return "chains";
  if (/letter|carta|ledger|acta|tinta|deuda|coartada/.test(text)) return "letter";
  if (/seal|sello|cera|lunar/.test(text)) return "seal";
  if (/mob|turba|multitud|pedrada|ejecución|ejecucion|nicolás|nicolas/.test(text)) return "crowd";
  if (/beast|bestia|bosque|aullido|lobo/.test(text)) return "beast";
  return "generic";
}

export function inferClueDomain(clue: { id?: string; title?: string; description?: string }): NarrativeDomain {
  return inferDomainFromId(clue.id, `${clue.title ?? ""} ${clue.description ?? ""}`);
}

export function inferObjectDomain(object: { id?: string; name?: string; description?: string }): NarrativeDomain {
  return inferDomainFromId(object.id, `${object.name ?? ""} ${object.description ?? ""}`);
}

export function domainsCompatible(actionDomain: NarrativeDomain, candidateDomain: NarrativeDomain) {
  if (actionDomain === "generic" || candidateDomain === "generic") return true;
  if (actionDomain === candidateDomain) return true;
  if (actionDomain === "npc") return true;
  if (actionDomain === "crowd" && (candidateDomain === "body" || candidateDomain === "chains")) return true;
  if (actionDomain === "bell" && candidateDomain === "seal") return true;
  if (actionDomain === "seal" && candidateDomain === "bell") return true;
  return false;
}

function isExplicitlyAllowedByPlan(candidateId: string, candidateLabel: string, candidateDomain: NarrativeDomain, mustHappen: string[] = []) {
  const domainText = candidateDomain === "body" ? "mordida herida cadáver cuerpo sangre corte"
    : candidateDomain === "bell" ? "campana badajo cuerda sonido"
      : candidateDomain === "chains" ? "grillete cadena llave muñeca"
        : candidateDomain === "letter" ? "carta firma tinta deuda coartada"
          : candidateDomain === "seal" ? "sello cera lunar plata símbolo"
            : candidateDomain === "crowd" ? "turba multitud pedrada ejecución aldeanos"
              : candidateDomain;
  const idNeedle = candidateId.toLowerCase();
  const labelNeedle = candidateLabel.toLowerCase();
  return mustHappen.some((item) => {
    const text = item.toLowerCase();
    return text.includes(idNeedle) || text.includes(labelNeedle) || domainText.split(/\s+/).some((word) => text.includes(word));
  });
}

export function selectCompatibleClue(input: { actionText: string; targetId?: string; targetKind?: string; availableClueIds: string[]; knownClueIds?: string[]; labels?: Record<string, string>; mustHappen?: string[] }) {
  const actionDomain = inferActionDomain(input.actionText, input.targetId, input.targetKind);
  const pool = input.availableClueIds.filter((id) => !(input.knownClueIds ?? []).includes(id));
  const candidates = (pool.length ? pool : input.availableClueIds).map((id) => {
    const label = input.labels?.[id] ?? id;
    const domain = inferClueDomain({ id, title: label });
    const explicit = isExplicitlyAllowedByPlan(id, label, domain, input.mustHappen);
    const score = domainsCompatible(actionDomain, domain) ? (actionDomain === domain ? 10 : 4) : explicit ? 3 : 0;
    return { clueId: id, title: label, domain, score };
  }).sort((a, b) => b.score - a.score);
  return candidates.find((candidate) => candidate.score > 0);
}

export function selectCompatibleObject(input: { actionText: string; targetId?: string; targetKind?: string; presentObjectIds: string[]; labels?: Record<string, string>; mustHappen?: string[] }) {
  const actionDomain = inferActionDomain(input.actionText, input.targetId, input.targetKind);
  const candidates = input.presentObjectIds.map((id) => {
    const label = input.labels?.[id] ?? id;
    const domain = inferObjectDomain({ id, name: label });
    const explicit = isExplicitlyAllowedByPlan(id, label, domain, input.mustHappen);
    const score = id === input.targetId ? 20 : domainsCompatible(actionDomain, domain) ? (actionDomain === domain ? 10 : 4) : explicit ? 3 : 0;
    return { objectId: id, label, domain, score };
  }).sort((a, b) => b.score - a.score);
  return candidates.find((candidate) => candidate.score > 0);
}

export function getObjectAffordance(objectId: string, label = objectId): ObjectAffordance {
  const domain = inferDomainFromId(objectId, label);
  const base = { objectId, domain, canBeDamaged: true, canBeInspected: true };
  if (domain === "bell") return { ...base, canBeHidden: false, canBeCoveredByHand: false, canBeMovedByOnePerson: false, allowedPhysicalVerbs: ["bloquear vista", "tocar", "inspeccionar", "hacer sonar"], forbiddenPhysicalVerbs: ["guardar bajo la capa", "cubrir con la palma", "apartar de la vista"] };
  if (domain === "letter") return { ...base, canBeHidden: true, canBeCoveredByHand: true, canBeMovedByOnePerson: true, allowedPhysicalVerbs: ["guardar", "doblar", "rasgar", "cubrir"], forbiddenPhysicalVerbs: [] };
  if (domain === "seal") return { ...base, canBeHidden: true, canBeCoveredByHand: true, canBeMovedByOnePerson: true, allowedPhysicalVerbs: ["cubrir con la palma", "guardar", "raspar", "romper"], forbiddenPhysicalVerbs: [] };
  if (domain === "chains") return { ...base, canBeHidden: false, canBeCoveredByHand: false, canBeMovedByOnePerson: true, allowedPhysicalVerbs: ["arrastrar", "levantar", "patear", "inspeccionar"], forbiddenPhysicalVerbs: ["guardar bajo la capa", "cubrir con la palma"] };
  return { ...base, canBeHidden: false, canBeCoveredByHand: false, canBeMovedByOnePerson: true, allowedPhysicalVerbs: ["inspeccionar", "mover", "bloquear"], forbiddenPhysicalVerbs: [] };
}

export function validatePhysicalAffordance(text: string, objectId: string, label = objectId): ContextCoherenceIssue[] {
  const affordance = getObjectAffordance(objectId, label);
  const lower = text.toLowerCase();
  const issues: ContextCoherenceIssue[] = [];
  if (!affordance.canBeHidden && /\b(guarda|esconde)\b[\s\S]{0,80}\bbajo (su |la )?capa\b/.test(lower)) issues.push(issue("error", "IMPOSSIBLE_OBJECT_ACTION", `${label} no puede guardarse bajo la capa.`, text));
  if (!affordance.canBeCoveredByHand && /\b(cubre|tapa)\b[\s\S]{0,80}\b(con la palma|con la mano)\b|\bpalma\b/.test(lower)) issues.push(issue("error", "IMPOSSIBLE_OBJECT_ACTION", `${label} no puede cubrirse con la palma.`, text));
  if (!affordance.canBeMovedByOnePerson && /aparta .*de la vista|lo aparta|la aparta|mueve .*campana/.test(lower)) issues.push(issue("error", "IMPOSSIBLE_OBJECT_ACTION", `${label} no puede apartarse físicamente así.`, text));
  return issues;
}

export function validateDomainConsistency(plan: ResolutionPlan, output: DungeonNarrationOutput): ContextCoherenceIssue[] {
  const issues: ContextCoherenceIssue[] = [];
  const actionDomain = inferActionDomain(plan.actionText, plan.validContext.targetId, plan.validContext.targetKind);
  const text = combinedOutputText(output);
  const mentionedDomains: NarrativeDomain[] = [];
  if (/mordida|herida|cadáver|cadaver|sangre|garra/i.test(text)) mentionedDomains.push("body");
  if (/campana|badajo|cuerda|sonó|sono/i.test(text)) mentionedDomains.push("bell");
  if (/grillete|cadena|plata/i.test(text)) mentionedDomains.push("chains");
  if (/carta|firma|tinta|deuda|acta/i.test(text)) mentionedDomains.push("letter");
  if (/sello|cera|lunar/i.test(text)) mentionedDomains.push("seal");
  for (const domain of mentionedDomains) {
    const explicit = [...plan.mustHappen, ...plan.mustNotHappen].some((item) => inferDomainFromId("", item) === domain);
    if (!domainsCompatible(actionDomain, domain) && !explicit) issues.push(issue("error", "DOMAIN_MISMATCH", `La acción pertenece a ${actionDomain} pero la salida deriva a ${domain}.`, text));
  }
  for (const clue of output.clueReveals) {
    const domain = inferClueDomain({ id: clue.clueId, title: clue.title, description: clue.text });
    if (!domainsCompatible(actionDomain, domain)) issues.push(issue("error", "INCOMPATIBLE_CLUE", `La pista ${clue.clueId} no corresponde al dominio ${actionDomain}.`, clue.text));
  }
  return issues;
}

export function validateObjectAffordance(plan: ResolutionPlan, output: DungeonNarrationOutput): ContextCoherenceIssue[] {
  const text = combinedOutputText(output);
  const used = new Set([...(plan.validContext.usedObjectIds ?? []), ...output.worldStateChange.changedObjectIds]);
  if (plan.validContext.targetKind === "object" && plan.validContext.targetId) used.add(plan.validContext.targetId);
  const issues: ContextCoherenceIssue[] = [];
  for (const objectId of used) {
    const label = objectId.replace(/-/g, " ");
    issues.push(...validatePhysicalAffordance(text, objectId, label));
  }
  return issues;
}
