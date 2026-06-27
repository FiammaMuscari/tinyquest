import { selectCompatibleClue, selectCompatibleObject } from "./context-coherence";
import type { ResolutionResult } from "./resolution-plan";

export interface MechanicalConsequence {
  summary: string;
  physicalChange?: string;
  socialChange?: string;
  emotionalChange?: string;
  dangerManifestation?: string;
  advantage?: string;
  cost?: string;
  complication?: string;
  clueEffect?: {
    mode: "none" | "hint" | "partial" | "full";
    clueId?: string;
    clueTitle?: string;
    naturalDescription?: string;
  };
}

export type BuildMechanicalConsequenceInput = {
  actorId: string;
  actorName: string;
  actorKind: "player" | "bot" | "npc";
  actionText: string;
  result: ResolutionResult;
  scene: { id: string; title: string; location: string; phase: string; objective?: string; dangerBefore: number; dangerAfter: number };
  validContext: { presentNpcIds: string[]; presentObjectIds: string[]; availableClueIds: string[]; knownClueIds: string[] };
  roll: { total: number; dc: number };
  contextLabels?: {
    npcs?: Record<string, string>;
    objects?: Record<string, string>;
    clues?: Record<string, string>;
    clueDescriptions?: Record<string, string>;
  };
  target?: { id?: string; kind?: string; label?: string };
  clueRevealMode?: "none" | "hint" | "partial" | "full";
};

const genericPattern = /ventaja concreta|complicación concreta|complicacion concreta|tensión aumenta|tension aumenta|peligro gana terreno|oposición aprovecha|oposicion aprovecha|presión narrativa|presion narrativa|algo cambia|puede revelar pista|reducir peligro o abrir combate breve/i;
const awkwardPattern = /\buna parte de\s+(la|el|los|las)\b|para la escena|\bo aprovecha\b|\bo alguien\b|\bo lo\b|\bpuede\b|\bpodría\b|\bpodria\b|deja una contradicción visible|avance como provocación|\b(o|u)\b[^.]{0,32}\b(o|u)\b/i;
const actionVerbPattern = /\b(baja|mira|toca|cubre|aparta|cierra|abre|rompe|marca|mancha|retrocede|avanza|admite|calla|protege|encuentra|nota|limpia|golpea|bloquea|entrega|pierde|gana|separa|deja|coloca|empuja|vibra|responde|sostiene|coincide|conserva|muestra|muestran|declara|planta|patea|acusa|cae|detiene|confirma)\b/i;

function labelFor(id: string | undefined, labels: Record<string, string> | undefined, fallback: string) {
  if (!id) return fallback;
  return labels?.[id] ?? id.replace(/-/g, " ");
}

function lowerFirst(text: string) { return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text; }
function pick<T>(variants: T[], seed: number): T { return variants[Math.abs(Math.round(seed)) % variants.length]; }
// Per-turn entropy so repeated actions across turns don't generate identical prose.
function seedFor(input: BuildMechanicalConsequenceInput) {
  return input.roll.total * 3 + input.scene.dangerAfter * 7 + input.scene.dangerBefore * 2 + input.actorName.length + input.actionText.length;
}
function deLabel(label: string) { return label.toLowerCase().startsWith("el ") ? `del ${label.slice(3)}` : label.toLowerCase().startsWith("la ") ? `de la ${label.slice(3)}` : `de ${label}`; }

// Campaign labels are already natural ("Cuaderno de Carvell", "la orden falsificada"); keep them as-is.
function naturalObjectLabel(label: string) { return label; }

function sceneObject(input: BuildMechanicalConsequenceInput) {
  const targetObject = input.target?.kind === "object" && input.validContext.presentObjectIds.includes(input.target.id ?? "") ? input.target.id : undefined;
  const selected = selectCompatibleObject({
    actionText: input.actionText,
    targetId: input.target?.id,
    targetKind: input.target?.kind,
    presentObjectIds: input.validContext.presentObjectIds,
    labels: input.contextLabels?.objects,
    mustHappen: []
  });
  const objectId = targetObject ?? selected?.objectId ?? input.validContext.presentObjectIds[0];
  return { id: objectId, label: naturalObjectLabel(labelFor(objectId, input.contextLabels?.objects, "el objeto a la vista")) };
}

function sceneNpc(input: BuildMechanicalConsequenceInput) {
  const targetNpc = input.target?.kind === "npc" && input.validContext.presentNpcIds.includes(input.target.id ?? "") ? input.target.id : undefined;
  const npcId = targetNpc ?? input.validContext.presentNpcIds[0];
  return { id: npcId, label: labelFor(npcId, input.contextLabels?.npcs, "el testigo") };
}

function sceneClue(input: BuildMechanicalConsequenceInput) {
  const selected = selectCompatibleClue({
    actionText: input.actionText,
    targetId: input.target?.id,
    targetKind: input.target?.kind,
    availableClueIds: input.validContext.availableClueIds,
    knownClueIds: input.validContext.knownClueIds,
    labels: input.contextLabels?.clues,
    mustHappen: []
  });
  const clueId = selected?.clueId ?? input.validContext.availableClueIds[0];
  const title = labelFor(clueId, input.contextLabels?.clues, "la pista disponible");
  return { id: clueId, title, description: input.contextLabels?.clueDescriptions?.[clueId] ?? title };
}

// Generic, campaign-agnostic clue description built from the scene's real labels.
function naturalClueDescription(input: BuildMechanicalConsequenceInput, mode: "hint" | "partial" | "full") {
  const clue = sceneClue(input);
  const object = sceneObject(input).label;
  const seed = seedFor(input);
  if (!clue.id) return { ...clue, naturalDescription: pick([
    `${input.actorName} encuentra un indicio suelto que todavía no marca a nadie.`,
    `${input.actorName} nota una pista parcial, pero la deja sin cerrar.`
  ], seed) };
  const full = [
    `${input.actorName} encuentra en ${object} una marca que prueba ${clue.title.toLowerCase()}.`,
    `${input.actorName} nota un detalle en ${object} y deja ${clue.title.toLowerCase()} a la vista del grupo.`,
    `${input.actorName} muestra ${clue.title.toLowerCase()} y la deja sobre la mesa para todos.`
  ];
  const partial = [
    `${input.actorName} nota ${clue.title.toLowerCase()}, pero le falta una confirmación.`,
    `${input.actorName} encuentra rastros de ${clue.title.toLowerCase()} y todavía no los cierra.`
  ];
  return { ...clue, naturalDescription: pick(mode === "full" ? full : partial, seed) };
}

// Concrete physical beat, campaign-agnostic (no scene-name interpolation: old fixtures leak "molino").
function physicalFallback(input: BuildMechanicalConsequenceInput) {
  return pick([
    "Una puerta cercana se cierra de golpe y deja a todos en guardia.",
    "Un objeto cae al suelo y el ruido corta las voces del lugar.",
    "Alguien se mueve rápido y el grupo retrocede un paso."
  ], seedFor(input));
}

function dangerManifestation(input: BuildMechanicalConsequenceInput) {
  if (input.scene.dangerAfter < 7 && input.scene.dangerAfter <= input.scene.dangerBefore) return undefined;
  const seed = seedFor(input);
  if (input.scene.dangerAfter >= 9) return pick([
    "La amenaza corta la salida y un golpe seco rompe el silencio.",
    "Una mano se cierra sobre un arma y el grupo queda acorralado."
  ], seed);
  if (input.scene.dangerAfter >= 7) return pick([
    "Un grito tensa el aire y alguien empuña un arma.",
    "La amenaza gana terreno y un golpe rompe la calma."
  ], seed);
  if (input.scene.dangerAfter > input.scene.dangerBefore) return "La amenaza gana un paso y obliga al grupo a moverse rápido.";
  return undefined;
}

const TALK_RE = /interrogar|pedir|convencer|confrontar|acusar|negociar|presionar|ofrecer|preguntar|hablar|escuchar|testific/i;
const OBJECT_RE = /revisar|leer|examinar|comparar|abrir|registrar|buscar|rastrear|inspeccionar|copiar|presentar|objeto|prueba|documento|sello|cuaderno|orden|huella|marca/i;
const PROTECT_RE = /proteger|salvar|cubrir|bloquear|interponer|defender|frenar|escudar/i;

function buildSuccess(input: BuildMechanicalConsequenceInput): MechanicalConsequence {
  const npc = sceneNpc(input);
  const object = sceneObject(input);
  const clue = naturalClueDescription(input, input.clueRevealMode === "partial" ? "partial" : "full");
  const seed = seedFor(input);
  const usesTalk = TALK_RE.test(input.actionText);
  const usesObject = OBJECT_RE.test(input.actionText);
  const protects = PROTECT_RE.test(input.actionText);
  const advantage = usesObject && input.validContext.availableClueIds.length
    ? clue.naturalDescription
    : usesTalk
      ? pick([
          `${npc.label} baja la voz ante ${input.actorName} y admite un detalle que había callado.`,
          `${npc.label} duda, retrocede un paso y entrega lo que el grupo necesitaba.`
        ], seed)
      : protects
        ? pick([
            `${input.actorName} se coloca delante de ${npc.label} y bloquea el golpe que venía hacia él.`,
            `${input.actorName} aparta a ${npc.label} del peligro y absorbe el primer impacto.`
          ], seed)
        : pick([
            `${input.actorName} encuentra una ventaja en ${object.label} y deja su posición expuesta.`,
            `${input.actorName} marca una salida con ${object.label} y abre paso al grupo.`
          ], seed);
  const physicalChange = usesObject ? `${object.label} queda marcado como prueba y protegido de nuevas manos.` : physicalFallback(input);
  return {
    summary: advantage,
    physicalChange,
    socialChange: usesTalk ? `${npc.label} pierde seguridad y baja la voz frente al grupo.` : undefined,
    emotionalChange: `${input.actorName} recupera la iniciativa y el grupo vuelve a respirar con margen.`,
    advantage,
    dangerManifestation: dangerManifestation(input),
    clueEffect: input.validContext.availableClueIds.length ? { mode: input.clueRevealMode === "partial" ? "partial" : "full", clueId: clue.id, clueTitle: clue.title, naturalDescription: clue.naturalDescription } : { mode: "none" }
  };
}

function buildPartial(input: BuildMechanicalConsequenceInput): MechanicalConsequence {
  const npc = sceneNpc(input);
  const object = sceneObject(input);
  const clue = naturalClueDescription(input, "partial");
  const seed = seedFor(input);
  const objectAction = OBJECT_RE.test(input.actionText);
  const socialCost = input.scene.dangerAfter > input.scene.dangerBefore;
  const advance = input.validContext.availableClueIds.length ? clue.naturalDescription : pick([
    `${input.actorName} sostiene la acción el tiempo justo para no perder el rastro.`,
    `${input.actorName} gana algo de terreno, pero deja una punta suelta.`
  ], seed);
  const cost = socialCost
    ? `la amenaza gana terreno y ${npc.label} se cierra antes de decir lo último`
    : objectAction
      ? `el borde ${deLabel(object.label)} queda manchado por manos ajenas`
      : `${npc.label} responde una sola frase y vuelve a callar`;
  return {
    summary: `${advance} Pero ${lowerFirst(cost)}.`,
    physicalChange: objectAction ? `${object.label} conserva valor, aunque el borde queda manchado.` : physicalFallback(input),
    socialChange: socialCost ? "La amenaza gana terreno y se vuelve más caro mostrar la prueba en público." : `${npc.label} entrega ayuda incompleta y se aparta del grupo.`,
    emotionalChange: `${input.actorName} compra tiempo, pero el grupo entiende que la próxima acción tendrá coste.`,
    cost,
    dangerManifestation: dangerManifestation(input),
    clueEffect: input.validContext.availableClueIds.length ? { mode: "partial", clueId: clue.id, clueTitle: clue.title, naturalDescription: clue.naturalDescription } : { mode: "hint", naturalDescription: "El avance orienta la siguiente acción sin confirmar una pista nueva." }
  };
}

function buildFailure(input: BuildMechanicalConsequenceInput): MechanicalConsequence {
  const npc = sceneNpc(input);
  const object = sceneObject(input);
  const seed = seedFor(input);
  const objectAction = OBJECT_RE.test(input.actionText);
  const social = pick([
    `${npc.label} corta el intercambio y se cierra; ${input.actorName} pierde el hilo.`,
    `${npc.label} se aparta y calla, y ${input.actorName} queda sin respuesta.`,
    `${npc.label} retrocede y deja a ${input.actorName} hablando solo ante el grupo.`
  ], seed);
  const physical = objectAction
    ? pick([
        `${object.label} queda fuera de alcance cuando alguien lo aparta de la mesa.`,
        `${object.label} se mancha y pierde valor antes de que ${input.actorName} lo asegure.`,
        `alguien empuja ${object.label} lejos y ${input.actorName} pierde la prueba por un instante.`
      ], seed)
    : physicalFallback(input);
  const complication = input.scene.dangerAfter >= 8
    ? "La salida queda cortada y la siguiente acción exige elegir qué pérdida aceptar."
    : input.scene.dangerAfter > input.scene.dangerBefore
      ? "La amenaza empuja la escena hacia una confrontación abierta."
      : `${npc.label} corta la conversación y vuelve más caro insistir por la misma vía.`;
  return {
    summary: `${social} ${physical}`,
    physicalChange: physical,
    socialChange: social,
    emotionalChange: `${input.actorName} pierde iniciativa; el siguiente intento tendrá que reparar confianza o proteger la evidencia.`,
    dangerManifestation: dangerManifestation(input),
    complication,
    clueEffect: { mode: "none", naturalDescription: "El fallo no revela una pista completa." }
  };
}

function sanitizeSummary(input: BuildMechanicalConsequenceInput, consequence: MechanicalConsequence): MechanicalConsequence {
  if (!genericPattern.test(consequence.summary) && !awkwardPattern.test(consequence.summary) && actionVerbPattern.test(consequence.summary)) return consequence;
  const npc = sceneNpc(input).label;
  const object = sceneObject(input).label;
  const safe = input.result === "success"
    ? `${input.actorName} limpia ${object} y ${npc} retrocede al ver que la prueba sigue intacta.`
    : input.result === "partial"
      ? `${input.actorName} conserva ${object}, pero ${npc} mancha el borde antes de apartarse.`
      : `${npc} se aparta de ${object} y la salida queda más cerrada que antes.`;
  return { ...consequence, summary: safe };
}

export function buildMechanicalConsequence(input: BuildMechanicalConsequenceInput): MechanicalConsequence {
  const consequence = input.result === "success" ? buildSuccess(input) : input.result === "partial" ? buildPartial(input) : buildFailure(input);
  const sanitized = sanitizeSummary(input, consequence);
  // At high danger the summary itself must show the threat physically (QA: DANGER_NOT_MANIFESTED).
  if (input.scene.dangerAfter >= 8 && consequence.dangerManifestation) {
    return { ...sanitized, summary: `${sanitized.summary} ${consequence.dangerManifestation}` };
  }
  return sanitized;
}

export function isGenericMechanicalConsequence(text: string) { return genericPattern.test(text); }
export function isAwkwardMechanicalConsequence(text: string) { return awkwardPattern.test(text) || !actionVerbPattern.test(text) || text.trim().length < 48; }
