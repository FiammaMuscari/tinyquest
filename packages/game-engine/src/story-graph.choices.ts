import type { AvailableChoice, CampaignBlueprint, ObjectRuntimeState, StoryGraph, StoryGraphRuntime, UniversalActionType, UniversalStatePatch } from "./story-graph.types";
import { applyUniversalStatePatch } from "./story-graph.runtime";

const abstractLabelPattern = /aceptar coste social|forzar reacción social|proteger, guardar o presentar|empujar la escena|cambiar el enfoque|no repetir|consecuencia nueva basada/i;

function riskFor(cost: number): "low" | "medium" | "high" {
  return cost >= 2 ? "high" : cost === 1 ? "medium" : "low";
}

function words(text: string, max = 7): string {
  return text.split(/\s+/).slice(0, max).join(" ").replace(/[.;,:]+$/, "");
}

function outcome(choiceId: string, kind: string, summary: string, visibleConsequence: string, patch: UniversalStatePatch, mustMention: string[]) {
  return { outcomeId: `${choiceId}:${kind}`, kind, factualSummary: summary, visibleConsequence, patch, narrationHints: { mustMention, mustNotMention: ["actúa sobre", "la acción sale mal", "pieza que debe encajar"], style: "escena concreta" } };
}

function makeChoice(params: { templateId: string; choiceId: string; label: string; type: UniversalActionType; targetIds: string[]; energyCost: number; reason: string; preview: string; patch: UniversalStatePatch; successKind?: string; partialKind?: string; failureKind?: string }): AvailableChoice {
  return {
    choiceId: params.choiceId,
    label: params.label,
    type: params.type,
    targetIds: params.targetIds,
    energyCost: params.energyCost,
    risk: riskFor(params.energyCost),
    reasonAvailable: params.reason,
    unlockedBy: [],
    previewHint: params.preview,
    templateId: params.templateId,
    outcome: {
      success: outcome(params.choiceId, params.successKind ?? "success", params.preview, params.preview, params.patch, params.targetIds),
      partial: outcome(params.choiceId, params.partialKind ?? "partial", `${params.preview}, pero con coste.`, params.preview, { ...params.patch, clockChanges: [{ clockId: "pressure", delta: 1 }] }, params.targetIds),
      failure: outcome(params.choiceId, params.failureKind ?? "failure", `La acción sobre ${params.label} se complica.`, "La presión sube y la oportunidad se vuelve más cara.", { clockChanges: [{ clockId: "pressure", delta: 1 }] }, params.targetIds)
    }
  };
}

function currentNode(graph: StoryGraph, runtime: StoryGraphRuntime) {
  return graph.nodes[runtime.currentNodeId];
}

function presentObjects(blueprint: CampaignBlueprint, runtime: StoryGraphRuntime, locationId: string) {
  return Object.values(runtime.objectStates).filter((object) => object.locationId === locationId && object.status !== "perdido").map((state) => ({ state, seed: blueprint.objects.find((object) => object.id === state.objectId)! })).filter((item) => item.seed);
}

function presentCharacters(blueprint: CampaignBlueprint, runtime: StoryGraphRuntime, locationId: string) {
  return Object.values(runtime.characterStates).filter((character) => character.locationId === locationId).map((state) => ({ state, seed: blueprint.cast.find((character) => character.id === state.characterId)! })).filter((item) => item.seed);
}

function choiceWasUsed(runtime: StoryGraphRuntime, id: string) {
  return Boolean(runtime.choiceMemory[id]?.status === "used" || runtime.choiceMemory[id]?.status === "exhausted");
}

function mutationFor(choice: AvailableChoice, runtime: StoryGraphRuntime, blueprint: CampaignBlueprint): AvailableChoice | null {
  if (!choiceWasUsed(runtime, choice.choiceId)) return choice;
  const target = choice.targetIds[0];
  const npc = blueprint.cast.find((character) => character.id === target);
  const object = blueprint.objects.find((item) => item.id === target);
  const suffixes = ["followup", "risk", "protect"];
  const suffix = suffixes.find((item) => !choiceWasUsed(runtime, `${choice.choiceId}:${item}`));
  if (!suffix) return null;
  if (npc) {
    const label = suffix === "followup" ? `Pedirle a ${npc.name} que sostenga su versión` : suffix === "risk" ? `Exponer a ${npc.name} frente a la presión` : `Proteger a ${npc.name} de represalias`;
    return { ...choice, choiceId: `${choice.choiceId}:${suffix}`, label, type: suffix === "protect" ? "proteger_aliado" : "interrogar_npc", reasonAvailable: `${npc.name} ya reaccionó; la opción muta según su estado.`, previewHint: "El NPC cambia su postura o queda en riesgo." };
  }
  if (object) {
    const label = suffix === "followup" ? `Usar ${object.name} como prueba` : suffix === "risk" ? `Arriesgar ${object.name} ante todos` : `Guardar ${object.name} antes de perderlo`;
    return { ...choice, choiceId: `${choice.choiceId}:${suffix}`, label, type: suffix === "protect" ? "proteger_aliado" : "presentar_prueba", reasonAvailable: `${object.name} ya fue usado; ahora importa qué hacen con la prueba.`, previewHint: "La prueba cambia de valor público o queda protegida." };
  }
  return null;
}

export function generateChoicesForNode(graph: StoryGraph, runtime: StoryGraphRuntime): AvailableChoice[] {
  const blueprint = graph.blueprint;
  const node = currentNode(graph, runtime);
  const objects = presentObjects(blueprint, runtime, node.locationId);
  const characters = presentCharacters(blueprint, runtime, node.locationId);
  const choices: AvailableChoice[] = [];

  for (const { state, seed } of objects) {
    const clueId = seed.relatedClueIds.find((id) => runtime.clueStates[id]?.status === "hidden") ?? seed.relatedClueIds[0];
    if ((seed.kind === "evidence" || seed.kind === "document" || seed.kind === "relic" || seed.kind === "tool") && state.status !== "confirmado") {
      choices.push(makeChoice({ templateId: "investigate_object", choiceId: `investigate:${seed.id}`, label: `Revisar ${seed.name}`, type: "investigar_objeto", targetIds: [seed.id], energyCost: 0, reason: `${seed.name} está presente en ${node.title}.`, preview: `Puede revelar qué importa de ${seed.name}.`, patch: { objectChanges: [{ objectId: seed.id, status: "examinado" }], clueChanges: clueId ? [{ clueId, status: "revealed", revealedBy: [`investigate:${seed.id}`] }] : [] }, successKind: "evidence_confirmed", partialKind: "evidence_partial", failureKind: "evidence_contaminated" }));
    }
  }

  const knownEvidence = objects.find(({ state, seed }) => state.status === "examinado" || seed.relatedClueIds.some((id) => runtime.clueStates[id]?.status !== "hidden"));
  if (knownEvidence) {
    const other = objects.find((item) => item.seed.id !== knownEvidence.seed.id);
    if (other) choices.push(makeChoice({ templateId: "compare_evidence", choiceId: `compare:${knownEvidence.seed.id}:${other.seed.id}`, label: `Comparar ${knownEvidence.seed.name} con ${other.seed.name}`, type: "comparar_evidencia", targetIds: [knownEvidence.seed.id, other.seed.id], energyCost: 0, reason: "Hay dos pruebas o señales en la misma rama.", preview: "Puede convertir una duda en contradicción material.", patch: { objectChanges: [{ objectId: knownEvidence.seed.id, status: "confirmado" }], endingScoreDelta: { truth: 1 } }, successKind: "evidence_confirmed", partialKind: "evidence_partial", failureKind: "evidence_contaminated" }));
  }

  for (const { state, seed } of characters) {
    const clueId = state.knowsClueIds.find((id) => !state.revealedClueIds.includes(id) && runtime.clueStates[id]?.status === "hidden");
    if (clueId) choices.push(makeChoice({ templateId: "question_npc", choiceId: `question:${seed.id}:${clueId}`, label: `Preguntar a ${seed.name} por ${words(runtime.clueStates[clueId].text, 5)}`, type: "interrogar_npc", targetIds: [seed.id], energyCost: 0, reason: `${seed.name} está presente y sabe algo relevante.`, preview: `${seed.name} puede revelar o negar una parte de la verdad.`, patch: { characterChanges: [{ characterId: seed.id, revealedClueIds: [...state.revealedClueIds, clueId], attitude: state.attitude === "hostil" ? "asustado" : "colaborador" }], clueChanges: [{ clueId, status: "revealed", revealedBy: [`question:${seed.id}`] }] }, successKind: "npc_confession", partialKind: "npc_evasion", failureKind: "npc_closes_off" }));
    if (seed.archetype === "authority" || seed.archetype === "rival" || seed.archetype === "traitor") choices.push(makeChoice({ templateId: "confront_authority", choiceId: `confront:${seed.id}`, label: `Confrontar a ${seed.name}`, type: "confrontar_npc", targetIds: [seed.id], energyCost: 1, reason: `${seed.name} tiene poder sobre la escena.`, preview: "Puede quebrar o reforzar su autoridad.", patch: { characterChanges: [{ characterId: seed.id, attitude: "expuesto", fear: state.fear + 1 }], endingScoreDelta: { truth: 1 } }, successKind: "npc_exposed", partialKind: "social_pressure", failureKind: "npc_closes_off" }));
    if (seed.archetype === "ally" || seed.archetype === "innocent" || state.fear > 0) choices.push(makeChoice({ templateId: "protect_npc", choiceId: `protect:${seed.id}`, label: `Proteger a ${seed.name}`, type: "proteger_aliado", targetIds: [seed.id], energyCost: 1, reason: `${seed.name} puede quedar expuesto por la presión.`, preview: "Puede ganar confianza o evitar una represalia.", patch: { characterChanges: [{ characterId: seed.id, trust: state.trust + 1, protectedBy: "party" }] }, successKind: "ally_protected", partialKind: "ally_protected", failureKind: "ally_harmed" }));
  }

  for (const route of Object.values(runtime.routeStates).filter((route) => route.fromSceneId === runtime.currentNodeId && route.status === "available")) {
    const location = blueprint.locations.find((item) => `node:${item.id}` === route.toSceneId);
    if (location) choices.push(makeChoice({ templateId: "use_route", choiceId: `route:${route.routeId}`, label: `Ir hacia ${location.name}`, type: "abrir_ruta", targetIds: [route.routeId], energyCost: route.risk > 1 ? 1 : 0, reason: `${location.name} está conectado con ${node.title}.`, preview: `Mueve la historia hacia ${location.name}.`, patch: { routeChanges: [{ routeId: route.routeId, status: "used" }], nextNodeId: route.toSceneId }, successKind: "route_opened", partialKind: "route_opened", failureKind: "route_blocked" }));
  }

  for (const threat of blueprint.threats.filter((threat) => threat.type === "physical" || threat.type === "magical" || threat.type === "environmental")) {
    choices.push(makeChoice({ templateId: "distract_threat", choiceId: `threat:${threat.id}`, label: `Distraer a ${threat.name}`, type: threat.type === "physical" ? "combatir" : "negociar", targetIds: [threat.id], energyCost: 1, reason: `${threat.name} presiona esta rama.`, preview: "Puede bajar presión o convertirla en coste.", patch: { flags: { [`threat:${threat.id}:distracted`]: true }, clockChanges: [{ clockId: blueprint.clocks[0]?.id ?? "pressure", delta: -1 }] }, successKind: "combat_shift", partialKind: "social_pressure", failureKind: "social_pressure" }));
  }

  choices.push(makeChoice({ templateId: "rest_or_recover", choiceId: `rest:${node.nodeId}`, label: "Recuperar aire y ordenar al grupo", type: "descansar", targetIds: [node.nodeId], energyCost: 0, reason: "Siempre disponible si el grupo necesita margen.", preview: "Recupera posición, pero no resuelve el conflicto.", patch: { clockChanges: [{ clockId: blueprint.clocks[0]?.id ?? "pressure", delta: 1 }] }, successKind: "moral_choice", partialKind: "social_pressure", failureKind: "social_pressure" }));

  const valid = choices
    .map((choice) => mutationFor(choice, runtime, blueprint))
    .filter((choice): choice is AvailableChoice => Boolean(choice))
    .filter((choice) => !abstractLabelPattern.test(choice.label) && !abstractLabelPattern.test(choice.previewHint));

  const byType: AvailableChoice[] = valid.filter((choice) => choice.choiceId.includes(":followup") || choice.choiceId.includes(":risk") || choice.choiceId.includes(":protect")).slice(0, 2);
  for (const preferred of ["investigar_objeto", "interrogar_npc", "confrontar_npc", "abrir_ruta", "proteger_aliado", "combatir", "descansar"] as UniversalActionType[]) {
    const found = valid.find((choice) => choice.type === preferred && !byType.some((item) => item.choiceId === choice.choiceId));
    if (found) byType.push(found);
    if (byType.length >= 5) break;
  }
  for (const choice of valid) {
    if (byType.length >= 5) break;
    if (!byType.some((item) => item.choiceId === choice.choiceId)) byType.push(choice);
  }
  return byType.slice(0, Math.max(3, Math.min(5, byType.length)));
}

export function resolveAvailableChoice(runtime: StoryGraphRuntime, choice: AvailableChoice, result: "success" | "partial" | "failure"): StoryGraphRuntime {
  const selected = result === "success" ? choice.outcome.success : result === "partial" ? choice.outcome.partial : choice.outcome.failure;
  const next = applyUniversalStatePatch(runtime, selected.patch);
  return {
    ...next,
    choiceMemory: {
      ...next.choiceMemory,
      [choice.choiceId]: { choiceId: choice.choiceId, baseTemplateId: choice.templateId, usedCount: (runtime.choiceMemory[choice.choiceId]?.usedCount ?? 0) + 1, lastResult: result, status: choice.templateId === "rest_or_recover" ? "used" : "exhausted", producedClueIds: selected.patch.clueChanges?.map((clue) => clue.clueId!).filter(Boolean) ?? [], producedObjectChanges: selected.patch.objectChanges?.map((object) => object.objectId!).filter(Boolean) ?? [], producedNpcChanges: selected.patch.characterChanges?.map((npc) => npc.characterId!).filter(Boolean) ?? [] }
    },
    lastTurn: { choiceId: choice.choiceId, result, patch: selected.patch, summary: selected.factualSummary }
  };
}
