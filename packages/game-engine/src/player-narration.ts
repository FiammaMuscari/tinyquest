import type { CampaignActionType, CheckOutcome, TurnResolution } from "./types";

export const forbiddenPlayerNarrationPhrases = [
  "actúa sobre",
  "actua sobre",
  "la acción sale mal",
  "la accion sale mal",
  "el intento de cambiar el enfoque",
  "la escena deja una consecuencia concreta",
  "la escena cambia en algo visible",
  "la siguiente acción debe",
  "la siguiente accion debe",
  "un detalle físico queda confirmado",
  "un detalle fisico queda confirmado",
  "se llena de ruido",
  "cambia de manos y deja una marca visible",
  "actiontype",
  "statepatch",
  "peligrodelta",
  "outcome",
  "pieza que debe encajar",
  "intenta torcer la escena",
  "la escena avanza desde lo ya ocurrido",
  "aceptar coste social",
  "forzar reacción social",
  "forzar reaccion social",
  "proteger, guardar o presentar",
  "detalle aparece en lo concreto",
  "la presión le gana un paso",
  "la presion le gana un paso",
  "lo que el grupo quería controlar",
  "lo que el grupo queria controlar",
  // Frases placeholder genéricas
  "toma una decisión arriesgada",
  "toma una decision arriesgada",
  "la ventaja pasa a otras manos",
  "alguien gana tiempo",
  "alguien pierde seguridad",
  "la decisión deja una marca clara",
  "la decision deja una marca clara",
  "obliga al grupo a moverse con cuidado",
  "la prueba deja de ser sospecha",
  "la ruta no es segura, pero cambia la posición de todos",
  "la ruta no es segura, pero cambia la posicion de todos",
  "ahora el peligro viene desde atrás",
  "ahora el peligro viene desde atras",
  "la escena responde con una consecuencia visible",
  // Frases que indican uso del action label como objeto
  "revisa revisar",
  "intenta revisar revisar",
  "trabaja sobre guardar",
  "trabaja sobre seguir",
  "trabaja sobre despistar",
  "trabaja sobre enfrentar",
  "trabaja sobre esconder",
];

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function containsForbiddenPlayerNarration(text: string): boolean {
  const normalized = normalize(text);
  return forbiddenPlayerNarrationPhrases.some((phrase) => normalized.includes(normalize(phrase)));
}

function cleanPublicName(value?: string | null): string {
  const raw = (value ?? "la escena").replace(/[_:]+/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return "la escena";
  if (/^[a-z0-9-]+$/i.test(raw) && raw.includes("-")) return "la prueba";
  return raw;
}

function shortConsequence(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^(La escena avanza sin repetir el descubrimiento anterior\.?)/i, "La presión cambia de lado.")
    .replace(/^(El intento de cambiar el enfoque[^.]*\.?)/i, "La maniobra queda expuesta.")
    .trim();
}

function npcName(turn: TurnResolution): string {
  return cleanPublicName(turn.target?.label);
}

function publicSummary(turn: TurnResolution): string {
  const summary = shortConsequence(turn.factualSummary ?? "");
  if (!summary || containsForbiddenPlayerNarration(summary)) return "";
  if (/^[a-z0-9_-]+$/i.test(summary)) return "";
  if (normalize(summary) === normalize(turn.visibleConsequence ?? "")) return "";
  return summary.endsWith(".") ? summary : `${summary}.`;
}

function publicConsequenceSentence(turn: TurnResolution): string {
  const text = buildVisibleConsequence(turn);
  return text.endsWith(".") ? text : `${text}.`;
}

function evidenceName(turn: TurnResolution): string {
  const name = cleanPublicName(turn.target?.label).toLowerCase();
  if (name.includes("mordida") || name.includes("cadáver") || name.includes("cadaver") || name.includes("herida")) return "la herida del cadáver";
  if (name.includes("cuerda")) return "la cuerda de la campana";
  if (name.includes("grillete") || name.includes("cadena")) return "los grilletes";
  return cleanPublicName(turn.target?.label);
}

export function buildVisibleConsequence(turn: TurnResolution): string {
  const type = turn.campaignActionType;
  const result = turn.result;
  if ((type === "comparar_evidencia" || type === "investigar_objeto") && result === "failure") {
    return evidenceName(turn).includes("herida")
      ? "La mordida queda en duda, pero ya no alcanza sola para defender al acusado."
      : shortConsequence(turn.visibleConsequence);
  }
  if (type === "interrogar_npc" && result === "failure") return `${npcName(turn)} se cierra. La oportunidad se pierde por ahora.`;
  if (type === "confrontar_npc" && result === "failure") return `${npcName(turn)} recupera autoridad. El peligro social sube.`;
  return shortConsequence(turn.visibleConsequence);
}

// Seed must vary per turn, not only per actor — hashing actorId alone locks each
// player to the same variant for the whole session.
function pickVariant(seedText: string, variants: string[]): string {
  const hash = seedText.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return variants[hash % variants.length];
}

export function buildPlayerNarration(turn: TurnResolution, sceneTitle = "la escena"): string {
  const actor = turn.actor.name;
  const actorId = `${turn.actor.id}:${turn.check?.total ?? 0}:${turn.check?.d20?.value ?? 0}:${turn.dangerDelta ?? 0}:${turn.factualSummary?.length ?? 0}`;
  const target = cleanPublicName(turn.target?.label);
  const type: CampaignActionType | undefined = turn.campaignActionType;
  const result = turn.result;
  const evidence = evidenceName(turn);
  const npc = npcName(turn);
  const summary = publicSummary(turn);
  const consequence = publicConsequenceSentence(turn);

  if (type === "interrogar_npc") {
    if (result === "success") {
      return `${actor} baja la voz y presiona a ${npc} sin entregarlo a la turba. La pregunta cae justo donde más le duele: la campana, el horario, lo que vio antes de callarse.\n\n${npc} mira hacia la puerta y traga saliva. —Sonó después —murmura—. El cuerpo ya estaba ahí.\n\nPor primera vez, su miedo sirve como prueba. ${summary || consequence}`;
    }
    if (result === "partial_success") {
      return `${actor} intenta sacarle la verdad a ${npc}, pero el muchacho no se anima a hablar con la turba tan cerca. Mira la campana, después mira a Elías, y se le apaga la voz.\n\nNo confiesa nada completo. Pero su silencio apunta en una dirección clara. ${summary || consequence}`;
    }
    return `${actor} presiona a ${npc}, y eso lo asusta demasiado. El testigo baja la cabeza justo cuando alguien de la autoridad se acerca.\n\n—No vi nada —dice, rápido.\n\nLa oportunidad se cierra delante de todos. ${consequence}`;
  }

  if (type === "comparar_evidencia") {
    if (result === "success") {
      return `${actor} se inclina sobre ${evidence} antes de que la turba invada el molino. No busca una marca espectacular: busca distancia, borde, presión.\n\nLa mordida no cierra. Fue marcada después, con una herramienta o una mano que quiso imitar una bestia.\n\nLa acusación pierde firmeza. ${summary || consequence}`;
    }
    if (result === "partial_success") {
      return `${actor} logra señalar algo raro en ${evidence}: el borde no parece de mandíbula limpia, pero la escena está demasiado alterada para sostenerlo sola.\n\nBruno lo nota. Elías también. La duda aparece, aunque todavía no alcanza para frenar a la turba. ${summary || consequence}`;
    }
    return `${actor} intenta usar ${evidence} como prueba frente a todos, pero el molino ya es un caos: harina mojada, sangre corrida y demasiadas manos cerca del cuerpo.\n\nElías se adelanta antes de que termine. —Prueba manoseada —dice, seco—. No sirve.\n\nLa gente deja de mirar la herida y empieza a mirar las manos de ${actor}. ${consequence}`;
  }

  if (type === "investigar_objeto" || type === "usar_objeto") {
    if (result === "success") {
      const variants = [
        `${actor} revisa ${evidence} con cuidado. Se fija en lo que cualquiera podría pasar por alto: el borde, la presión, el corte limpio o la marca donde no debería estar.\n\nLo que era una corazonada ahora tiene forma, peso y un dueño posible. ${summary || consequence}`,
        `${actor} se detiene frente a ${evidence} cuando los demás ya habrían seguido. Algo no encaja. Lo que encuentra no es llamativo: es exactamente lo que no debería estar ahí.\n\nLa pieza encaja con una pregunta que nadie ha formulado todavía. ${summary || consequence}`,
        `${actor} trabaja sobre ${evidence} en silencio mientras la escena presiona alrededor. El detalle que importa no está en lo visible: está en lo que falta.\n\nLo que descubre no responde todo, pero cierra una puerta a otra explicación. ${summary || consequence}`,
      ];
      return pickVariant(actorId, variants);
    }
    if (result === "partial_success") {
      return `${actor} encuentra algo útil en ${evidence}, pero no lo bastante limpio para imponerlo ante todos. La señal existe; lo difícil será protegerla de quienes quieren cerrarle la boca. ${summary || consequence}`;
    }
    return `${actor} intenta trabajar con ${evidence}, pero la presión alrededor arruina el momento. Alguien toca donde no debe, una voz grita desde atrás, y la prueba pierde limpieza.\n\nTodavía importa, pero ya no alcanza sola. ${consequence}`;
  }

  if (type === "confrontar_npc") {
    if (result === "success") {
      const variants = [
        `${actor} enfrenta a ${npc} delante de todos. No lo acusa con furia: lo obliga a responder una contradicción concreta.\n\nPor un segundo, ${npc} pierde el control de la escena. La multitud lo nota antes de que pueda recomponerse. ${summary || consequence}`,
        `${actor} planta la pregunta frente a ${npc} donde todos pueden verla. No hay espacio para esquivar sin que alguien lo note.\n\n${npc} responde, pero la respuesta llega un segundo tarde. Eso es suficiente. ${summary || consequence}`,
        `${actor} obliga a ${npc} a elegir entre responder o callarse frente a la multitud. Ambas opciones le cuestan.\n\nLa autoridad de ${npc} sigue en pie, pero ya no es incuestionable. ${summary || consequence}`,
      ];
      return pickVariant(actorId, variants);
    }
    if (result === "partial_success") {
      return `${actor} pone a ${npc} contra la mirada de la gente. La autoridad no cae, pero se agrieta: alguien duda, alguien baja la voz, alguien espera una prueba más. ${summary || consequence}`;
    }
    return `${actor} desafía a ${npc}, pero él recupera la voz más rápido. Señala al grupo, señala el cuerpo, y convierte la pregunta en sospecha.\n\nLa multitud acepta esa versión porque es más simple que pensar. ${consequence}`;
  }

  if (type === "proteger_aliado") {
    if (result === "success") {
      const variants = [
        `${actor} se interpone antes de que el daño llegue a ${target}. No hay discurso, solo cuerpo, reflejo y una decisión clara.\n\n${target} sigue en pie. Y ahora sabe que el grupo no lo está usando como prueba: lo está defendiendo. ${summary || consequence}`,
        `${actor} cubre a ${target} antes de que nadie más reaccione. El movimiento no es heroico: es preciso.\n\n${target} lo nota. El grupo también. La deuda que queda no es de palabras. ${summary || consequence}`,
        `${actor} lee el ángulo antes de que el golpe cierre y cambia de posición a tiempo. ${target} pierde un segundo pero no pierde más.\n\nLa decisión fue rápida. Las consecuencias no serán tan rápidas de calcular. ${summary || consequence}`,
      ];
      return pickVariant(actorId, variants);
    }
    if (result === "partial_success") {
      return `${actor} alcanza a cubrir a ${target}, pero no gratis. El golpe cambia de destino, la multitud lo ve, y la defensa se vuelve una promesa peligrosa. ${summary || consequence}`;
    }
    return `${actor} intenta proteger a ${target}, pero llega tarde. El daño pasa igual y la escena se endurece alrededor del aliado, que queda más expuesto que antes. ${consequence}`;
  }

  if (type === "abrir_ruta" || type === "cerrar_ruta") {
    if (result === "success") {
      const variants = [
        `${actor} encuentra el paso correcto y mueve al grupo antes de que la presión cierre la salida. La ruta no es segura, pero cambia la posición de todos.\n\nAhora el peligro viene desde atrás. ${summary || consequence}`,
        `${actor} lee la presión antes de que se cierre y señala la única salida que queda. No es el camino que querían, pero es el que existe ahora.\n\nEl grupo cruza. El flanco trasero queda abierto. ${summary || consequence}`,
        `${actor} empuja al grupo antes de que el cerco complete el círculo. La ruta no era evidente para nadie más, pero estaba ahí.\n\nGanan terreno. El peligro no desaparece: ahora los sigue. ${summary || consequence}`,
      ];
      return pickVariant(actorId, variants);
    }
    if (result === "partial_success") {
      const variants = [
        `${actor} abre un camino a medias. Sirve para moverse, pero deja ruido, marca o testigos suficientes para que alguien los siga. ${summary || consequence}`,
        `${actor} fuerza una salida que nadie habría elegido en condiciones normales. Funciona, pero el precio es visible: alguien supo por dónde fueron. ${summary || consequence}`,
      ];
      return pickVariant(actorId, variants);
    }
    return `${actor} fuerza la ruta y algo responde mal: una traba, un ruido, una mirada desde el otro lado. El camino queda bloqueado o demasiado caro para cruzarlo limpio. ${consequence}`;
  }

  if (type === "combatir") {
    if (result === "success") {
      const variants = [
        `${actor} gana distancia con un golpe limpio. La amenaza retrocede lo justo para que el grupo respire, pero no desaparece.`,
        `${actor} encuentra el ángulo antes de que la amenaza lo cierre. El intercambio es breve; el resultado, claro. El peligro retrocede un paso.`,
        `${actor} no espera: entra antes de que la amenaza esté lista. El golpe conecta donde duele y compra tiempo para todos.`,
      ];
      return pickVariant(actorId, variants);
    }
    if (result === "partial_success") return `${actor} contiene la amenaza, aunque el intercambio deja una marca clara: alguien pierde posición, aire o sangre.`;
    return `${actor} entra tarde al choque. La amenaza gana el ángulo y obliga al grupo a defenderse antes de poder pensar.`;
  }

  if (type === "tomar_decision_moral" || type === "revelar_prueba" || type === "sacrificar_recurso" || type === "negociar" || type === "mentir") {
    if (result === "success") {
      const variants = [
        `${actor} mueve primero y obliga a los demás a reaccionar. La ventaja es pequeña, pero es real. El coste aparecerá después.`,
        `${actor} fuerza la apertura antes de que la escena se cierre sola. No es una victoria limpia, pero es un paso hacia adelante.`,
        `${actor} elige el momento justo. La decisión se asienta antes de que nadie pueda revertirla. ${summary || consequence}`,
      ];
      return pickVariant(actorId, variants);
    }
    if (result === "partial_success") return `${actor} sostiene la decisión apenas lo suficiente. Nadie sale limpio del intercambio, y la deuda queda a la vista.`;
    const variants = [
      `${actor} lanza la maniobra en el momento equivocado. La respuesta llega antes de que el engaño pueda asentarse. El margen se cierra.`,
      `${actor} intenta forzar la situación, pero el control de la escena cambia antes de que el movimiento complete.`,
      `${actor} empuja demasiado rápido. La apertura se cierra antes de que pueda aprovecharla. ${consequence}`,
    ];
    return pickVariant(actorId, variants);
  }

  return `${actor} se mueve en ${sceneTitle}. La escena responde con una consecuencia visible.`;
}

const SYSTEM_PHRASES = [
  "actúa sobre la escena",
  "actua sobre la escena",
  "la decisión deja una marca clara y obliga al grupo a moverse con cuidado",
  "la decision deja una marca clara y obliga al grupo a moverse con cuidado",
  "cambia de manos y deja una marca visible para el grupo",
  "se llena de ruido",
  "actiontype", "statepatch", "targetid", "peligrodelta", "campaignactiontype", "resolutionplan",
];

export function isAcceptablePlayerNarration(_turn: TurnResolution, text: string): boolean {
  if (text.trim().length < 40) return false;
  if (containsForbiddenPlayerNarration(text)) return false;
  const lower = text.toLowerCase();
  if (SYSTEM_PHRASES.some((phrase) => lower.includes(phrase))) return false;
  return true;
}

export function buildCleanTurnNarration(turn: TurnResolution, sceneTitle: string, candidate?: string): string {
  if (candidate && isAcceptablePlayerNarration(turn, candidate)) return candidate.trim();
  return buildPlayerNarration(turn, sceneTitle);
}
