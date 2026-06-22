import { inferActionDomain, selectCompatibleClue, selectCompatibleObject, type NarrativeDomain } from "./context-coherence";
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
const actionVerbPattern = /\b(baja|mira|toca|cubre|aparta|cierra|abre|rompe|marca|mancha|retrocede|avanza|admite|calla|protege|encuentra|nota|limpia|golpea|bloquea|entrega|pierde|gana|separa|deja|coloca|empuja|vibra|responde|sostiene|coincide|conserva|muestra|muestran|declara|planta|patea|acusa|cae|detiene)\b/i;

function labelFor(id: string | undefined, labels: Record<string, string> | undefined, fallback: string) {
  if (!id) return fallback;
  return labels?.[id] ?? id.replace(/-/g, " ");
}

function first<T>(values: T[], fallback: T) { return values[0] ?? fallback; }
function containsAny(text: string, words: string[]) { const lower = text.toLowerCase(); return words.some((word) => lower.includes(word)); }
function lowerFirst(text: string) { return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text; }
function deLabel(label: string) { return label.toLowerCase().startsWith("el ") ? `del ${label.slice(3)}` : `de ${label}`; }
function naturalObjectLabel(label: string) {
  if (/^(el|la|los|las)\s/i.test(label)) return label;
  if (/^(sello|badajo|acta|archivo|molino|mapa|objeto)/i.test(label)) return `el ${label}`;
  if (/^(campana|cuerda|cuchilla|puerta|máscara|mascara|prueba)/i.test(label)) return `la ${label}`;
  return label;
}

function sceneObject(input: BuildMechanicalConsequenceInput) {
  const targetObject = input.target?.kind === "object" && input.validContext.presentObjectIds.includes(input.target.id ?? "") ? input.target.id : undefined;
  if (!targetObject && containsAny(input.actionText, ["campana"])) return { id: undefined, label: "la campana" };
  if (!targetObject && containsAny(input.actionText, ["grillete", "cadena"])) return { id: undefined, label: "los grilletes" };
  if (!targetObject && containsAny(input.actionText, ["mordida", "herida", "cadáver", "cadaver"])) return { id: undefined, label: "la herida del cadáver" };
  if (!targetObject && containsAny(input.actionText, ["cuerda"])) return { id: undefined, label: "la cuerda cortada" };
  const selected = selectCompatibleObject({
    actionText: input.actionText,
    targetId: input.target?.id,
    targetKind: input.target?.kind,
    presentObjectIds: input.validContext.presentObjectIds,
    labels: input.contextLabels?.objects,
    mustHappen: []
  });
  const objectId = targetObject ?? selected?.objectId ?? input.validContext.presentObjectIds[0];
  return { id: objectId, label: naturalObjectLabel(labelFor(objectId, input.contextLabels?.objects, "objeto observado")) };
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
  return { id: clueId, title, description: input.contextLabels?.clueDescriptions?.[clueId] ?? title, domain: selected?.domain };
}

function naturalClueDescription(input: BuildMechanicalConsequenceInput, mode: "hint" | "partial" | "full") {
  const clue = sceneClue(input);
  const object = sceneObject(input).label;
  const npc = sceneNpc(input).label;
  const title = clue.title.toLowerCase();
  let text: string;
  if (!clue.id) text = `${input.actorName} obtiene un indicio incompleto, pero no alcanza para acusar a nadie todavía.`;
  else if (clue.id.includes("bell") || title.includes("campana")) text = `${input.actorName} nota barro fresco en el badajo de la campana, aunque todos dijeron que sonó antes de la lluvia.`;
  else if (clue.id.includes("claw") || title.includes("garra") || title.includes("mordida")) text = `${input.actorName} ve que las marcas repiten la misma distancia, como dientes de herramienta y no de mandíbula.`;
  else if (clue.id.includes("rope") || title.includes("cuerda")) text = `${input.actorName} encuentra fibras cortadas limpias en la cuerda, demasiado parejas para haber cedido por pánico.`;
  else if (clue.id.includes("silver") || title.includes("plata") || title.includes("grillete")) text = `${input.actorName} distingue quemaduras viejas bajo la plata, anteriores a la versión oficial del arresto.`;
  else if (clue.id.includes("mud") || title.includes("barro")) text = `${input.actorName} separa barro rojo del borde de la huella y lo compara con el camino hacia la casa del alcalde.`;
  else if (clue.id.includes("ledger") || title.includes("acta") || title.includes("tinta")) text = `${input.actorName} lee una fecha corrida en el acta y ve que la sentencia estaba escrita antes del interrogatorio.`;
  else if (clue.id.includes("seal") || title.includes("sello")) text = `${input.actorName} siente el frío del sello responder a la campana, no a Nicolás.`;
  else if (mode === "full") text = `${input.actorName} vincula ${object} con el testimonio de ${npc} sin romper la prueba.`;
  else text = `${input.actorName} obtiene un indicio incompleto, pero no alcanza para acusar a nadie todavía.`;
  return { ...clue, naturalDescription: text };
}

function physicalFallback(input: BuildMechanicalConsequenceInput) {
  if (containsAny(input.scene.location, ["molino"]) || containsAny(input.scene.title, ["molino"])) return "La puerta del molino se cierra de golpe y deja harina húmeda sobre el umbral.";
  if (containsAny(input.scene.location, ["capilla", "campana"]) || containsAny(input.scene.title, ["campana", "capilla"])) return "La campana vibra una vez y todos miran hacia la cuerda cortada.";
  if (containsAny(input.scene.location, ["bosque"]) || containsAny(input.scene.title, ["bosque"])) return "Una rama baja se rompe en el sendero y delata el movimiento del grupo.";
  if (containsAny(input.scene.location, ["archivo", "alcalde"]) || containsAny(input.scene.title, ["alcalde"])) return "Un cajón del archivo queda abierto y el papel mojado se pega a la madera.";
  return "La puerta más cercana se cierra y el ruido atrae todas las miradas.";
}

function dangerManifestation(input: BuildMechanicalConsequenceInput) {
  if (input.scene.dangerAfter < 7 && input.scene.dangerAfter <= input.scene.dangerBefore) return undefined;
  if (input.scene.dangerAfter >= 9) return "La turba corta la salida y la campana responde con un golpe seco.";
  if (input.scene.dangerAfter >= 7) return "Los testigos retroceden; una piedra golpea la madera y nadie vuelve a hablar tranquilo.";
  if (input.scene.dangerAfter > input.scene.dangerBefore) return "La multitud avanza un paso y tapa las voces bajas con la acusación.";
  return undefined;
}

function buildSuccess(input: BuildMechanicalConsequenceInput): MechanicalConsequence {
  const npc = sceneNpc(input);
  const object = sceneObject(input);
  const clue = naturalClueDescription(input, input.clueRevealMode === "partial" ? "partial" : "full");
  const usesTalk = /interrogar|pedir|convencer|confrontar|acusar|negociar|presionar|ofrecer|preguntar/i.test(input.actionText);
  const usesObject = /sello|campana|cuerda|grillete|acta|cuchilla|máscara|mapa|objeto|revisar|leer|examinar|comparar|abrir/i.test(input.actionText);
  const talkAdvantage = /carta|mara/i.test(input.actionText)
    ? `${npc.label} enseña una esquina rota de ${object.label} y deja a la vista una fecha que no coincide.`
    : /grillete|cadena|plata/i.test(input.actionText)
      ? `${npc.label} aparta la mirada de los grilletes y confirma con el silencio que las marcas son anteriores.`
      : /campana|tomás|tomas/i.test(input.actionText)
        ? `${npc.label} mira hacia ${object.label} antes de responder; ese gesto contradice su versión anterior.`
        : `${npc.label} baja la voz ante ${input.actorName} y corrige un detalle que había ocultado.`;
  const physicalAdvantage = /proteger|salvar|cubrir|bloquear/i.test(input.actionText)
    ? `${input.actorName} se coloca delante de ${npc.label} y frena el empujón con ${input.roll.total % 2 === 0 ? "el hombro" : "un banco arrastrado"}.`
    : /huir|escapar|ruta|abrir/i.test(input.actionText)
      ? `${input.actorName} abre paso hacia ${input.scene.location} y deja una salida visible para el grupo.`
      : `${input.actorName} obliga a ${npc.label} a moverse hacia la luz y deja su posición expuesta.`;
  const advantage = usesTalk
    ? talkAdvantage
    : usesObject
      ? clue.naturalDescription
      : physicalAdvantage;
  const physicalChange = usesObject ? `${object.label} queda limpio en un borde y protegido de nuevas manos.` : physicalFallback(input);
  return {
    summary: advantage,
    physicalChange,
    socialChange: usesTalk ? `${npc.label} pierde seguridad y baja la voz frente al grupo.` : undefined,
    emotionalChange: `${input.actorName} recupera iniciativa y el grupo vuelve a respirar con margen.` ,
    advantage,
    dangerManifestation: dangerManifestation(input),
    clueEffect: input.validContext.availableClueIds.length ? { mode: input.clueRevealMode === "partial" ? "partial" : "full", clueId: clue.id, clueTitle: clue.title, naturalDescription: clue.naturalDescription } : { mode: "none" }
  };
}

function buildPartial(input: BuildMechanicalConsequenceInput): MechanicalConsequence {
  const npc = sceneNpc(input);
  const object = sceneObject(input);
  const clue = naturalClueDescription(input, "partial");
  const objectAction = /sello|cuerda|acta|grillete|cuchilla|objeto|revisar|leer|examinar|comparar/i.test(input.actionText);
  const socialCost = input.scene.dangerAfter > input.scene.dangerBefore;
  const advance = input.validContext.availableClueIds.length ? clue.naturalDescription : `${input.actorName} sostiene la acción el tiempo justo para no perder la pista.`;
  const cost = socialCost
    ? "La multitud ve el gesto de Fiamy sobre la prueba y avanza hasta tapar la salida del molino"
    : objectAction
      ? `una marca ${deLabel(object.label)} queda manchada por dedos ajenos`
      : `${npc.label} responde una sola frase y después vuelve a mirar a Roldán`;
  return {
    summary: `${advance} Pero ${lowerFirst(cost)}.`,
    physicalChange: objectAction ? `${object.label} conserva valor, aunque la marca del borde queda manchada.` : physicalFallback(input),
    socialChange: socialCost ? "La multitud se acerca al grupo y vuelve más caro mostrar la prueba en público." : `${npc.label} entrega ayuda incompleta y se aparta del grupo.`,
    emotionalChange: `${input.actorName} compra tiempo, pero el grupo entiende que la próxima acción tendrá coste.`,
    cost,
    dangerManifestation: dangerManifestation(input),
    clueEffect: input.validContext.availableClueIds.length ? { mode: "partial", clueId: clue.id, clueTitle: clue.title, naturalDescription: clue.naturalDescription } : { mode: "hint", naturalDescription: "El avance orienta la siguiente acción sin confirmar una pista nueva." }
  };
}

function buildFailure(input: BuildMechanicalConsequenceInput): MechanicalConsequence {
  const npc = sceneNpc(input);
  const object = sceneObject(input);
  const objectAction = /sello|campana|cuerda|grillete|acta|cuchilla|objeto|revisar|leer|examinar|comparar/i.test(input.actionText);
  const social = `${npc.label} deja de responder y se coloca detrás de la autoridad más cercana antes de que ${input.actorName} pueda corregirse.`;
  const physical = objectAction
    ? `${npc.label} cubre ${object.label} con la palma y ${object.label.toLowerCase().startsWith("la ") ? "la" : "lo"} aparta de la vista.`
    : physicalFallback(input);
  const complication = input.scene.dangerAfter >= 8
    ? "La salida queda cortada y la siguiente acción exige elegir qué pérdida aceptar."
    : input.scene.dangerAfter > input.scene.dangerBefore
      ? "La multitud empuja la escena hacia una acusación pública."
      : `${npc.label} corta la conversación y vuelve más caro insistir por la misma vía.`;
  return {
    summary: `${social} ${physical}`,
    physicalChange: physical,
    socialChange: social,
    emotionalChange: `${input.actorName} pierde iniciativa; el siguiente intento tendrá que reparar confianza o proteger evidencia.`,
    dangerManifestation: dangerManifestation(input),
    complication,
    clueEffect: { mode: "none", naturalDescription: "El fallo no revela una pista completa." }
  };
}


function clueEffectFor(input: BuildMechanicalConsequenceInput, mode: "none" | "hint" | "partial" | "full", text: string) {
  const clue = sceneClue(input);
  if (mode === "none") return { mode: "none" as const, naturalDescription: "El fallo no revela una pista completa." };
  return { mode, clueId: clue.id, clueTitle: clue.title, naturalDescription: text };
}

function domainConsequence(input: BuildMechanicalConsequenceInput): MechanicalConsequence | undefined {
  const domain = inferActionDomain(input.actionText, input.target?.id, input.target?.kind);
  const npc = sceneNpc(input).label;
  const object = sceneObject(input).label;
  const danger = dangerManifestation(input);
  const mode = input.result === "success" ? "full" : input.result === "partial" ? "partial" : "none";
  const mk = (summary: string, extras: Partial<MechanicalConsequence> = {}): MechanicalConsequence => ({
    summary,
    physicalChange: extras.physicalChange,
    socialChange: extras.socialChange,
    emotionalChange: extras.emotionalChange ?? `${input.actorName} ajusta su posición después del resultado.`,
    dangerManifestation: danger,
    advantage: extras.advantage,
    cost: extras.cost,
    complication: extras.complication,
    clueEffect: clueEffectFor(input, mode as never, summary)
  });
  if (domain === "body") {
    if (input.result === "success") return mk("La mordida no coincide con la herida: los bordes son demasiado limpios para una bestia.", { advantage: "La herida apunta a herramienta humana." });
    if (input.result === "partial") return mk("La herida revela un corte demasiado recto, pero la sangre corrida impide probarlo ante todos.", { cost: "La sangre corrida debilita la prueba." });
    return mk("Elías declara que el cuerpo fue manoseado y la turba deja de mirar la herida.", { complication: "La prueba del cuerpo queda socialmente debilitada." });
  }
  if (domain === "bell") {
    if (input.result === "success") return mk("El badajo conserva barro fresco, señal de que la campana sonó después de la lluvia.", { advantage: "El horario oficial queda en duda." });
    if (input.result === "partial") return mk("Fiamy ve barro en el badajo, pero Tomás se interpone antes de que otros puedan confirmarlo.", { cost: "Tomás bloquea la confirmación pública." });
    return mk(/cuerda/i.test(input.actionText)
      ? "Tomás tira de la cuerda rota hacia su pecho y deja el badajo fuera de la vista."
      : input.roll.total % 2 === 0 ? "Tomás se planta frente a la campana y bloquea la vista del badajo." : "Tomás golpea el banco con el hombro y corta la línea de visión hacia el badajo.",
    { complication: "El badajo queda fuera de la vista del grupo." });
  }
  if (domain === "chains") {
    if (input.result === "success") {
      if (/guardar|presentar|prueba/i.test(input.actionText)) return mk("Fiamy aparta los grilletes de las manos ajenas y las marcas de cierre quedan protegidas como prueba.", { advantage: "La captura previa queda expuesta." });
      return mk(input.roll.total % 2 === 0 ? "Los grilletes muestran marcas de cierre anteriores a la orden oficial." : "Las marcas internas de los grilletes prueban que Nicolás fue cerrado antes de la orden oficial.", { advantage: "La captura previa queda expuesta." });
    }
    if (input.result === "partial") return mk("Las marcas están, pero una hebilla se rompe al manipular los grilletes.", { cost: "La hebilla rota vuelve discutible la prueba." });
    return mk("Roldán patea los grilletes bajo el banco y acusa al grupo de alterar la prueba.", { complication: "Los grilletes quedan fuera de alcance." });
  }
  if (domain === "letter") {
    if (input.result === "success") return mk("La carta conserva una firma incompleta que vincula a Mara con la deuda.", { advantage: "La coartada gana un punto verificable." });
    if (input.result === "partial") return mk("Mara entrega la carta, pero arranca la esquina donde estaba el nombre del comprador.", { cost: "El nombre clave se pierde." });
    return mk("Mara dobla la carta contra el pecho y niega haberla visto.", { complication: "La carta queda retenida por Mara." });
  }
  if (domain === "seal") {
    if (input.result === "success") return mk("El sello lunar conserva cera negra sobre una marca de plata.", { advantage: "El sello queda conectado con una mano humana." });
    if (input.result === "partial") return mk("La cera se desprende del sello, pero también borra parte del símbolo.", { cost: "El símbolo queda incompleto." });
    return mk("Roldán cubre el sello con la palma y lo esconde bajo el misal.", { complication: "El sello queda oculto." });
  }
  if (domain === "crowd") {
    if (input.result === "success") {
      const distance = ["junto al banco", "contra la puerta", "en el barro del umbral", "bajo la primera fila de aldeanos"][(input.roll.total + input.actorName.length) % 4];
      return mk(`${input.actorName} desvía la primera piedra; cae ${distance} antes de tocar a Nicolás.`, { advantage: "Nicolás gana un instante de protección." });
    }
    if (input.result === "partial") return mk("Belo detiene la pedrada, pero la turba cierra la salida.", { cost: "La salida queda bloqueada." });
    return mk("La piedra golpea el banco junto a Nicolás y la turba avanza dos pasos.", { complication: "La violencia pública escala." });
  }
  return undefined;
}

function sanitizeSummary(input: BuildMechanicalConsequenceInput, consequence: MechanicalConsequence): MechanicalConsequence {
  if (!genericPattern.test(consequence.summary) && !awkwardPattern.test(consequence.summary) && actionVerbPattern.test(consequence.summary)) return consequence;
  const npc = sceneNpc(input).label;
  const object = sceneObject(input).label;
  const safe = input.result === "success"
    ? `${input.actorName} limpia ${object} y ${npc} retrocede al ver que la prueba sigue intacta.`
    : input.result === "partial"
      ? `${input.actorName} conserva ${object}, pero ${npc} mancha el borde antes de apartarse.`
      : `${npc} tapa ${object} con la mano y la multitud avanza hasta cerrar el paso.`;
  return { ...consequence, summary: safe };
}

export function buildMechanicalConsequence(input: BuildMechanicalConsequenceInput): MechanicalConsequence {
  const domainBuilt = domainConsequence(input);
  const consequence = domainBuilt ?? (input.result === "success" ? buildSuccess(input) : input.result === "partial" ? buildPartial(input) : buildFailure(input));
  return sanitizeSummary(input, consequence);
}

export function isGenericMechanicalConsequence(text: string) { return genericPattern.test(text); }
export function isAwkwardMechanicalConsequence(text: string) { return awkwardPattern.test(text) || !actionVerbPattern.test(text) || text.trim().length < 48; }
