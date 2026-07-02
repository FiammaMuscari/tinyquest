import { isFinalScene } from "./ending-resolution";
import { createScenesForCampaign, toSceneActionChoice } from "./scenes";
import type { Campaign, CampaignActionOutcome, CampaignActionType, CrisisOption, GameRoom, Player, Scene, SceneActionChoice } from "./types";

const sceneCache = new Map<string, Scene[]>();

export function getCampaignScenes(campaign: Campaign): Scene[] {
  const cached = sceneCache.get(campaign.id);
  if (cached) return cached;
  const scenes = createScenesForCampaign(campaign);
  sceneCache.set(campaign.id, scenes);
  return scenes;
}

export function getRoomScenes(room: GameRoom): Scene[] {
  return getCampaignScenes(room.sessionConfig.selectedCampaign ?? room.campaign);
}

export function getCurrentScene(room: GameRoom): Scene {
  return getRoomScenes(room)[room.currentSceneIndex];
}

function decisiveClueCount(room: GameRoom): number {
  return new Set([...room.mysteryClues, ...room.memorySummary.clues]).size;
}

function followUpOutcomeKind(type: CampaignActionType, result: "success" | "partial" | "failure"): CampaignActionOutcome["kind"] {
  if (type === "interrogar_npc") return result === "failure" ? "npc_closes_off" : result === "success" ? "npc_confession" : "npc_evasion";
  if (type === "confrontar_npc") return result === "failure" ? "npc_closes_off" : result === "success" ? "npc_exposed" : "social_pressure";
  if (type === "investigar_objeto" || type === "comparar_evidencia" || type === "usar_objeto") {
    return result === "failure" ? "evidence_contaminated" : result === "success" ? "evidence_confirmed" : "evidence_partial";
  }
  if (type === "abrir_ruta") return result === "failure" ? "route_blocked" : "route_opened";
  if (type === "cerrar_ruta") return "route_blocked";
  if (type === "proteger_aliado") return result === "failure" ? "ally_harmed" : "ally_protected";
  if (type === "combatir") return result === "failure" ? "ally_harmed" : "combat_shift";
  if (type === "huir") return result === "failure" ? "route_blocked" : "escape_shift";
  if (type === "sacrificar_recurso") return result === "success" ? "object_changed" : "moral_choice";
  return result === "success" ? "moral_choice" : "social_pressure";
}

function finalSceneChoices(scene: Scene, room: GameRoom): SceneActionChoice[] {
  const hasSecretRoute = [
    ...room.storyFlags,
    ...room.mysteryClues,
    ...room.memorySummary.clues,
    room.memorySummary.currentTwist
  ].join(" ").toLowerCase().includes("secret");

  return [
    {
      id: `${scene.id}-ending-accuse`,
      label: "Acusar con las pruebas reunidas",
      action: "Presentar las pistas decisivas ante todos y acusar con las pruebas reunidas, obligando al culpable a responder en publico.",
      recommendedStats: ["mind"],
      skillTag: "investigate",
      category: "investigate",
      riskLevel: "medium",
      possibleOutcomeHint: "Final de verdad: el acusado, el culpable, la aldea y el grupo reciben consecuencia publica.",
      progressOnSuccess: 2.5,
      memoryImpact: "La mesa elige cerrar la ruta por verdad demostrada."
    },
    {
      id: `${scene.id}-ending-mercy`,
      label: "Ofrecer misericordia a cambio de confesión",
      action: "Ofrecer misericordia a cambio de una confesión completa, cambiando castigo por verdad y contención de la turba.",
      recommendedStats: ["charm"],
      skillTag: "talk",
      category: "talk",
      riskLevel: "medium",
      possibleOutcomeHint: "Final de misericordia: la confesión salva vidas pero deja deuda social.",
      progressOnSuccess: 2.5,
      memoryImpact: "La mesa elige cerrar la ruta por misericordia y confesión."
    },
    {
      id: `${scene.id}-ending-relic-secret`,
      label: "Usar la reliquia para revelar la verdad profunda",
      action: "Usar la reliquia, campana, marca u objeto decisivo para revelar la verdad profunda bajo la versión pública.",
      recommendedStats: ["focus"],
      skillTag: "investigate",
      category: "magic",
      riskLevel: "high",
      possibleOutcomeHint: hasSecretRoute ? "Final secreto: se abre la verdad bajo la verdad." : "Final secreto posible con coste: la reliquia fuerza una capa oculta.",
      progressOnSuccess: 2.5,
      dangerOnFailure: 2,
      memoryImpact: "La mesa intenta cerrar la ruta por secreto profundo."
    },
    {
      id: `${scene.id}-ending-false-culprit`,
      label: "Entregar un culpable falso para calmar a la turba",
      action: "Entregar un culpable falso o una explicación cómoda para calmar a la turba antes de que la verdad destruya más vidas.",
      recommendedStats: ["charm"],
      skillTag: "talk",
      category: "talk",
      riskLevel: "high",
      possibleOutcomeHint: "Final falso o corrupto: la aldea se calma, pero el secreto sobrevive.",
      progressOnSuccess: 2.5,
      dangerOnPartial: 1,
      dangerOnFailure: 2,
      memoryImpact: "La mesa elige una resolución falsa para sobrevivir al juicio."
    },
    {
      id: `${scene.id}-ending-break-proof`,
      label: "Romper la prueba para salvar al inocente",
      action: "Romper, ocultar o sacrificar la prueba decisiva para salvar al inocente ahora, aceptando que parte de la verdad quede sin tribunal.",
      recommendedStats: ["courage"],
      skillTag: "defend",
      category: "defend",
      riskLevel: "high",
      possibleOutcomeHint: "Final heroico con coste: el inocente vive, pero la prueba se pierde o queda marcada.",
      progressOnSuccess: 2.5,
      dangerOnFailure: 2,
      memoryImpact: "La mesa elige salvar al inocente con sacrificio de prueba."
    }
  ];
}

function fallbackSceneChoices(scene: Scene, room: GameRoom): SceneActionChoice[] {
  const active = room.players[room.activePlayerIndex];
  const baseStat = scene.allowedStats[0] ?? "mind";
  return [
    {
      id: `${scene.id}-basic-action`,
      label: "Hacer una acción básica",
      action: "Hacer una acción simple y segura, sin gastar energía, para mantener la iniciativa sin forzar una pista repetida.",
      actionType: "tomar_decision_moral",
      recommendedStats: [baseStat],
      skillTag: "investigate",
      category: "investigate",
      riskLevel: "low",
      energyCost: 0,
      targetId: scene.id,
      targetKind: "scene",
      possibleOutcomeHint: "El grupo gana una posición mínima o evita perder control del turno.",
      progressOnSuccess: 0.25,
      memoryImpact: "El turno mantiene continuidad sin repetir una acción agotada.",
      successOutcome: {
        kind: "moral_choice",
        summary: "El grupo toma una acción básica para sostener la escena sin gastar energía.",
        visibleConsequence: "La escena no se bloquea: queda una oportunidad pequeña para el siguiente turno."
      },
      partialOutcome: {
        kind: "social_pressure",
        summary: "La acción básica sostiene la escena, pero la presión no baja.",
        visibleConsequence: "La amenaza sigue cerca y exige una decisión más fuerte."
      },
      failureOutcome: {
        kind: "social_pressure",
        summary: "La acción básica no alcanza para imponer control.",
        visibleConsequence: "El peligro social sube porque la escena empieza a escaparse."
      },
      narrationHints: {
        mustMention: [scene.title],
        mustNotMention: ["objeto marcado genérico", "ruta abierta", "bestia retrocede"],
        style: "continuidad concreta"
      }
    },
    {
      id: `${scene.id}-rest`,
      label: active ? `Recuperar aliento y ahorrar energía (${active.name})` : "Recuperar aliento y ahorrar energía",
      action: "Ceder el impulso del turno para recuperar el aliento y guardar energía para una acción decisiva.",
      actionType: "proteger_aliado",
      recommendedStats: ["focus"],
      skillTag: "defend",
      category: "defend",
      riskLevel: "low",
      energyCost: 0,
      energyRestoreOnSuccess: 2,
      permanent: true,
      targetId: active?.id ?? scene.id,
      targetKind: "npc",
      possibleOutcomeHint: "Recupera margen narrativo; si falla, el peligro presiona.",
      progressOnSuccess: 0,
      dangerOnFailure: 1,
      memoryImpact: "El personaje recupera aire y evita actuar agotado.",
      successOutcome: {
        kind: "ally_protected",
        summary: "El personaje recupera aire y deja de actuar en automático.",
        visibleConsequence: "Puede volver a elegir acciones costosas cuando tenga energía."
      },
      partialOutcome: {
        kind: "ally_protected",
        summary: "Recupera algo de control, pero la escena sigue presionando.",
        visibleConsequence: "El descanso compra segundos, no resuelve el conflicto."
      },
      failureOutcome: {
        kind: "ally_harmed",
        summary: "El descanso llega tarde y la presión golpea al grupo.",
        visibleConsequence: "El peligro sube mientras intentan recuperar aire."
      },
      narrationHints: {
        mustMention: [active?.name ?? "el grupo", "aire", "presión"],
        mustNotMention: ["pista nueva", "compuerta", "bestia retrocede"],
        style: "pausa tensa"
      }
    },
    {
      id: `${scene.id}-ask-help`,
      label: "Pedir ayuda a un compañero",
      action: "Pedir ayuda para intentar una acción sin energía suficiente, aceptando deber o exposición.",
      actionType: "negociar",
      recommendedStats: ["charm"],
      skillTag: "talk",
      category: "talk",
      riskLevel: "medium",
      energyCost: 0,
      targetId: "party",
      targetKind: "faction",
      possibleOutcomeHint: "Un aliado cubre el esfuerzo, pero queda una deuda o riesgo.",
      progressOnSuccess: 0.5,
      dangerOnPartial: 1,
      dangerOnFailure: 1,
      memoryImpact: "El grupo convierte agotamiento en cooperación con coste.",
      successOutcome: {
        kind: "moral_choice",
        summary: "Un compañero ayuda y cubre el esfuerzo que faltaba.",
        visibleConsequence: "La acción sigue posible, pero queda una deuda interna."
      },
      partialOutcome: {
        kind: "social_pressure",
        summary: "La ayuda llega con torpeza y llama atención indeseada.",
        visibleConsequence: "La escena se sostiene, pero la presión social sube."
      },
      failureOutcome: {
        kind: "social_pressure",
        summary: "La ayuda falla y deja al grupo expuesto.",
        visibleConsequence: "La amenaza nota el agotamiento del grupo."
      },
      narrationHints: {
        mustMention: ["compañero", "ayuda", "coste"],
        mustNotMention: ["objeto marcado genérico", "ruta abierta automática"],
        style: "cooperación con deuda"
      }
    }
  ];
}

function followUpSceneChoices(scene: Scene, room: GameRoom): SceneActionChoice[] {
  const primaryNpcId = scene.npcIds?.[0];
  const primaryNpc = room.campaign.npcs.find((npc) => npc.id === primaryNpcId);
  const knownClue = room.mysteryClues[room.mysteryClues.length - 1] ?? scene.mysteryClue;
  const baseStat = scene.allowedStats[0] ?? "mind";
  const followUps: SceneActionChoice[] = [
    {
      id: `${scene.id}-use-known-clue`,
      label: "Presentar la contradicción",
      action: `Presentar la pista conocida (${knownClue}) para sacar una consecuencia nueva.`,
      actionType: "revelar_prueba",
      recommendedStats: ["mind"],
      skillTag: "investigate",
      category: "investigate",
      riskLevel: "medium",
      energyCost: 0,
      targetId: scene.id,
      targetKind: "scene",
      possibleOutcomeHint: "La pista deja de ser hallazgo y se vuelve presión concreta.",
      progressOnSuccess: 1,
      dangerOnPartial: 1,
      dangerOnFailure: 1,
      memoryImpact: "Una pista ya encontrada se usa para cambiar la escena.",
      successOutcome: {
        kind: "evidence_confirmed",
        summary: "La pista descubierta se usa como prueba y produce una consecuencia nueva.",
        visibleConsequence: "La escena avanza sin repetir el descubrimiento anterior."
      },
      partialOutcome: {
        kind: "social_pressure",
        summary: "La pista sostiene una duda, pero todavía no alcanza para cerrar la escena.",
        visibleConsequence: "El grupo gana presión, aunque necesita asumir un coste o avanzar."
      },
      failureOutcome: {
        kind: "social_pressure",
        summary: "La pista se usa mal y la oposición aprovecha la confusión.",
        visibleConsequence: "El peligro sube porque la escena se resiste a esa lectura."
      },
      narrationHints: {
        mustMention: ["pista", "consecuencia", scene.title],
        mustNotMention: ["descubrir otra vez", "objeto marcado genérico", "barro removido"],
        style: "usar evidencia ya conocida"
      },
      exhausts: true
    },
    {
      id: `${scene.id}-pressure-present-npc`,
      label: primaryNpc ? `Presionar a ${primaryNpc.name.split(",")[0]} de otro modo` : "Presionar a otro testigo",
      action: "Usar lo ocurrido para forzar una postura nueva, una duda o una ayuda concreta.",
      actionType: primaryNpcId ? "confrontar_npc" : "tomar_decision_moral",
      recommendedStats: ["charm"],
      skillTag: "talk",
      category: "talk",
      riskLevel: "medium",
      energyCost: 1,
      targetId: primaryNpcId ?? "scene-npc",
      targetKind: primaryNpcId ? "npc" : "scene",
      npcId: primaryNpcId,
      possibleOutcomeHint: "Un NPC cambia actitud o queda expuesto por lo ya ocurrido.",
      progressOnSuccess: 1,
      dangerOnPartial: 1,
      dangerOnFailure: 2,
      memoryImpact: "La presión social muta en consecuencia, no en repetición.",
      successOutcome: {
        kind: primaryNpcId ? "npc_exposed" : "social_pressure",
        summary: "La presión cambia de dirección y obliga a una postura nueva.",
        visibleConsequence: "El NPC o la multitud reaccionan a lo que ya se sabe."
      },
      partialOutcome: {
        kind: "social_pressure",
        summary: "La presión abre una duda, pero también deja al grupo más expuesto.",
        visibleConsequence: "La escena se tensa y exige decisión pronta."
      },
      failureOutcome: {
        kind: primaryNpcId ? "npc_closes_off" : "social_pressure",
        summary: "La presión se vuelve contra el grupo.",
        visibleConsequence: "La oposición usa el cansancio del grupo para recuperar control."
      },
      narrationHints: {
        mustMention: [primaryNpc?.name ?? "NPC presente", "presión", "reacción"],
        mustNotMention: ["repetir interrogatorio", "ruta abierta automática", "bestia retrocede"],
        style: "presión social mutada"
      },
      exhausts: true
    },
    {
      id: `${scene.id}-secure-before-moving`,
      label: "Proteger lo conseguido",
      action: "Proteger una pista, un aliado o una posición para que lo logrado no se pierda al cambiar la escena.",
      actionType: primaryNpcId ? "proteger_aliado" : "tomar_decision_moral",
      recommendedStats: ["courage"],
      skillTag: "defend",
      category: "defend",
      riskLevel: "medium",
      energyCost: 1,
      targetId: primaryNpcId ?? scene.id,
      targetKind: primaryNpcId ? "npc" : "scene",
      npcId: primaryNpcId,
      possibleOutcomeHint: "Lo conseguido queda protegido y la escena puede moverse sin resetear memoria.",
      progressOnSuccess: 1,
      dangerOnPartial: 1,
      dangerOnFailure: 2,
      memoryImpact: "El grupo asegura una consecuencia antes del avance.",
      successOutcome: {
        kind: "ally_protected",
        summary: "El grupo protege lo logrado y evita que la escena lo borre.",
        visibleConsequence: "La próxima escena podrá usar esta ventaja."
      },
      partialOutcome: {
        kind: "ally_protected",
        summary: "La protección funciona, pero cuesta energía o posición.",
        visibleConsequence: "La ventaja se conserva con presión encima."
      },
      failureOutcome: {
        kind: "ally_harmed",
        summary: "La protección falla y alguien paga el intento.",
        visibleConsequence: "La escena fuerza un coste antes de avanzar."
      },
      narrationHints: {
        mustMention: ["proteger", "lo logrado", "coste"],
        mustNotMention: ["pista nueva gratis", "descubrir otra vez", "compuerta"],
        style: "cierre de consecuencia"
      },
      exhausts: true
    },
    {
      id: `${scene.id}-force-scene-turn`,
      label: "Tomar una decisión arriesgada",
      action: "Aceptar que ya no queda investigación limpia y provocar un avance claro con coste visible.",
      actionType: "tomar_decision_moral",
      recommendedStats: [baseStat],
      skillTag: "defend",
      category: "defend",
      riskLevel: "high",
      energyCost: 0,
      targetId: scene.id,
      targetKind: "scene",
      possibleOutcomeHint: "La escena se empuja hacia avance, crisis o decisión concreta.",
      progressOnSuccess: 2.5,
      dangerOnPartial: 1,
      dangerOnFailure: 2,
      memoryImpact: "La mesa fuerza cierre de escena para evitar bucle de opciones.",
      successOutcome: {
        kind: "moral_choice",
        summary: "El grupo fuerza un giro y la escena deja de girar sobre las mismas opciones.",
        visibleConsequence: "La historia avanza con lo logrado, no con otra repetición."
      },
      partialOutcome: {
        kind: "social_pressure",
        summary: "El giro avanza la escena, pero deja una consecuencia abierta.",
        visibleConsequence: "El avance llega con peligro o deuda."
      },
      failureOutcome: {
        kind: "social_pressure",
        summary: "La escena avanza por presión enemiga, no por control del grupo.",
        visibleConsequence: "El peligro gana terreno y fuerza el próximo paso."
      },
      narrationHints: {
        mustMention: ["decisión", "avance", "coste"],
        mustNotMention: ["volver a examinar", "volver a interrogar igual", "objeto marcado genérico"],
        style: "giro claro de escena"
      },
      exhausts: true
    }
  ];

  const available = followUps.filter((choice) => !room.livingState.actionMemory[choice.id]?.exhausted);
  return available.length ? available : fallbackSceneChoices(scene, room);
}


// Resuelve el nombre real de la entidad objetivo de una opción (NPC, objeto o enemigo).
function mutationTargetName(choice: SceneActionChoice, room: GameRoom): string | null {
  const ids = [choice.npcId, choice.objectId, choice.targetId].filter((id): id is string => Boolean(id));
  for (const id of ids) {
    const npc = room.campaign.npcs.find((item) => item.id === id);
    if (npc) return npc.name.split(",")[0];
    const object = room.campaign.storyObjects?.find((item) => item.id === id);
    if (object) return object.name;
    const enemy = room.campaign.enemies.find((item) => item.id === id);
    if (enemy) return enemy.name;
  }
  return null;
}

function mutateExhaustedChoice(choice: SceneActionChoice, scene: Scene, room: GameRoom): SceneActionChoice | null {
  const entityName = mutationTargetName(choice, room);
  const targetName = entityName ?? choice.label.replace(/^(Interrogar|Comparar|Enfrentar|Revisar|Proteger|Abrir|Seguir|Usar)\s+/i, "");
  const variantsByType: Record<string, Array<{ suffix: string; label: string; action: string; progress: number }>> = {
    interrogar_npc: [
      { suffix: "offer", label: `Ofrecer protección a ${targetName}`, action: "Prometer protección concreta para que el testigo se anime a hablar.", progress: 0.75 },
      { suffix: "contradict", label: `Señalar la contradicción de ${targetName}`, action: "Usar lo que ya dijo para enfrentar su evasiva y ver si cambia de postura.", progress: 0.75 },
      { suffix: "fear", label: `Preguntar quién amenaza a ${targetName}`, action: "Apuntar al miedo del testigo y descubrir quién lo está callando.", progress: 1 }
    ],
    confrontar_npc: [
      { suffix: "witness", label: `Pedir testigos contra ${targetName}`, action: "Llamar a alguien presente para que la autoridad no controle sola el relato.", progress: 0.75 },
      { suffix: "public", label: `Hacer responder a ${targetName} ante todos`, action: "Obligar una respuesta pública delante de la gente reunida.", progress: 1 },
      { suffix: "ultimatum", label: `Dar un ultimátum a ${targetName}`, action: "Exigir una decisión clara y aceptar que la multitud reaccione.", progress: 1.25 }
    ],
    investigar_objeto: [
      { suffix: "preserve", label: `Guardar la prueba de ${targetName}`, action: "Apartar la evidencia de las manos equivocadas antes de que la arruinen.", progress: 0.75 },
      { suffix: "compare", label: `Contrastar ${targetName} con otra prueba`, action: "Comparar la evidencia con algo ya sabido para obtener consecuencia nueva.", progress: 1 },
      { suffix: "risk", label: `Arriesgar ${targetName} ante todos`, action: "Mostrar la evidencia en público y aceptar que puede dañarse o ser desacreditada.", progress: 1.25 }
    ],
    comparar_evidencia: [
      { suffix: "show", label: `Mostrar la contradicción de ${targetName}`, action: "Usar la comparación ya hecha como argumento frente a la presión social.", progress: 1 },
      { suffix: "test", label: `Poner a prueba ${targetName}`, action: "Hacer una comprobación rápida que confirme o debilite la comparación previa.", progress: 0.75 },
      { suffix: "force", label: `Forzar una conclusión sobre ${targetName}`, action: "Empujar la evidencia hacia una decisión aun si todavía hay riesgo.", progress: 1.25 }
    ],
    abrir_ruta: [
      { suffix: "use", label: `Usar la ruta con cuidado`, action: "La ruta ya no se abre otra vez: se usa, se vigila o se vuelve peligrosa.", progress: 1 },
      { suffix: "watch", label: `Vigilar quién usa la ruta`, action: "Convertir la ruta abierta en trampa social o física.", progress: 0.75 },
      { suffix: "commit", label: `Cruzar la ruta y aceptar el riesgo`, action: "Avanzar por la ruta aunque el coste pueda subir.", progress: 1.25 }
    ],
    proteger_aliado: [
      { suffix: "move", label: entityName ? `Mover a ${entityName} a cubierto` : `Mover al aliado a cubierto`, action: "La protección cambia de forma: mover, cubrir o negociar posición.", progress: 0.75 },
      { suffix: "shield", label: entityName ? `Cubrir a ${entityName} con un coste` : `Cubrir al aliado con un coste`, action: "Sostener la defensa aceptando daño, deuda o pérdida de posición.", progress: 1 },
      { suffix: "trust", label: entityName ? `Pedir confianza a ${entityName}` : `Pedir confianza al aliado`, action: "Convertir la protección anterior en confianza activa.", progress: 1 }
    ],
    negociar: [
      { suffix: "offer", label: `Mejorar la oferta a ${targetName}`, action: "Subir lo que se pone sobre la mesa para destrabar el trato anterior.", progress: 0.75 },
      { suffix: "guarantee", label: `Dar una garantía concreta a ${targetName}`, action: "Respaldar la palabra con un objeto, una promesa verificable o una deuda propia.", progress: 1 },
      { suffix: "price", label: `Aceptar el precio que pide ${targetName}`, action: "Cerrar el trato pagando el coste que antes se evitó.", progress: 1.25 }
    ],
    mentir: [
      { suffix: "sustain", label: `Sostener el engaño ante ${targetName}`, action: "Mantener la historia anterior agregando un detalle verificable.", progress: 0.75 },
      { suffix: "twist", label: `Cambiar la historia frente a ${targetName}`, action: "Reemplazar la mentira gastada por una versión nueva antes de que la comparen.", progress: 1 },
      { suffix: "half-truth", label: `Confesar a medias ante ${targetName}`, action: "Entregar una parte real de la verdad para salvar el resto del engaño.", progress: 1 }
    ],
    combatir: [
      { suffix: "flank", label: `Flanquear a ${targetName}`, action: "Cambiar el ángulo del enfrentamiento para quitarle la posición ganada.", progress: 0.75 },
      { suffix: "disarm", label: `Desarmar a ${targetName}`, action: "Atacar el arma o la herramienta en vez del cuerpo.", progress: 1 },
      { suffix: "corner", label: `Acorralar a ${targetName}`, action: "Cerrar las salidas y forzar rendición, huida o error.", progress: 1.25 }
    ]
  };
  const type = choice.actionType ?? "tomar_decision_moral";
  // Sin variantes específicas: solo mutar si hay una entidad real que ancle el texto.
  // Nunca coser plantillas con el label completo ("Aceptar un coste por <oración>").
  const variants = variantsByType[type] ?? (entityName ? [
    { suffix: "angle", label: `Volver sobre ${entityName} desde otro ángulo`, action: `Retomar el intento anterior con ${entityName} cambiando el método y aceptando un coste.`, progress: 0.75 },
    { suffix: "exposed", label: `Aprovechar lo que ${entityName} dejó expuesto`, action: `Usar la reacción previa de ${entityName} como palanca para una consecuencia nueva.`, progress: 1 },
    { suffix: "force", label: `Forzar una respuesta de ${entityName}`, action: `Presionar a ${entityName} hasta obtener decisión, ayuda o ruptura.`, progress: 1.25 }
  ] : null);
  if (!variants) return null;
  const selected = variants.find((variant) => !room.livingState.actionMemory[`${choice.id}-${variant.suffix}`]?.exhausted);
  if (!selected) return null;
  const outcomeKind = followUpOutcomeKind(type, "partial");
  const successKind = followUpOutcomeKind(type, "success");
  const failureKind = followUpOutcomeKind(type, "failure");
  return {
    ...choice,
    id: `${choice.id}-${selected.suffix}`,
    label: selected.label,
    action: selected.action,
    energyCost: Math.max(0, (choice.energyCost ?? 0) - 1),
    progressOnSuccess: selected.progress,
    dangerOnPartial: Math.max(1, choice.dangerOnPartial ?? 0),
    possibleOutcomeHint: "La repetición obliga a elegir: exponer la prueba, mover a un testigo o pagar un coste público.",
    memoryImpact: "La escena recuerda la acción repetida y vuelve más cara la misma maniobra.",
    successOutcome: {
      kind: successKind,
      summary: selected.action,
      visibleConsequence: "Un testigo cambia de postura y la oposición pierde una coartada concreta."
    },
    partialOutcome: {
      kind: outcomeKind,
      summary: "La maniobra funciona a medias y deja presión encima.",
      visibleConsequence: "La prueba sigue viva, pero queda manchada por una deuda o una mirada hostil."
    },
    failureOutcome: {
      kind: failureKind,
      summary: "La maniobra se vuelve pública y la oposición la aprovecha.",
      visibleConsequence: "El peligro sube porque la oposición aprovecha la repetición."
    },
    narrationHints: {
      mustMention: [choice.targetId ?? scene.title],
      mustNotMention: ["la escena cambia en algo visible", "un detalle físico queda confirmado", "decisión pública, ruta nueva, retirada o coste", "objeto marcado genérico"],
      style: "consecuencia nueva desde memoria"
    },
    exhausts: true
  };
}

function knownClueEntriesForRoom(room: GameRoom): Campaign["clues"] {
  const knownTexts = new Set([...room.mysteryClues, ...room.memorySummary.clues]);
  return room.campaign.clues.filter((clue) => knownTexts.has(clue.text) || (clue.label && knownTexts.has(clue.label)));
}

function isNpcAvailable(room: GameRoom, npcId: string): boolean {
  const state = room.livingState?.npcStates?.[npcId] ?? room.livingState?.secondaryNPCStates?.[npcId];
  if (state) return state.alive !== false && state.present !== false;
  return room.campaign.npcs.some((npc) => npc.id === npcId);
}

function isCrisisOptionAvailable(option: CrisisOption, room: GameRoom, knownClueIds: Set<string>): boolean {
  const flags = new Set(room.storyFlags);
  if ((option.requiredFlags ?? []).some((flag) => !flags.has(flag))) return false;
  if ((option.blockedByFlags ?? []).some((flag) => flags.has(flag))) return false;
  if ((option.requiredClues ?? []).some((clueId) => !knownClueIds.has(clueId))) return false;
  if ((option.requiredNpcs ?? []).some((npcId) => !isNpcAvailable(room, npcId))) return false;
  return true;
}

// La UI conoce investigate/talk/fight/defend/pet (ver normalizeCategory en scenes.ts).
const crisisCategoryByActionType: Partial<Record<CampaignActionType, SceneActionChoice["category"]>> = {
  combatir: "fight",
  proteger_aliado: "defend",
  cerrar_ruta: "defend",
  huir: "investigate",
  abrir_ruta: "investigate",
  investigar_objeto: "investigate",
  comparar_evidencia: "investigate",
  usar_objeto: "investigate"
};

const crisisIntentByActionType: Partial<Record<CampaignActionType, SceneActionChoice["intent"]>> = {
  combatir: "fight",
  proteger_aliado: "protect",
  cerrar_ruta: "protect",
  huir: "flee",
  abrir_ruta: "flee",
  revelar_prueba: "sacrifice",
  tomar_decision_moral: "sacrifice",
  sacrificar_recurso: "sacrifice"
};

function crisisOptionToChoice(option: CrisisOption, scene: Scene): SceneActionChoice {
  const category = crisisCategoryByActionType[option.actionType] ?? "talk";
  const intent = crisisIntentByActionType[option.actionType] ?? "talk";
  const statsInScene = option.recommendedStats.filter((stat) => scene.allowedStats.includes(stat));
  return {
    id: option.id,
    label: option.label,
    action: option.label,
    actionType: option.actionType,
    recommendedStats: statsInScene.length > 0 ? statsInScene : option.recommendedStats,
    skillTag: "crisis",
    category,
    intent,
    riskLevel: option.riskLevel,
    energyCost: option.energyCost ?? 1,
    targetId: option.targetId,
    targetKind: option.targetKind,
    npcId: option.targetKind === "npc" ? option.targetId : undefined,
    requiredFlags: option.requiredFlags,
    requiredClues: option.requiredClues,
    blockedByFlags: option.blockedByFlags,
    progressOnSuccess: option.progressOnSuccess ?? (option.riskLevel === "high" ? 1 : 0.75),
    dangerOnPartial: 1,
    dangerOnFailure: option.riskLevel === "high" ? 2 : 1,
    possibleOutcomeHint: option.consequenceHints?.onSuccess
  };
}

function derivedCrisisChoices(scene: Scene, room: GameRoom): SceneActionChoice[] {
  const preferredStat = (...stats: SceneActionChoice["recommendedStats"]) => stats.find((stat) => scene.allowedStats.includes(stat)) ?? scene.allowedStats[0] ?? "courage";
  const campaignScene = room.campaign.scenes.find((item) => item.id === scene.id);
  const location = campaignScene?.location ?? scene.title;
  const knownClues = knownClueEntriesForRoom(room);
  const latestClue = knownClues[knownClues.length - 1];
  const clueName = latestClue ? latestClue.label ?? latestClue.text : undefined;
  const npcId = (scene.npcIds ?? campaignScene?.npcIds ?? []).find((id) => isNpcAvailable(room, id)) ?? room.campaign.npcs.find((npc) => isNpcAvailable(room, npc.id))?.id;
  const npc = room.campaign.npcs.find((item) => item.id === npcId);
  const enemyId = scene.enemyIds?.[0] ?? campaignScene?.enemyIds?.[0] ?? room.campaign.enemies[0]?.id;
  const enemy = room.campaign.enemies.find((item) => item.id === enemyId);
  const choices: SceneActionChoice[] = [];

  if (npc && clueName) {
    choices.push({
      id: "crisis-confront-npc",
      label: `Confrontar a ${npc.name} con ${clueName}`,
      action: `Confrontar a ${npc.name} con ${clueName}`,
      actionType: "confrontar_npc",
      recommendedStats: [preferredStat("charm", "courage", "mind")],
      skillTag: "crisis",
      category: "talk",
      intent: "talk",
      riskLevel: "high",
      energyCost: 1,
      targetId: npc.id,
      targetKind: "npc",
      npcId: npc.id,
      progressOnSuccess: 1,
      dangerOnPartial: 1,
      dangerOnFailure: 1,
      possibleOutcomeHint: `${npc.name} debe responder ante ${clueName} sin escapatoria.`
    });
  }
  if (clueName && latestClue) {
    choices.push({
      id: "crisis-reveal-clue",
      label: `Presentar ${clueName} ante todos`,
      action: `Presentar ${clueName} ante todos`,
      actionType: "revelar_prueba",
      recommendedStats: [preferredStat("courage", "charm", "mind")],
      skillTag: "crisis",
      category: "talk",
      intent: "sacrifice",
      riskLevel: "high",
      energyCost: 1,
      progressOnSuccess: 1,
      dangerOnPartial: 1,
      dangerOnFailure: 1,
      possibleOutcomeHint: `${clueName} se vuelve pública y ya no se puede retirar.`
    });
  }
  if (npc) {
    const protectLabel = enemy ? `Proteger a ${npc.name} de ${enemy.name}` : `Sacar a ${npc.name} de ${location}`;
    choices.push({
      id: "crisis-protect-npc",
      label: protectLabel,
      action: protectLabel,
      actionType: "proteger_aliado",
      recommendedStats: [preferredStat("body", "courage", "focus")],
      skillTag: "crisis",
      category: "defend",
      intent: "protect",
      riskLevel: "high",
      energyCost: 1,
      targetId: npc.id,
      targetKind: "npc",
      npcId: npc.id,
      progressOnSuccess: 0.75,
      dangerOnPartial: 1,
      dangerOnFailure: 1,
      possibleOutcomeHint: `${npc.name} queda a salvo, pero otra ventaja se pierde.`
    });
  }
  if (enemy) {
    choices.push({
      id: "crisis-face-enemy",
      label: `Cerrar el paso a ${enemy.name}`,
      action: `Cerrar el paso a ${enemy.name}`,
      actionType: "combatir",
      recommendedStats: [preferredStat("courage", "body", "mind")],
      skillTag: "crisis",
      category: "fight",
      intent: "fight",
      riskLevel: "high",
      energyCost: 1,
      targetId: enemy.id,
      targetKind: "creature",
      progressOnSuccess: 0.75,
      dangerOnPartial: 1,
      dangerOnFailure: 1,
      possibleOutcomeHint: `${enemy.name} retrocede solo si alguien paga el riesgo de frente.`
    });
  }
  if (choices.length < 3) {
    const escapeLabel = `Abandonar ${location} antes de que se cierre`;
    choices.push({
      id: "crisis-escape-location",
      label: escapeLabel,
      action: escapeLabel,
      actionType: "huir",
      recommendedStats: [preferredStat("focus", "body", "luck")],
      skillTag: "crisis",
      category: "investigate",
      intent: "flee",
      riskLevel: "high",
      energyCost: 1,
      progressOnSuccess: 0.5,
      dangerOnPartial: 1,
      dangerOnFailure: 1,
      possibleOutcomeHint: `Salir de ${location} cuesta terreno ganado.`
    });
  }
  if (choices.length < 3) {
    const objectiveLabel = `A todo o nada: ${scene.objective.replace(/\.$/, "")}`;
    choices.push({
      id: "crisis-force-objective",
      label: objectiveLabel,
      action: objectiveLabel,
      actionType: "tomar_decision_moral",
      recommendedStats: [preferredStat("courage", "mind", "charm")],
      skillTag: "crisis",
      category: "talk",
      intent: "sacrifice",
      riskLevel: "high",
      energyCost: 1,
      progressOnSuccess: 1,
      dangerOnPartial: 1,
      dangerOnFailure: 1,
      possibleOutcomeHint: "El objetivo se fuerza ahora, con el precio que tenga."
    });
  }
  return choices;
}

export function getCrisisActionChoices(scene: Scene, room: GameRoom): SceneActionChoice[] {
  const campaignScene = room.campaign.scenes.find((item) => item.id === scene.id);
  const knownClueIds = new Set(knownClueEntriesForRoom(room).map((clue) => clue.id));
  const pool: CrisisOption[] = [...(campaignScene?.crisisOptions ?? []), ...(room.campaign.crisisOptions ?? [])];
  const seen = new Set<string>();
  const configured = pool
    .filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return isCrisisOptionAvailable(option, room, knownClueIds);
    })
    .map((option) => crisisOptionToChoice(option, scene));
  if (configured.length >= 3) return configured.slice(0, 5);
  const derived = derivedCrisisChoices(scene, room).filter((choice) => !configured.some((item) => item.id === choice.id));
  return [...configured, ...derived].slice(0, 5);
}

export function getVisibleActionChoices(scene: Scene, room: GameRoom): SceneActionChoice[] {
  if (room.dangerClock >= 10 || room.phase === "climax") {
    return getCrisisActionChoices(scene, room);
  }

  const hasConcreteFinalChoices = scene.actionChoices.some((choice) => choice.actionType === "revelar_prueba" || choice.actionType === "tomar_decision_moral" || choice.actionType === "sacrificar_recurso");
  if (isFinalScene(room.campaign, scene.id) && decisiveClueCount(room) >= 2 && !hasConcreteFinalChoices) {
    return finalSceneChoices(scene, room);
  }

  const flags = new Set(room.storyFlags);
  const clueTexts = new Set(room.mysteryClues);
  const clueIds = new Set(room.campaign.clues.filter((clue) => clueTexts.has(clue.text)).map((clue) => clue.id));

  // Requisitos comunes: flags, pistas, bloqueos, expiración por ronda y confianza del NPC.
  const meetsRequirements = (choice: SceneActionChoice): boolean => {
    if ((choice.requiredFlags ?? []).some((flag) => !flags.has(flag))) return false;
    if ((choice.requiredClues ?? []).some((clueId) => !clueIds.has(clueId))) return false;
    if ((choice.blockedByFlags ?? []).some((flag) => flags.has(flag))) return false;
    if (choice.expiresAfterRound !== undefined && room.roundInScene >= choice.expiresAfterRound) return false;
    if (choice.requiredTrust !== undefined) {
      const npcId = choice.npcId ?? choice.targetId;
      const trust = npcId ? room.livingState?.npcStates?.[npcId]?.trust ?? 0 : 0;
      if (trust < choice.requiredTrust) return false;
    }
    return true;
  };
  // Agotamiento: flag explícito, o auto-retiro tras 2 usos salvo opciones permanentes.
  const isExhausted = (choice: SceneActionChoice): boolean => {
    if (choice.permanent) return false;
    const memory = room.livingState.actionMemory[choice.id];
    if (!memory) return false;
    return Boolean(memory.exhausted) || (memory.uses ?? 0) >= 2;
  };

  // Opciones desbloqueadas por pistas conocidas (CampaignClue.unlocksActions → pool de campaña).
  const unlockedActionIds = new Set(room.campaign.clues.filter((clue) => clueIds.has(clue.id)).flatMap((clue) => clue.unlocksActions ?? []));
  const unlockedChoices = (room.campaign.unlockableOptions ?? [])
    .filter((option) => unlockedActionIds.has(option.id))
    .map(toSceneActionChoice)
    .filter((choice) => !scene.actionChoices.some((item) => item.id === choice.id));
  const candidates = [...scene.actionChoices, ...unlockedChoices];

  const visible = candidates.filter((choice) => !isExhausted(choice) && meetsRequirements(choice));
  const mutated = candidates
    .filter((choice) => isExhausted(choice) && meetsRequirements(choice))
    .map((choice) => mutateExhaustedChoice(choice, scene, room))
    .filter((choice): choice is SceneActionChoice => Boolean(choice));
  const combined = [...visible, ...mutated];
  if (combined.length >= 3) return combined.slice(0, 5);
  const supplements = followUpSceneChoices(scene, room).filter((choice) => !combined.some((item) => item.id === choice.id));
  const withSupplements = [...combined, ...supplements];
  if (withSupplements.length >= 3) return withSupplements.slice(0, 5);
  return fallbackSceneChoices(scene, room).filter((choice) => !withSupplements.some((item) => item.id === choice.id)).concat(withSupplements).slice(0, 5);
}

export function getActivePlayer(room: GameRoom): Player {
  return room.players[room.activePlayerIndex];
}
