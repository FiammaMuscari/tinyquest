import type { Campaign, CampaignActionOutcome, CampaignActionType, CampaignNarrationHints, CheckOutcome, Player, SceneActionChoice } from "./types";

const debugPhrases = [
  "La escena cambia en algo visible",
  "la siguiente acción debe usar ese cambio",
  "Un detalle físico queda confirmado",
  "Confirmar o dañar una pista concreta",
  "Confirmar o danar una pista concreta"
];

const allowedTargetKinds: Record<CampaignActionType, Array<NonNullable<SceneActionChoice["targetKind"]>>> = {
  investigar_objeto: ["object", "scene", "creature"],
  comparar_evidencia: ["object", "scene", "creature"],
  interrogar_npc: ["npc"],
  confrontar_npc: ["npc", "faction"],
  proteger_aliado: ["npc"],
  abrir_ruta: ["route"],
  cerrar_ruta: ["route"],
  mentir: ["npc", "faction"],
  negociar: ["npc", "faction"],
  combatir: ["creature", "npc"],
  huir: ["route", "scene"],
  sacrificar_recurso: ["object", "npc", "scene"],
  usar_objeto: ["object"],
  revelar_prueba: ["object", "npc", "faction", "scene"],
  tomar_decision_moral: ["npc", "faction", "object", "scene"]
};

const allowedOutcomeKinds: Record<CampaignActionType, CampaignActionOutcome["kind"][]> = {
  interrogar_npc: ["npc_confession", "npc_evasion", "npc_closes_off", "npc_exposed", "social_pressure"],
  confrontar_npc: ["npc_exposed", "npc_evasion", "npc_closes_off", "social_pressure"],
  investigar_objeto: ["evidence_confirmed", "evidence_partial", "evidence_contaminated", "object_changed"],
  comparar_evidencia: ["evidence_confirmed", "evidence_partial", "evidence_contaminated"],
  abrir_ruta: ["route_opened", "route_blocked"],
  cerrar_ruta: ["route_blocked", "social_pressure"],
  proteger_aliado: ["ally_protected", "ally_harmed", "social_pressure"],
  usar_objeto: ["object_changed", "evidence_confirmed", "evidence_partial", "evidence_contaminated"],
  revelar_prueba: ["evidence_confirmed", "npc_exposed", "social_pressure", "moral_choice"],
  tomar_decision_moral: ["moral_choice", "npc_confession", "npc_evasion", "social_pressure"],
  mentir: ["moral_choice", "social_pressure", "npc_evasion", "npc_closes_off"],
  negociar: ["npc_confession", "npc_evasion", "moral_choice", "social_pressure"],
  combatir: ["combat_shift", "ally_harmed", "social_pressure"],
  huir: ["escape_shift", "route_opened", "route_blocked"],
  sacrificar_recurso: ["moral_choice", "object_changed", "ally_protected", "ally_harmed"]
};

export type CoherentTurnFacts = {
  actionType: CampaignActionType;
  actor: { id: string; name: string };
  target: { id: string; label: string; kind?: SceneActionChoice["targetKind"] };
  result: CheckOutcome;
  outcomeKind: CampaignActionOutcome["kind"];
  factualSummary: string;
  visibleConsequence: string;
  narrationHints: CampaignNarrationHints;
  debugSummary: string;
};

function outcomeForResult(choice: SceneActionChoice | undefined, result: CheckOutcome): CampaignActionOutcome | undefined {
  if (!choice) return undefined;
  if (result === "success") return choice.successOutcome;
  if (result === "partial_success") return choice.partialOutcome;
  return choice.failureOutcome;
}

function fallbackKind(actionType: CampaignActionType, result: CheckOutcome): CampaignActionOutcome["kind"] {
  if (actionType === "interrogar_npc") return result === "success" ? "npc_confession" : result === "partial_success" ? "npc_evasion" : "npc_closes_off";
  if (actionType === "confrontar_npc") return result === "success" ? "npc_exposed" : result === "partial_success" ? "social_pressure" : "npc_closes_off";
  if (actionType === "investigar_objeto" || actionType === "comparar_evidencia") return result === "success" ? "evidence_confirmed" : result === "partial_success" ? "evidence_partial" : "evidence_contaminated";
  if (actionType === "abrir_ruta") return result === "success" ? "route_opened" : "route_blocked";
  if (actionType === "cerrar_ruta") return "route_blocked";
  if (actionType === "proteger_aliado") return result === "failure" ? "ally_harmed" : "ally_protected";
  if (actionType === "usar_objeto") return result === "failure" ? "evidence_contaminated" : "object_changed";
  if (actionType === "combatir") return "combat_shift";
  if (actionType === "huir") return "escape_shift";
  return "moral_choice";
}

function defaultHints(actionType: CampaignActionType, choice: SceneActionChoice, targetLabel: string): CampaignNarrationHints {
  const base: CampaignNarrationHints = {
    mustMention: [targetLabel].filter(Boolean),
    mustNotMention: ["compuerta", "bestia retrocede", "objeto marcado genérico", "barro removido", "ruta abierta"],
    style: "escena concreta en español latino"
  };
  if (actionType === "interrogar_npc") return { mustMention: [targetLabel, "pregunta", "miedo"], mustNotMention: ["compuerta", "bestia retrocede", "examinar cuerda como acción principal", "barro removido"], style: "diálogo tenso" };
  if (actionType === "confrontar_npc") return { mustMention: [targetLabel, "turba", "autoridad"], mustNotMention: ["bestia retrocede", "ruta abierta", "objeto marcado genérico"], style: "choque social" };
  if (actionType === "comparar_evidencia") return { mustMention: [targetLabel, "cadáver", "herida", "mordida"], mustNotMention: ["interrogar", "compuerta", "ruta", "bestia retrocede"], style: "detalle físico y contradicción" };
  if (actionType === "investigar_objeto") return { mustMention: [targetLabel, "marca", "detalle físico"], mustNotMention: ["confesión espontánea", "compuerta", "bestia retrocede"], style: "observación concreta" };
  if (actionType === "abrir_ruta") return { mustMention: [targetLabel, "movimiento", "paso"], mustNotMention: ["confesión", "mordida", "herida del cadáver como centro"], style: "riesgo físico" };
  if (actionType === "proteger_aliado") return { mustMention: [targetLabel, "protección", "daño"], mustNotMention: ["ruta abierta", "confesión", "objeto marcado genérico"], style: "urgencia corporal" };
  return base;
}

function targetLabel(campaign: Campaign, choice: SceneActionChoice): string {
  const id = choice.targetId ?? choice.npcId ?? choice.objectId ?? choice.routeId ?? choice.id;
  return campaign.npcs.find((npc) => npc.id === id)?.name
    ?? campaign.storyObjects?.find((object) => object.id === id)?.name
    ?? campaign.enemies.find((enemy) => enemy.id === id)?.name
    ?? choice.label;
}

export function assertCoherentActionOutcome(choice: SceneActionChoice, outcome: CampaignActionOutcome, strict = true): void {
  if (!choice.actionType) return;
  const targetKind = choice.targetKind;
  const targetOk = targetKind ? allowedTargetKinds[choice.actionType].includes(targetKind) : false;
  const outcomeOk = allowedOutcomeKinds[choice.actionType].includes(outcome.kind);
  const problems = [];
  if (!targetOk) problems.push(`${choice.actionType} no puede apuntar a targetKind=${targetKind ?? "missing"}`);
  if (!outcomeOk) problems.push(`${choice.actionType} no puede producir outcome=${outcome.kind}`);
  if (!problems.length) return;
  if (strict) throw new Error(`SceneAction incoherente (${choice.id}): ${problems.join("; ")}`);
}

export function resolveCoherentTurnFacts(params: { campaign: Campaign; actor: Player; choice?: SceneActionChoice; rawAction: string; result: CheckOutcome; strict?: boolean }): CoherentTurnFacts {
  const { campaign, actor, choice, rawAction, result, strict = true } = params;
  const actionType = choice?.actionType ?? "tomar_decision_moral";
  const label = choice ? targetLabel(campaign, choice) : rawAction;
  const target = { id: choice?.targetId ?? choice?.npcId ?? choice?.objectId ?? choice?.routeId ?? choice?.id ?? rawAction, label, kind: choice?.targetKind ?? "scene" as const };
  const fallbackOutcome: CampaignActionOutcome = {
    kind: fallbackKind(actionType, result),
    summary: choice?.possibleOutcomeHint ?? `${choice?.label ?? rawAction}: ${result}`,
    visibleConsequence: choice?.memoryImpact ?? choice?.possibleOutcomeHint ?? "La acción deja una consecuencia concreta en escena."
  };
  const chosen = outcomeForResult(choice, result) ?? fallbackOutcome;
  if (choice) {
    assertCoherentActionOutcome({ ...choice, actionType, targetKind: target.kind } as SceneActionChoice, chosen, strict);
  }
  const baseHints = defaultHints(actionType, choice ?? ({ id: rawAction, label: rawAction, action: rawAction } as SceneActionChoice), label);
  const hints = {
    mustMention: Array.from(new Set([...(baseHints.mustMention ?? []), ...(choice?.narrationHints?.mustMention ?? []), ...(chosen.narrationHints?.mustMention ?? [])])).filter(Boolean),
    mustNotMention: Array.from(new Set([...baseHints.mustNotMention, ...(choice?.narrationHints?.mustNotMention ?? []), ...(chosen.narrationHints?.mustNotMention ?? []), ...debugPhrases])),
    style: chosen.narrationHints?.style ?? choice?.narrationHints?.style ?? baseHints.style
  };
  return {
    actionType,
    actor: { id: actor.id, name: actor.name },
    target,
    result,
    outcomeKind: chosen.kind,
    factualSummary: chosen.summary,
    visibleConsequence: chosen.visibleConsequence,
    narrationHints: hints,
    debugSummary: `${choice?.id ?? rawAction} -> ${actionType}/${chosen.kind}/${result}`
  };
}

export function visibleTextHasDebugPhrases(text: string): boolean {
  return debugPhrases.some((phrase) => text.toLowerCase().includes(phrase.toLowerCase()));
}
