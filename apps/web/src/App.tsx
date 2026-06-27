import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Brain, Cat, Dices, Heart, HelpCircle, Pause, Play, Sparkles, Users, Wand2, X, Zap } from "lucide-react";
import { multiplayerClient, type MultiplayerState } from "./multiplayer/ws-client";
import { createDungeonMasterProvider } from "@tiny-quest/ai-master";
import { createImageProvider, createSoundProvider, readAtmosphereEnv } from "@tiny-quest/atmosphere";
import { characterStatAssets, characterTalentAssets } from "./character-assets";
import { campaignCardImage } from "./campaign-assets";
import {
  applyNarration,
  campaignById,
  campaigns,
  chooseVisibleBotAction,
  chooseBotStat,
  createCharacter,
  createScenesForCampaign,
  createSoloRoom,
  defaultCampaign,
  getRoomScenes,
  canPayActionEnergy,
  getActionEnergyCost,
  getDangerLabel,
  getVisibleActionChoices,
  legendaryPets,
  roles,
  resolvePlayerAction,
  shouldGrantCreativeBonus,
  species,
  totalExtraPoints,
  MockEmbeddingProvider,
  InMemoryVectorStore,
  NarrativeMemoryIndex,
  buildEmbeddedMemoriesFromTurn,
  retrieveNarrativeMemories,
  summarizeMoralProfileForPrompt,
  type Campaign,
  type CampaignNPC,
  type BotPlayer,
  type Character,
  type CheckResult,
  type DungeonNarrationOutput,
  type GameEvent,
  type GameRoom,
  type NarrationResponse,
  type SceneActionChoice,
  type StatKey
} from "@tiny-quest/game-engine";

const statLabels: Record<StatKey, string> = {
  body: "cuerpo",
  mind: "mente",
  charm: "carisma",
  creativity: "creatividad",
  courage: "coraje",
  focus: "enfoque",
  luck: "suerte"
};

const statAbbr: Record<StatKey, string> = {
  body: "CUE",
  mind: "MEN",
  charm: "CAR",
  creativity: "CRE",
  courage: "COR",
  focus: "ENF",
  luck: "SUE"
};

const avatarOptions = ["/assets/avatars/avatar-1.webp", "/assets/avatars/avatar-2.webp", "/assets/avatars/avatar-3.webp", "/assets/avatars/avatar-4.webp", "/assets/avatars/avatar-5.webp"];

const DICE_REVEAL_MS = 1250;
function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
const draftStorageKey = "tiny-quest:draft-character";
const campaignStorageKey = "tiny-quest:selected-campaign";
const statStorageKey = "tiny-quest:selected-stat";
const storageResetKey = "tiny-quest:storage-reset-version";
const storageResetVersion = "causal-resolution-plan-2026-06-19-v5";

function resetTinyQuestStorageOnce() {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(storageResetKey) === storageResetVersion) return;
    for (const storage of [localStorage, sessionStorage]) {
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key));
      for (const key of keys) {
        if (key.startsWith("tiny-quest:") || key === "tiny-quest-volume") storage.removeItem(key);
      }
    }
    localStorage.setItem(storageResetKey, storageResetVersion);
  } catch {
    // Si el navegador bloquea storage, la app sigue con estado limpio en memoria.
  }
}

resetTinyQuestStorageOnce();

function normalizeUiText(text: string) {
  return text
    .replaceAll("Campa?a", "Campaña")
    .replaceAll("lic?ntropo", "licántropo")
    .replaceAll("p?nico", "pánico")
    .replaceAll("patr?n", "patrón")
    .replaceAll("cad?ver", "cadáver")
    .replaceAll("copi?", "copió")
    .replaceAll("ba?ada", "bañada")
    .replaceAll("vendi?", "vendió")
    .replaceAll("protecci?n", "protección")
    .replaceAll("traici?n", "traición")
    .replaceAll("p?blico", "público")
    .replaceAll("naci?", "nació")
    .replaceAll("perd?n", "perdón")
    .replaceAll("respiraci?n", "respiración")
    .replaceAll("falsificaci?n", "falsificación")
    .replaceAll("confesi?n", "confesión")
    .replaceAll("Ã³", "ó")
    .replaceAll("Ã¡", "á")
    .replaceAll("Ã©", "é")
    .replaceAll("Ã­", "í")
    .replaceAll("Ãº", "ú")
    .replaceAll("Ã±", "ñ")
    .replaceAll("Â·", "·");
}

function isHumanTurn(room: GameRoom | null) {
  return room?.players[room.activePlayerIndex]?.type === "human";
}

function isBotTurn(room: GameRoom | null) {
  return room?.players[room.activePlayerIndex]?.type === "bot";
}

function cleanActionText(action: string) {
  const afterColon = action.includes(":") ? action.split(":").pop() ?? action : action;
  return afterColon
    .split("Mascota usada:")[0]
    .replace(/^[A-ZÁÉÍÓÚÑa-záéíóúñ]+ elige\s+"[^"]+"\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function fallbackConsequenceFor(action: string, outcome: CheckResult["outcome"], consequence?: string) {
  if (consequence) return consequence;
  const clean = cleanActionText(action).toLowerCase();
  if (outcome === "failure") {
    if (clean.includes("bestia") || clean.includes("combate")) return "La amenaza gana posición: el próximo turno exige defensa, huida o una prueba más difícil.";
    if (clean.includes("falsificación") || clean.includes("asesino")) return "La acusación queda incompleta: alguien usa la duda para proteger al verdadero culpable.";
    return "La escena pierde margen: una pista se enfría y el peligro gana presencia.";
  }
  if (outcome === "partial_success") {
    if (clean.includes("huella") || clean.includes("marca") || clean.includes("rastro")) return "La pista aparece, pero trae un coste: alguien más descubre que el grupo sabe demasiado.";
    if (clean.includes("calmar") || clean.includes("misericordia")) return "La tensión baja por un momento, aunque un testigo exige una promesa antes de hablar.";
    return "El grupo avanza, pero deja una deuda abierta para el siguiente turno.";
  }
  if (clean.includes("huella") || clean.includes("marca") || clean.includes("falsificación")) return "Las marcas dejan de parecer ataque animal: alguien midió los cortes con una herramienta.";
  if (clean.includes("hechizo") || clean.includes("magia") || clean.includes("runa")) return "El rastro mágico se vuelve legible y conecta la pista con un pacto antiguo.";
  if (clean.includes("bestia") || clean.includes("combate")) return "La amenaza retrocede y el grupo gana una ventana clara para moverse.";
  if (clean.includes("ruta") || clean.includes("forzar")) return "La salida queda abierta, pero conserva barro removido y una señal de uso anterior.";
  if (clean.includes("objeto") || clean.includes("examinar")) return "El objeto queda identificado: sus marcas podrán compararse con otro testimonio.";
  return "La acción deja una consecuencia concreta y obliga al grupo a elegir el siguiente paso.";
}

type LocalNarrationContext = {
  sceneTitle?: string;
  turnNumber?: number;
  role?: string;
  petName?: string;
  theory?: string;
  actionCountInScene?: number;
  sceneTurnCount?: number;
  recentNarrations?: string[];
};

function pickVariant<T>(items: T[], seed: string) {
  const index = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0) % items.length;
  return items[index];
}

function actionMood(action: string) {
  const clean = action.toLowerCase();
  if (clean.includes("bestia") || clean.includes("combate") || clean.includes("enfrentar")) return "combat";
  if (clean.includes("magia") || clean.includes("hechizo") || clean.includes("runa")) return "occult";
  if (clean.includes("huella") || clean.includes("rastro") || clean.includes("estudiar") || clean.includes("examinar") || clean.includes("objeto")) return "investigation";
  if (clean.includes("calmar") || clean.includes("misericordia") || clean.includes("hablar") || clean.includes("interrogar") || clean.includes("presionar") || clean.includes("confrontar") || clean.includes("declarar") || clean.includes("negociar")) return "social";
  if (clean.includes("defender") || clean.includes("proteger")) return "defense";
  if (clean.includes("ruta") || clean.includes("forzar") || clean.includes("sendero")) return "route";
  return "mystery";
}

function fallbackNarrationForTurn(playerName: string, action: string, outcome: CheckResult["outcome"], consequence?: string, context: LocalNarrationContext = {}): NarrationResponse {
  const cleanAction = cleanActionText(action);
  const consequenceText = fallbackConsequenceFor(cleanAction, outcome, consequence);
  const subject = cleanAction.endsWith(".") ? cleanAction.slice(0, -1) : cleanAction;
  const mood = actionMood(subject);
  const seed = `${playerName}-${subject}-${outcome}-${context.turnNumber ?? 0}`;
  const place = context.sceneTitle ? `en ${context.sceneTitle}` : "en la escena";
  const roleHint = context.role ? `, con el oficio de ${context.role},` : "";
  const petHint = context.petName ? ` ${context.petName} permanece cerca, no como adorno sino como presagio.` : "";
  const texture = sceneTexture(context.sceneTitle, subject);
  const beatIndex = context.actionCountInScene ?? 0;

  const successLines: Record<string, string[]> = {
    investigation: [
      `${playerName}${roleHint} levanta ${texture.object} ${place} y limpia el barro con el borde de la manga. Aparecen ${texture.sign}; ${texture.witness}.${petHint}`,
      `${playerName} examina ${texture.object} sin mover el cadáver. ${texture.sign} quedan a la vista, y ${texture.witness}.`
    ],
    occult: [
      `${playerName} sigue el rastro invisible hasta donde la magia empieza a parecer culpa. La señal no nombra al asesino, pero separa la mentira del ruido.${petHint}`,
      `${playerName} obliga al hechizo a mostrar su borde. Por un instante, el bosque parece recordar quién lo usó como coartada.`
    ],
    combat: [
      `${playerName} enfrenta la amenaza sin romper la escena. La bestia retrocede lo justo para revelar que no es el único monstruo de esta historia.`,
      `${playerName} clava los pies entre raíces mojadas y obliga a la criatura a torcer el salto. En la corteza queda una astilla negra que no pertenece a ningún animal.`
    ],
    social: [
      `${playerName} baja la violencia de la sala lo suficiente para que una verdad respire. Nadie perdona todavía, pero alguien deja de mentir con tanta seguridad.`,
      `${playerName} compra silencio, y el silencio compra tiempo. La multitud no se vuelve justa, pero por un momento vuelve a escuchar.`
    ],
    defense: [
      `${playerName} protege lo único que no puede defenderse: la prueba. Desde ese gesto, la acusación pierde parte de su teatro.`,
      `${playerName} pone el cuerpo entre la escena y quienes quieren deformarla. La verdad queda maltrecha, pero sigue viva.`
    ],
    mystery: [
      `${playerName} aparta ${texture.object} y encuentra ${texture.sign}. ${texture.witness} reacciona antes de poder disimularlo.`,
      `${playerName} fuerza ${texture.path}; ${texture.placeDetail} cambia de manos y deja una marca visible para el grupo.`
    ],
    route: [
      `${playerName} cruza ${texture.path} y encuentra ${texture.sign}. ${capitalizeSentence(texture.placeDetail)}; la salida queda abierta, pero alguien la había usado antes.`,
      `${playerName} aparta ${texture.object} del paso y descubre una marca reciente. ${capitalizeSentence(texture.witness)}. No fueron los primeros en usar esa salida.`
    ]
  };
  const partialLines: Record<string, string[]> = {
    investigation: [
      `${playerName} distingue parte de ${texture.sign} ${place}, pero el barro tapa el resto. ${texture.witness}, aunque todavía no se atreve a hablar.`,
      `${playerName} rescata ${texture.object} antes de que lo pisen. Sirve como indicio, no como sentencia: falta compararlo con una voz viva.`
    ],
    occult: [
      `${playerName} toca la forma del hechizo, y el hechizo toca algo de vuelta. La pista aparece, pero deja cansancio y una deuda breve.${petHint}`,
      `La magia responde a ${playerName} con una obediencia torcida. Muestra el camino, aunque no promete que el camino quiera ser seguido.`
    ],
    combat: [
      `${playerName} sobrevive al choque y arranca una ventaja pequeña. La bestia no cae; aprende el ritmo del grupo.`,
      `El combate no termina, pero cambia de dueño por un instante. ${playerName} gana aire, y la amenaza gana memoria.`
    ],
    social: [
      `${playerName} consigue que alguien hable, aunque no por confianza. La frase sirve, pero el precio queda pendiente.`,
      `La palabra de ${playerName} calma una llama y enciende otra. La aldea concede tiempo, no inocencia.`
    ],
    defense: [
      `${playerName} salva parte de la escena, no toda. Lo perdido dolerá después; lo conservado todavía puede salvar a alguien.`,
      `La defensa aguanta, pero deja una marca. Quienes miran ya saben dónde tendrán que golpear la próxima vez.`
    ],
    mystery: [
      `${playerName} obtiene una mitad útil: ${texture.sign}. ${texture.witness} exige algo antes de dejarla valer como prueba.`,
      `${subject} deja una salida incompleta; ${texture.placeDetail} permite avanzar, pero alguien puede contaminar la pista.`
    ],
    route: [
      `${playerName} abre paso por ${texture.path}, aunque una rama baja arranca tela y deja rastro. La ruta existe, pero ya no es secreta.`,
      `${playerName} encuentra el giro estrecho entre ${texture.object} y barro fresco. Sirve para avanzar; también delata que alguien lo usó antes.`
    ]
  };
  const failureLines: Record<string, string[]> = {
    investigation: [
      `${playerName} mueve ${texture.object} y ${texture.damage} sobre ${texture.sign}. La prueba no desaparece, pero queda fácil de negar.`,
      `${playerName} busca una marca limpia y solo encuentra agua sucia. ${texture.witness}, aprovechando el ruido, retrocede hacia la gente.`
    ],
    occult: [
      `${playerName} fuerza el rastro y la magia se cierra como una mano. Nada desaparece, pero todo queda menos dispuesto a hablar.${petHint}`,
      `El hechizo no se deja leer; castiga la prisa con silencio. ${playerName} entiende que la verdad también sabe esconderse.`
    ],
    combat: [
      `${playerName} entra al choque y la amenaza aprende demasiado. No es derrota final, pero sí una lección que el enemigo usará.`,
      `La bestia no vence por fuerza, sino por tiempo: se mueve, mide al grupo y deja el miedo trabajando por ella.`
    ],
    social: [
      `${playerName} hace la pregunta en voz alta, pero la sala ya eligió a quién creer. El miedo pesa más que la duda.`,
      `La conversación falla donde más dolía: nadie cambia de bando, solo de máscara.`
    ],
    defense: [
      `${playerName} llega un instante tarde. Algo queda protegido, pero otra cosa se rompe en manos de quienes necesitaban destruirla.`,
      `La defensa no cae entera, aunque cede lo bastante para que la amenaza encuentre entrada.`
    ],
    mystery: [
      `${playerName} toca ${texture.object} demasiado tarde: ${texture.sign} queda manchado, y ${texture.witness} aprovecha el error para mirar hacia otro lado.`,
      `${subject} falla cuando ${texture.placeDetail} se llena de ruido. No desaparece la pista, pero pierde filo ante cualquiera que quiera negarla.`
    ],
    route: [
      `${playerName} fuerza ${texture.path}, pero el paso cede bajo sus botas. La salida queda bloqueada con barro fresco y una hebra de ropa ajena.`,
      `${playerName} busca la ruta peligrosa y pisa una trampa vieja: no lo detiene, pero hace sonar un aviso donde alguien esperaba silencio.`
    ]
  };

  const narration =
    outcome === "failure"
      ? pickVariant(failureLines[mood], seed)
      : outcome === "partial_success"
        ? pickVariant(partialLines[mood], seed)
        : pickVariant(successLines[mood], seed);
  const dialogue = pickVariant([
    `Un testigo murmura: "Eso no salva a nadie todavia, pero cambia a quien debemos temer."`,
    `Una voz desde el borde del grupo dice: "La verdad acaba de perder un escondite."`,
    `Alguien aparta la mirada: "Si esto se sabe, nadie dormira bajo el mismo techo."`
  ], seed);
  const pressure = pressureLine(context.sceneTitle, mood, outcome, beatIndex);
  return {
    narration: [narration, pressure].filter(Boolean).join("\n\n"),
    npcDialogue: [dialogue],
    consequence: consequenceText,
    nextOptions: nextLocalOptions(context.sceneTitle),
    sections: {
      narration: [narration, pressure].filter(Boolean).join("\n\n"),
      dialogue,
      consequence: consequenceText,
      options: nextLocalOptions(context.sceneTitle)
    },
    memoryUpdate: {
      facts: [],
      clues: [],
      objects: [],
      npcs: [],
      locations: [],
      dangers: [],
      forbiddenContradictions: []
    },
    stateSuggestions: [],
    pacingHint: "continue"
  };
}

function sceneTexture(sceneTitle = "", action = "") {
  const scene = sceneTitle.toLowerCase();
  const act = action.toLowerCase();
  if (scene.includes("bosque rojo")) {
    return {
      object: act.includes("ruta") ? "la rama marcada con cera azul" : "el barro rojizo junto al arroyo",
      sign: "un hilo de plata vieja pegado a una espina",
      witness: "el Lobo Acusado baja la voz al reconocer el olor del archivo del alcalde",
      path: "el sendero de zarzas que evita la senda de los cazadores",
      placeDetail: "las campanillas de hueso colgadas en los pinos dejan de sonar a la vez",
      damage: "el barro rojizo se corre"
    };
  }
  if (scene.includes("cadaver") || scene.includes("molino")) {
    return {
      object: "la cuerda cortada de la campana del molino",
      sign: "tres cortes paralelos con distancia de herramienta, no de garra",
      witness: "el aprendiz del molino se lleva harina a la boca para no hablar",
      path: "la compuerta trasera bajo la rueda detenida",
      placeDetail: "la harina mojada copia unas botas que nadie quiso mencionar",
      damage: "la harina mojada se pega"
    };
  }
  if (scene.includes("lobo acusado")) {
    return {
      object: "el sello lunar roto sobre el banco de la capilla",
      sign: "tinta azul escondida bajo cera negra",
      witness: "la sacristana aprieta el rosario hasta hacerse sangre",
      path: "la puerta lateral hacia la cripta baja",
      placeDetail: "las velas se inclinan hacia el acusado como si lo escucharan respirar",
      damage: "la cera negra se mezcla"
    };
  }
  return {
    object: "un objeto que alguien intento apartar de la vista",
    sign: "una marca fisica que contradice la version publica",
    witness: "un testigo cambia de postura antes de mentir",
    path: "una ruta estrecha abierta con coste",
    placeDetail: "el lugar conserva una senal que puede tocarse",
    damage: "el polvo se corre"
  };
}

function capitalizeSentence(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function pressureLine(sceneTitle = "", mood: string, outcome: CheckResult["outcome"], count: number) {
  const scene = sceneTitle.toLowerCase();
  const step = Math.min(count, 3);
  if (mood === "route") {
    const lines = scene.includes("lobo acusado")
      ? [
        "La capilla ya no es refugio: cada puerta abierta obliga al acusado a elegir entre hablar o huir.",
        "La sacristana mira la entrada lateral; si alguien la cierra, la cripta quedara como unica salida.",
        outcome === "failure" ? "La ruta no se pierde, pero queda marcada por ruido y miedo." : "La ruta sirve ahora; repetirla solo avisara a la turba."
      ]
      : scene.includes("bosque rojo")
        ? [
          "El bosque no bloquea el paso, lo recuerda: una rama rota basta para que los cazadores sigan al grupo.",
          "El sendero nuevo compra distancia, no seguridad.",
          outcome === "failure" ? "La salida exige otro coste: objeto, energia o ayuda del acusado." : "La ruta queda usable una vez antes de volverse obvia."
        ]
        : ["La ruta abierta cambia la posicion del grupo.", "El camino nuevo trae coste si se repite.", "La escena exige avanzar o sellar el paso."];
    return lines[step % lines.length];
  }
  if (mood === "investigation") {
    const lines = scene.includes("molino") || scene.includes("cadaver")
      ? [
        "El aprendiz vio el gesto; si nadie lo protege, la turba lo hara callar.",
        "Mirar la misma cuerda otra vez no alcanza: hace falta compararla con sello, herramienta o testigo.",
        outcome === "failure" ? "La prueba queda viva, pero vulnerable." : "La marca ya puede sostener una pregunta peligrosa."
      ]
      : scene.includes("lobo acusado")
        ? [
          "El sello no absuelve solo: necesita una voz que admita de donde salio la tinta.",
          "La capilla escucha demasiado; cada examen atrae a la turba hacia la puerta.",
          outcome === "failure" ? "La prueba sirve todavia, pero ya no impresionara a todos." : "El objeto apunta a una falsificacion concreta."
        ]
        : ["El detalle fisico pide una segunda confirmacion.", "La pista no debe repetirse: debe cruzarse.", "El objeto ya cambio la pregunta correcta."];
    return lines[step % lines.length];
  }
  return "La decisión deja una marca clara y obliga al grupo a moverse con cuidado.";
}

function nextLocalOptions(sceneTitle = "") {
  const scene = sceneTitle.toLowerCase();
  if (scene.includes("bosque rojo")) return ["Seguir el hilo de plata hasta el arroyo", "Interrogar al Lobo Acusado lejos de la turba", "Cerrar la ruta con una falsa huella"];
  if (scene.includes("cadaver") || scene.includes("molino")) return ["Comparar cortes con la cuerda de campana", "Proteger el barro bajo la rueda", "Hacer hablar al aprendiz del molino"];
  if (scene.includes("lobo acusado")) return ["Mostrar el sello roto a la sacristana", "Contener a la turba en la puerta", "Rastrear tinta azul bajo el altar"];
  return ["Cruzar la pista con un objeto", "Presionar a un testigo concreto", "Abrir una ruta con coste"];
}

function narrativeBeatLine(mood: string, outcome: CheckResult["outcome"], count: number, playerName: string) {
  const step = Math.min(count, 3);
  const combat = [
    "El primer choque mide fuerzas; todavía nadie entiende por completo qué quiere la criatura.",
    "La amenaza ya reconoce el ritmo del grupo y empieza a atacar sus dudas, no solo sus cuerpos.",
    outcome === "success"
      ? "La herida o la retirada abre una lectura nueva: la bestia fue empujada a actuar por alguien más."
      : "La criatura conserva la iniciativa y obliga al grupo a decidir si perseguirla o proteger lo que ya ganó.",
    "Este combate ya no puede estirarse sin costo: debe cerrar una verdad, una huida o una pérdida."
  ];
  const investigation = [
    "La primera pieza separa sospecha de superstición.",
    "La segunda repetición ya no descubre lo mismo: confirma que hubo preparación y no impulso.",
    outcome === "success"
      ? "Con esa confirmación, la pista deja de ser indicio y empieza a ser acusación posible."
      : "La prueba queda cerca de volverse acusación, pero aún le falta una voz, un objeto o una contradicción.",
    "Insistir sobre la misma pista ahora debe abrir una nueva ruta o bloquearse como agotada."
  ];
  const occult = [
    "El primer contacto con la magia revela una firma, no una respuesta.",
    "El rastro se estrecha: ya no apunta al bosque entero, sino a una voluntad que lo usó.",
    outcome === "success"
      ? "La magia deja de ser ambiente y se vuelve testimonio: alguien la invocó con propósito."
      : "El hechizo cobra precio por cada lectura y empieza a reconocer a quienes lo persiguen.",
    "Seguir forzando la misma magia debe llevar a una revelación mayor o a una consecuencia irreversible."
  ];
  const social = [
    "La primera palabra compra tiempo.",
    "La segunda cambia alianzas: alguien calla menos y otro escucha demasiado.",
    "La conversación ya tiene bandos; lo que se diga ahora puede salvar o condenar a alguien.",
    "La sala no aceptará más demora: exige promesa, prueba o sacrificio."
  ];
  const defense = [
    "La primera defensa conserva margen.",
    "La segunda obliga al enemigo a mostrar por dónde quería entrar.",
    "La protección ya tiene forma política: defender la prueba también acusa a quien quería tocarla.",
    "A partir de ahora, defender sin avanzar solo compra segundos caros."
  ];
  const mystery = [
    "La primera marca separa superstición de montaje.",
    "La prueba repetida ya exige testigo, objeto o contradicción: mirarla otra vez no alcanza.",
    outcome === "success"
      ? "La confirmación permite acusar una mano concreta, no una sombra conveniente."
      : "La pista sobrevive, pero necesita protección antes de que alguien la vuelva inútil.",
    "Insistir sin cambiar de método agotará la acción y forzará una ruta más cara."
  ];
  const route = [
    "El paso nuevo no es limpio: deja barro removido y una decisión atrás.",
    "La ruta descubierta cambia la escena porque conecta objeto, testigo y riesgo inmediato.",
    outcome === "success"
      ? "El grupo ya puede avanzar, pero la ruta revela que alguien la había preparado antes."
      : "La ruta queda cerca, no segura; abrirla otra vez costará peligro u objeto.",
    "El camino no debe repetirse: ahora toca entrar, sellarlo o usarlo como cebo."
  ];
  return ({ combat, investigation, occult, social, defense, mystery, route } as Record<string, string[]>)[mood]?.[step] ?? `${playerName} deja una consecuencia visible en la escena.`;
}

function buildOpeningBeat(campaign: Campaign, sceneTitle: string, objective: string): { sections: NonNullable<NarrationResponse["sections"]>; plotBeat: NonNullable<NarrationResponse["plotBeat"]> } {
  const npc = campaign.npcs[0]?.name ?? "Testigo";
  const enemy = campaign.enemies[0]?.name ?? "la amenaza";
  const clue = campaign.clues[0]?.text ?? "La primera pista contradice la versión oficial.";
  const premise = campaign.premise ?? campaign.storyHook;
  const stakes = (campaign.stakes?.[0] ?? `si nadie actua, ${enemy} decide por todos`).replace(/\.$/, "").toLowerCase();
  return {
    sections: {
      narration: `${sceneTitle} abre la campaña con una injusticia preparada de antemano. ${premise} La primera tarea no es ganar: es impedir que el miedo escriba la version oficial antes que el grupo encuentre una prueba firme.`,
      dialogue: `${npc}: "No necesito que me crean. Necesito que miren antes de obedecer."`,
      consequence: `Peligro bajo: todavia hay margen, pero ${stakes}.`,
      options: ["Examinar la pista que no encaja", `Presionar a ${npc}`, `Prepararse contra ${enemy}`]
    },
    plotBeat: {
      title: `Capitulo I: ${sceneTitle}`,
      hook: campaign.storyHook,
      twist: clue,
      characterFocus: "Fiamy decide si protege la verdad o calma a quienes ya eligieron culpable.",
      threat: `${enemy} avanza si el grupo pierde tiempo o fuerza una respuesta falsa.`,
      continuity: "La primera escena debe dejar claro quien miente, quien teme y que pista no pertenece al crimen."
    }
  };
}

type DiceSnapshot = {
  check: CheckResult;
  playerId: string;
  player: string;
  action: string;
  stat: StatKey;
  skillUsed: string;
  petUsed?: string;
  consequence?: string;
  consequenceRoll?: number;
  combatNote?: string;
};

function readStoredDraft() {
  try {
    const raw = localStorage.getItem(draftStorageKey);
    return raw ? createCharacter(JSON.parse(raw) as Partial<Character>) : createCharacter();
  } catch {
    return createCharacter();
  }
}

function readStoredCampaignId() {
  const stored = localStorage.getItem(campaignStorageKey);
  return stored && campaigns.some((campaign) => campaign.id === stored) ? stored : defaultCampaign.id;
}

function readStoredStat() {
  const stored = localStorage.getItem(statStorageKey);
  return stored && stored in statLabels ? stored as StatKey : createScenesForCampaign(defaultCampaign)[0].actionChoices[0].recommendedStats[0];
}

export function App() {
  const masterProvider = useMemo(() => createDungeonMasterProvider(import.meta.env.VITE_MASTER_PROVIDER ?? "groq", import.meta.env), []);
  const atmosphereEnv = useMemo(() => readAtmosphereEnv(import.meta.env), []);
  const imageProvider = useMemo(() => createImageProvider(import.meta.env.VITE_IMAGE_PROVIDER ?? "mock"), []);
  const soundProvider = useMemo(() => createSoundProvider(import.meta.env.VITE_SOUND_PROVIDER ?? "mock"), []);

  const [draft, setDraft] = useState<Character>(() => readStoredDraft());
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => readStoredCampaignId());
  const selectedCampaign = campaignById(selectedCampaignId);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const sceneList = useMemo(() => room ? getRoomScenes(room) : createScenesForCampaign(selectedCampaign), [room?.selectedCampaignId, selectedCampaign.id]);
  const [selectedActionDraftId, setSelectedActionDraftId] = useState(sceneList[0].actionChoices[0].id);
  const [selectedStat, setSelectedStat] = useState<StatKey>(() => readStoredStat());
  const [usePet, setUsePet] = useState(false);
  const [dice, setDice] = useState<DiceSnapshot | null>(null);
  const [currentNarration, setCurrentNarration] = useState("Narración: La aventura espera. Elegí una campaña y armá tu personaje para que el narrador abra la primera escena. Consecuencia: el reloj de peligro todavía está quieto. Opciones: investiga, habla o toma un riesgo.");
  const [npcDialogue, setNpcDialogue] = useState<string[]>([]);
  const [nextOptions, setNextOptions] = useState<string[]>(["Seguir el objetivo.", "Investigar una pista.", "Usar habilidad o mascota."]);
  const [enrichedChoiceLabels, setEnrichedChoiceLabels] = useState<Record<string, string>>({});
  const [dmSections, setDmSections] = useState<NarrationResponse["sections"]>();
  const [plotBeat, setPlotBeat] = useState<NarrationResponse["plotBeat"]>();
  const [latestTurnNarration, setLatestTurnNarration] = useState<NarrationResponse | undefined>();
  const [busy, setBusy] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const turnInFlightRef = useRef(false);
  const previousActivePlayerIdRef = useRef<string | null>(null);
  const narrativeIndexRef = useRef<NarrativeMemoryIndex | null>(null);

  const [mpState, setMpState] = useState<MultiplayerState>(() => multiplayerClient.state);
  const [mpLobbyMode, setMpLobbyMode] = useState<"host" | "guest" | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");

  useEffect(() => {
    const handler = (s: MultiplayerState) => {
      setMpState({ ...s });
      if (s.gameRoom && ["active", "watching", "narrating", "opponent_gone", "ended"].includes(s.phase)) {
        setRoom(s.gameRoom);
      }
      if (s.lastEventSummary) setCurrentNarration(s.lastEventSummary);
    };
    multiplayerClient.on("state_change", handler);
    return () => multiplayerClient.off("state_change", handler);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const scene = sceneList[room?.currentSceneIndex ?? 0];
  const visibleChoices = useMemo(() => room ? getVisibleActionChoices(scene, room) : scene.actionChoices, [room, scene]);
  const activePlayer = room?.players[room.activePlayerIndex];
  const botTurnPaused = Boolean(room && activePlayer?.type === "bot" && !busy && !turnInFlightRef.current && !room.sessionComplete);
  const selectedActionDraft = isHumanTurn(room) || !room ? (visibleChoices.find((choice) => choice.id === selectedActionDraftId) ?? visibleChoices[0] ?? scene.actionChoices[0]) : undefined;
  const selectedChoice = selectedActionDraft ?? visibleChoices[0] ?? scene.actionChoices[0];
  const currentCharacter = activePlayer?.character ?? draft;
  const elapsedSeconds = room ? Math.floor((now - room.sessionStartedAt) / 1000) : 0;
  const totalSeconds = (room?.sessionConfig.maxMinutes ?? 15) * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

  const [sceneImageUrl, setSceneImageUrl] = useState(scene.atmosphere.fallbackImage);
  const [sceneAudioUrl, setSceneAudioUrl] = useState(scene.atmosphere.fallbackAudio);
  const [soundMood, setSoundMood] = useState(scene.atmosphere.ambientSoundPrompt);
  const [isAudioPlaying, setAudioPlaying] = useState(false);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("tiny-quest-volume") ?? "0.35"));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const atmosphereCacheRef = useRef(new Map<string, { imageUrl: string; audioUrl: string; mood: string }>());

  function chooseSceneAction(choiceId: string) {
    if (isBotTurn(room)) return;
    const choice = visibleChoices.find((item) => item.id === choiceId) ?? scene.actionChoices.find((item) => item.id === choiceId);
    setSelectedActionDraftId(choiceId);
    if (choice) setSelectedStat(choice.recommendedStats[0]);
    setTurnError(null);
  }

  useEffect(() => {
    localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    localStorage.setItem(campaignStorageKey, selectedCampaignId);
  }, [selectedCampaignId]);

  useEffect(() => {
    localStorage.setItem(statStorageKey, selectedStat);
  }, [selectedStat]);

  useEffect(() => {
    if (!isHumanTurn(room)) return;
    if (!visibleChoices.some((choice) => choice.id === selectedActionDraftId)) {
      const nextChoice = visibleChoices[0] ?? scene.actionChoices[0];
      setSelectedActionDraftId(nextChoice.id);
      setSelectedStat(nextChoice.recommendedStats[0]);
    }
  }, [room, scene.actionChoices, selectedActionDraftId, visibleChoices]);

  useEffect(() => {
    const activeId = room?.players[room.activePlayerIndex]?.id ?? null;
    if (!room || previousActivePlayerIdRef.current === activeId) return;
    previousActivePlayerIdRef.current = activeId;
    setUsePet(false);
    setTurnError(null);
    if (isHumanTurn(room)) {
      const nextChoice = visibleChoices[0] ?? scene.actionChoices[0];
      setSelectedActionDraftId(nextChoice.id);
      setSelectedStat(nextChoice.recommendedStats[0]);
    }
  }, [room, scene.actionChoices, visibleChoices]);

  useEffect(() => {
    if (room) return;
    const firstScene = sceneList[0];
    setSelectedActionDraftId(firstScene.actionChoices[0].id);
    setSelectedStat(firstScene.actionChoices[0].recommendedStats[0]);
    setCurrentNarration(`Narración: ${selectedCampaign.scenes[0].title} espera al grupo con una pista, un peligro y una mentira. Consecuencia: el reloj de peligro aún está quieto. Opciones: investiga, habla o toma un riesgo.`);
    setNpcDialogue([`${selectedCampaign.npcs[0].name}: Nadie cuenta toda la verdad en una primera escena.`]);
    setDmSections(undefined);
    setPlotBeat(undefined);
    setLatestTurnNarration(undefined);
    const opening = buildOpeningBeat(selectedCampaign, firstScene.title, firstScene.objective);
    setCurrentNarration(opening.sections.narration);
    setNpcDialogue([opening.sections.dialogue]);
    setNextOptions(opening.sections.options);
    setDmSections(opening.sections);
    setPlotBeat(opening.plotBeat);
  }, [room, sceneList, selectedCampaign]);

  useEffect(() => {
    setSceneImageUrl(scene.atmosphere.imageAssetUrl ?? scene.atmosphere.fallbackImage);
    setSceneAudioUrl(scene.atmosphere.audioAssetUrl ?? scene.atmosphere.fallbackAudio);
    setSoundMood(scene.atmosphere.ambientSoundPrompt);
  }, [scene.id, scene.atmosphere]);

  useEffect(() => {
    let cancelled = false;
    async function loadAtmosphere() {
      const cached = atmosphereCacheRef.current.get(scene.id);
      if (cached) {
        setSceneImageUrl(cached.imageUrl);
        setSceneAudioUrl(cached.audioUrl);
        setSoundMood(cached.mood);
        return;
      }
      const [image, sound] = await Promise.all([
        imageProvider.generateSceneImage({
          sceneId: scene.id,
          sceneTitle: scene.title,
          visualPrompt: scene.atmosphere.visualPrompt,
          atmosphereTags: scene.atmosphere.atmosphereTags,
          fallbackImage: scene.atmosphere.fallbackImage
        }),
        soundProvider.generateAmbientSound({
          sceneId: scene.id,
          sceneTitle: scene.title,
          ambientSoundPrompt: scene.atmosphere.ambientSoundPrompt,
          atmosphereTags: scene.atmosphere.atmosphereTags,
          fallbackAudio: scene.atmosphere.fallbackAudio
        })
      ]);
      if (cancelled) return;
      atmosphereCacheRef.current.set(scene.id, { imageUrl: image.imageAssetUrl, audioUrl: sound.audioAssetUrl, mood: sound.mood });
      setSceneImageUrl(image.imageAssetUrl);
      setSceneAudioUrl(sound.audioAssetUrl);
      setSoundMood(sound.mood);
    }
    void loadAtmosphere();
    return () => { cancelled = true; };
  }, [imageProvider, scene.id, scene.title, scene.atmosphere.visualPrompt, scene.atmosphere.ambientSoundPrompt, scene.atmosphere.fallbackImage, scene.atmosphere.fallbackAudio, soundProvider]);

  useEffect(() => {
    localStorage.setItem("tiny-quest-volume", String(volume));
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.loop = true;
    if (isAudioPlaying) {
      audio.play().catch(() => setAudioPlaying(false));
    } else {
      audio.pause();
    }
  }, [isAudioPlaying, sceneAudioUrl, volume]);

  function startSolo() {
    narrativeIndexRef.current = new NarrativeMemoryIndex({
      embeddingProvider: new MockEmbeddingProvider(),
      store: new InMemoryVectorStore()
    });
    const nextRoom = createSoloRoom(draft, selectedCampaign);
    setRoom(nextRoom);
    const firstScene = getRoomScenes(nextRoom).find((candidate) => candidate.id === nextRoom.initialSceneId) ?? getRoomScenes(nextRoom)[0];
    setSelectedActionDraftId(firstScene.actionChoices[0].id);
    setSelectedStat(firstScene.actionChoices[0].recommendedStats[0]);
    setCurrentNarration(`Narración: ${firstScene.title} empieza con una promesa rota y una pista peligrosa. Consecuencia: el peligro empieza en cero, pero cada decisión acerca la verdad. Opciones: investiga, negocia o arriesga una jugada audaz.`);
    setNpcDialogue([`${selectedCampaign.npcs[0].name}: Si quieres la verdad, tendrás que pagar con algo más que dados.`]);
    setDmSections(undefined);
    setPlotBeat(undefined);
    setLatestTurnNarration(undefined);
    const opening = buildOpeningBeat(selectedCampaign, firstScene.title, firstScene.objective);
    setCurrentNarration(opening.sections.narration);
    setNpcDialogue([opening.sections.dialogue]);
    setNextOptions(opening.sections.options);
    setDmSections(opening.sections);
    setPlotBeat(opening.plotBeat);
  }

  function startMultiplayerHost() {
    setMpLobbyMode("host");
    multiplayerClient.createRoom(draft.name, draft, selectedCampaignId);
  }

  function openMultiplayerJoin() {
    multiplayerClient.connect();
    setMpLobbyMode("guest");
  }

  function confirmJoinRoom() {
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length < 4) return;
    multiplayerClient.joinRoom(code, draft.name, draft);
  }

  function cancelMultiplayer() {
    multiplayerClient.disconnect();
    setMpLobbyMode(null);
    setJoinCodeInput("");
    setRoom(null);
  }

  function runMultiplayerTurn() {
    if (!selectedActionDraft || !mpState.yourTurn || mpState.phase !== "active") return;
    multiplayerClient.submitAction(selectedActionDraft.action, selectedStat, usePet);
  }

  async function runTurn(botAction?: string, botStat?: StatKey) {
    if (!room || room.sessionComplete || busy || turnInFlightRef.current) return;
    turnInFlightRef.current = true;
    setBusy(true);
    setTurnError(null);
    let resolution: ReturnType<typeof resolvePlayerAction> | null = null;
    let active = room.players[room.activePlayerIndex];
    try {
      active = room.players[room.activePlayerIndex];
      if (active.status === "dead") return;
      const chosenAction = botAction ?? selectedActionDraft?.action;
      if (!chosenAction) return;
      const chosenChoice = scene.actionChoices.find((choice) => choice.action === chosenAction || chosenAction.includes(choice.action));
      const turnAction = chosenAction;
      const displayAction = chosenChoice?.label ?? cleanActionText(turnAction);
      const petActive = usePet && active.type === "human";
      const turnStat = botStat ?? selectedStat;
      const actionCountInScene = room.sessionLog.filter((event) =>
        event.sceneId === scene.id && (event.actionLabel === displayAction || cleanActionText(event.action) === displayAction)
      ).length;
      const sceneTurnCount = room.sessionLog.filter((event) => event.sceneId === scene.id).length;
      const localNarrationContext = {
        sceneTitle: scene.title,
        turnNumber: room.turn + 1,
        role: active.character.role,
        petName: petActive ? active.character.pet.name : undefined,
        theory: room.narrativeMemory?.conclusions.currentTheory ?? room.memorySummary.currentTwist,
        actionCountInScene,
        sceneTurnCount,
        recentNarrations: room.sessionLog.slice(0, 5).map((event) => event.narration)
      };
      resolution = resolvePlayerAction(room, turnAction, turnStat, petActive);
      setDice({
        check: resolution.check,
        playerId: active.id,
        player: active.name,
        action: displayAction,
        stat: turnStat,
        skillUsed: active.character.abilityProgression.currentSkill,
        petUsed: petActive ? active.character.pet.name : undefined,
        consequence: resolution.consequence?.text,
        consequenceRoll: resolution.consequence?.roll.value,
        combatNote: resolution.combatNote
      });
      await wait(DICE_REVEAL_MS);

      // RAG: retrieve past memories and attach to narration request before calling LLM
      if (narrativeIndexRef.current) {
        const retrieved = await retrieveNarrativeMemories({ room, resolution, memoryIndex: narrativeIndexRef.current, limit: 5 });
        const moralProfile = room.narrativeMemory.moralProfile;
        const moralProfileSummary = moralProfile ? summarizeMoralProfileForPrompt(moralProfile, active.name) : undefined;
        resolution.narrationRequest.narrativeContext = {
          retrievedMemories: retrieved,
          moralProfileSummary: moralProfileSummary || undefined
        };
      }

      let narration: NarrationResponse;
      const importantTurn = active.type === "human" || resolution.check.outcome !== "success" || Boolean(resolution.consequence) || nextOptions.length === 0;
      if (!importantTurn) {
        narration = fallbackNarrationForTurn(active.name, displayAction, resolution.check.outcome, resolution.consequence?.text, localNarrationContext);
      } else {
        try {
          narration = await masterProvider.generateNarration(resolution.narrationRequest);
        } catch {
          narration = fallbackNarrationForTurn(active.name, displayAction, resolution.check.outcome, resolution.consequence?.text, localNarrationContext);
        }
      }
      let nextRoom = applyNarration(room, resolution, narration);

      // RAG: index memories from this turn (async, fire-and-forget)
      if (narrativeIndexRef.current) {
        const memories = buildEmbeddedMemoriesFromTurn({ roomBefore: room, roomAfter: nextRoom, resolution, narration: narration.structuredNarration });
        narrativeIndexRef.current.addMemories(memories).catch(() => {/* silent */});
      }
      if (nextRoom.sessionComplete) {
        let finalRecap = buildFinalRecap(nextRoom);
        try {
          const recap = await masterProvider.generateFinalRecap({
            room: nextRoom,
            sessionConfig: resolution.narrationRequest.sessionConfig,
            world: resolution.narrationRequest.world
          });
          finalRecap = recap.recap || finalRecap;
        } catch {
          // El final debe ser visible aunque el proveedor externo no responda.
        }
        nextRoom = { ...nextRoom, finalRecap };
      }
      const latestEvent = nextRoom.sessionLog[0];
      const safeNarration = latestEvent?.narration ?? narration.playerNarration ?? narration.sections?.narration ?? narration.narration;
      const safeConsequence = latestEvent?.consequenceText ?? narration.consequenceText ?? narration.sections?.consequence ?? narration.consequence ?? "La escena cambia de forma concreta.";
      setRoom(nextRoom);
      setCurrentNarration(safeNarration);
      setNpcDialogue(narration.npcDialogue);
      setNextOptions(narration.nextOptions);
      setLatestTurnNarration(narration);
      setDmSections({
        narration: safeNarration,
        dialogue: narration.sections?.dialogue ?? narration.npcDialogue.join(" "),
        consequence: safeConsequence,
        options: narration.sections?.options ?? narration.nextOptions
      });
      setPlotBeat(narration.plotBeat);
      const nextScene = getRoomScenes(nextRoom)[nextRoom.currentSceneIndex];
      const nextChoices = getVisibleActionChoices(nextScene, nextRoom);
      // Use exact ID mapping from enrichedOptions (preferred), fall back to index-based
      if (narration.enrichedOptions?.length) {
        const labels: Record<string, string> = {};
        for (const opt of narration.enrichedOptions) {
          if (opt.id && opt.label) labels[opt.id] = opt.label;
        }
        if (Object.keys(labels).length) setEnrichedChoiceLabels(labels);
      } else {
        const llmOptions = narration.sections?.options ?? narration.nextOptions;
        if (llmOptions?.length) {
          const labels: Record<string, string> = {};
          nextChoices.forEach((choice, i) => { if (llmOptions[i]) labels[choice.id] = llmOptions[i]; });
          setEnrichedChoiceLabels(labels);
        }
      }
      const nextActive = nextRoom.players[nextRoom.activePlayerIndex];
      if (nextActive.type === "human") {
        const nextChoice = nextChoices[0] ?? nextScene.actionChoices[0];
        setSelectedActionDraftId(nextChoice.id);
        setSelectedStat(nextChoice.recommendedStats[0]);
      }
      setUsePet(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Groq no pudo narrar este turno.";
      setTurnError(message);
      if (resolution) {
        const fallback = fallbackNarrationForTurn(active.name, resolution.narrationRequest.rawAction, resolution.check.outcome, resolution.consequence?.text, {
          sceneTitle: scene.title,
          turnNumber: room.turn + 1,
          role: active.character.role,
          theory: room.narrativeMemory?.conclusions.currentTheory ?? room.memorySummary.currentTwist
        });
        const nextRoom = applyNarration(room, resolution, fallback);
        const safeRoom = nextRoom.sessionComplete && !nextRoom.finalRecap ? { ...nextRoom, finalRecap: buildFinalRecap(nextRoom) } : nextRoom;
        const latestEvent = safeRoom.sessionLog[0];
        const safeNarration = latestEvent?.narration ?? fallback.narration;
        const safeConsequence = latestEvent?.consequenceText ?? fallback.consequence ?? "La escena cambia de forma concreta.";
        setRoom(safeRoom);
        setCurrentNarration(safeNarration);
        setNpcDialogue(fallback.npcDialogue);
        setNextOptions(fallback.nextOptions);
        setLatestTurnNarration(fallback);
        setDmSections({ narration: safeNarration, dialogue: fallback.npcDialogue.join(" "), consequence: safeConsequence, options: fallback.nextOptions });
      }
      setPlotBeat(undefined);
    } finally {
      turnInFlightRef.current = false;
      setBusy(false);
    }
  }

  async function runBotTurn() {
    if (!room || activePlayer?.type !== "bot") return;
    const bot = activePlayer as BotPlayer;
    const stat = chooseBotStat(bot, scene);
    await runTurn(chooseVisibleBotAction(bot, scene, room), stat);
  }


  const mpPreGamePhases: MultiplayerState["phase"][] = ["idle", "connecting", "lobby_host", "lobby_guest", "waiting_guest"];
  if (mpLobbyMode !== null && mpPreGamePhases.includes(mpState.phase)) {
    return (
      <MultiplayerLobbyScreen
        mode={mpLobbyMode}
        mpState={mpState}
        joinCodeInput={joinCodeInput}
        setJoinCodeInput={setJoinCodeInput}
        onConfirmJoin={confirmJoinRoom}
        onCancel={cancelMultiplayer}
      />
    );
  }

  if (!room) {
    return (
      <LobbyScreen
        selectedCampaign={selectedCampaign}
        setSelectedCampaignId={setSelectedCampaignId}
        draft={draft}
        setDraft={setDraft}
        scene={scene}
        sceneImageUrl={sceneImageUrl}
        startSolo={startSolo}
        onMultiplayerHost={startMultiplayerHost}
        onMultiplayerJoin={openMultiplayerJoin}
      />
    );
  }

  const isMultiplayer = mpLobbyMode !== null;
  const mpBlockActions = isMultiplayer && (mpState.phase !== "active" || !mpState.yourTurn);
  const handleHumanTurn = isMultiplayer ? runMultiplayerTurn : () => runTurn();

  return (
    <main className="appShell">
      <TopStatus room={room} sceneTitle={scene.title} danger={room?.dangerClock ?? 0} remainingSeconds={remainingSeconds} activePlayer={activePlayer} />
      <HelpButton open={showHelp} setOpen={setShowHelp} />
      {isMultiplayer && <MultiplayerStatusBar mpState={mpState} onLeave={cancelMultiplayer} />}
      {room.sessionComplete && <FinalBanner room={room} onBackToCampaigns={() => { cancelMultiplayer(); setRoom(null); }} onReplayRoute={startSolo} />}
      {isMultiplayer && mpState.phase === "opponent_gone" && (
        <div className="mpDisconnectOverlay">
          <p>Tu oponente se desconectó. La partida continúa si regresa en 5 minutos.</p>
          <button className="ghostButton" onClick={cancelMultiplayer}>Volver al menú</button>
        </div>
      )}
      <section className="gameFrame">
        <TurnQueue room={room} draft={draft} audioRef={audioRef} audioUrl={sceneAudioUrl} ambienceName={scene.title} mood={soundMood} isPlaying={isAudioPlaying} setPlaying={setAudioPlaying} volume={volume} setVolume={setVolume} />
        <section className="centerColumn">
          {!room.sessionComplete && <ScenePanel sceneTitle={scene.title} objective={scene.objective} clues={room?.mysteryClues ?? [scene.mysteryClue]} choices={visibleChoices} selectedActionDraftId={(isBotTurn(room) || mpBlockActions) ? "" : selectedActionDraftId} onChoice={chooseSceneAction} imageUrl={sceneImageUrl} energy={currentCharacter.energy} enrichedLabels={enrichedChoiceLabels} />}
          {!room.sessionComplete && <CastPanel npcIds={scene.npcIds ?? []} npcs={room.campaign.npcs} />}
          {!room.sessionComplete && <ActionComposer room={room} activeType={activePlayer?.type} busy={busy || (isMultiplayer && mpState.phase === "narrating")} botTurnPaused={!isMultiplayer && botTurnPaused} turnError={turnError ?? mpState.errorMessage} sceneChoices={visibleChoices} selectedChoice={selectedActionDraft} selectedStat={selectedStat} setSelectedStat={setSelectedStat} character={currentCharacter} usePet={usePet} setUsePet={setUsePet} runHuman={handleHumanTurn} runBot={runBotTurn} multiplayerBlock={mpBlockActions} />}
          <DiceResultBar dice={dice} activePlayerId={activePlayer?.id} />
        </section>
        <DungeonMasterPanel room={room} narration={currentNarration} latestTurnNarration={latestTurnNarration} dice={dice} botTurnPaused={!isMultiplayer && botTurnPaused} onContinueBot={runBotTurn} sections={dmSections} plotBeat={plotBeat} dialogue={npcDialogue} finalRecap={room?.finalRecap} warnings={atmosphereEnv.warnings} />
      </section>
    </main>
  );
}

function LobbyScreen({ selectedCampaign, setSelectedCampaignId, draft, setDraft, scene, sceneImageUrl, startSolo, onMultiplayerHost, onMultiplayerJoin }: { selectedCampaign: Campaign; setSelectedCampaignId: (id: string) => void; draft: Character; setDraft: (character: Character) => void; scene: ReturnType<typeof createScenesForCampaign>[number]; sceneImageUrl: string; startSolo: () => void; onMultiplayerHost: () => void; onMultiplayerJoin: () => void }) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <main className="appShell lobbyShell">
      <HelpButton open={showHelp} setOpen={setShowHelp} />
      <header className="lobbyHeader">
        <div>
          <img className="brandLogo" src="/assets/brand/tiny-quest-logo.png" alt="Tiny Quest" />
        </div>
        <div className="lobbyHeaderActions">
          <button className="soloButton lobbyStart" onClick={startSolo}><Play size={18} /> Iniciar solo con bots</button>
          <button className="ghostButton" type="button" onClick={onMultiplayerHost}><Users size={16} /> Crear sala 2 jugadores</button>
          <button className="ghostButton" type="button" onClick={onMultiplayerJoin}><Users size={16} /> Unirse con código</button>
        </div>
      </header>

      <section className="lobbyLayout">
        <section className="lobbyHeroGrid">
          <CharacterDesigner draft={draft} setDraft={setDraft} disabled={false} />

          <section className="panel lobbyPreview">
            <PanelTitle title="Escena inicial" icon={<Sparkles size={17} />} />
            <div className="sceneImage lobbySceneImage" style={{ backgroundImage: `linear-gradient(90deg, rgba(5,8,18,.82), rgba(5,8,18,.2)), url(${sceneImageUrl})` }}>
              <div><h2>{normalizeUiText(selectedCampaign.title)}</h2><p>{normalizeUiText(scene.title)} · {normalizeUiText(scene.objective)}</p></div>
            </div>
            <div className="tagRow">{selectedCampaign.recommendedStats.map((tag) => <span key={tag}>{statLabels[tag]}</span>)}</div>
            <div className="lobbyInfoGrid">
              <div className="lobbyPromptBox">
                <strong>Campaña</strong>
                <p>{normalizeUiText(selectedCampaign.storyHook)}</p>
                <p>{normalizeUiText(selectedCampaign.genre)} · {selectedCampaign.durationMinutes} min · {normalizeUiText(selectedCampaign.difficulty)}</p>
              </div>
              <div className="lobbyPromptBox">
                <strong>Narrador</strong>
                <p>{normalizeUiText(selectedCampaign.narratorGuidance)}</p>
                <p>Mascotas: {selectedCampaign.legendaryPets.map(normalizeUiText).join(", ")}</p>
              </div>
            </div>
          </section>
        </section>

        <section className="panel lobbyThemesPanel">
          <PanelTitle title="Campañas disponibles" icon={<Sparkles size={17} />} />
          <div className="lobbyThemeGrid">
            {campaigns.map((campaign, index) => (
              <button className={`lobbyThemeCard themeTint${index % 5} ${campaign.id === selectedCampaign.id ? "selected" : ""}`} key={campaign.id} onClick={() => setSelectedCampaignId(campaign.id)} style={{ "--campaign-bg": `url(${campaignCardImage(campaign.id)})` } as React.CSSProperties}>
                <strong>{normalizeUiText(campaign.title)}</strong>
                <span>{normalizeUiText(campaign.description)}</span>
                <em>{normalizeUiText(campaign.genre)} · {campaign.recommendedSkills.slice(0, 3).map(normalizeUiText).join(" · ")}</em>
                <small>{campaign.durationMinutes} min · {normalizeUiText(campaign.difficulty)} · {campaign.scenes.length} escenas · {campaign.scenes.some((item) => item.hasCombat) ? "combate opcional" : "misterio/social"}</small>
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function TopStatus({ room, sceneTitle, danger, remainingSeconds, activePlayer }: { room: GameRoom | null; sceneTitle: string; danger: number; remainingSeconds: number; activePlayer?: GameRoom["players"][number] }) {
  const maxRounds = room?.sessionConfig.maxRoundsPerScene ?? 4;
  const currentRound = room ? Math.min(maxRounds, room.roundInScene + 1) : 1;
  const turnValue = activePlayer ? `${activePlayer.name}${activePlayer.type === "human" ? " · tu turno" : " · bot"}` : "Sin iniciar";
  return (
    <header className="topStatus cleanStatus">
      <div className="brandBlock"><img className="brandLogo brandLogoSmall" src="/assets/brand/tiny-quest-logo.png" alt="Tiny Quest" /></div>
      <StatusPill label="Escena" value={sceneTitle} />
      <StatusPill label="Ronda" value={`${currentRound}/${maxRounds}`} />
      <StatusPill label="Turno" value={turnValue} />
      <StatusPill label="Peligro" value={`${danger}/10`} accent />
      <StatusPill label="Tiempo" value={formatClock(remainingSeconds)} />
    </header>
  );
}

function StatusPill({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`statusPill ${accent ? "accent" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function TurnQueue({ room, draft, audioRef, audioUrl, ambienceName, mood, isPlaying, setPlaying, volume, setVolume }: { room: GameRoom | null; draft: Character; audioRef: RefObject<HTMLAudioElement | null>; audioUrl: string; ambienceName: string; mood: string; isPlaying: boolean; setPlaying: (v: boolean) => void; volume: number; setVolume: (v: number) => void }) {
  const players = room?.players ?? [{ id: "preview", name: draft.name, type: "human" as const, character: draft, temporaryItems: [] }];
  return (
    <aside className="panel turnQueue">
      <PanelTitle title="Turnos" icon={<Bot size={17} />} />
      {players.map((player, index) => {
        const active = room?.activePlayerIndex === index;
        const next = room && (room.activePlayerIndex + 1) % players.length === index;
        return (
          <article className={`queueCard ${active ? "current" : ""}`} key={player.id}>
            <div className="avatar"><img src={player.character.avatarUrl} alt={player.name} /><span>{player.type === "bot" ? "BOT" : "TU"}</span></div>
            <div><strong>{player.name}</strong><span>{player.character.species} · {player.character.role}</span><small>{player.status === "dead" ? "Caído trágicamente" : active ? "Turno actual" : next ? "Siguiente" : "En cola"}</small></div>
            <div className="miniMeters"><span><Heart size={13} /> {player.character.vitality}</span><span><Zap size={13} /> {player.character.energy}</span><span><Cat size={13} /> {player.character.pet.name}</span></div>
          </article>
        );
      })}
      <div className="queueAudio">
        <audio ref={audioRef} src={audioUrl} onError={() => setPlaying(false)} />
        <button className="iconButton queueAudioBtn" type="button" onClick={() => setPlaying(!isPlaying)} title={isPlaying ? "Pausar" : "Reproducir"}>
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <div className="queueAudioInfo">
          <strong>{ambienceName}</strong>
          <span>{mood.slice(0, 60)}</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="queueAudioVol" />
      </div>
    </aside>
  );
}

function CastPanel({ npcIds, npcs }: { npcIds: string[]; npcs: CampaignNPC[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const present = npcIds.map((id) => npcs.find((npc) => npc.id === id)).filter((npc): npc is CampaignNPC => Boolean(npc));
  if (!present.length) return null;
  return (
    <section className="panel castPanel">
      <PanelTitle title="Personajes en escena" icon={<Users size={16} />} />
      <p className="castHint">Tocá un nombre para ver quién es.</p>
      <div className="castList">
        {present.map((npc) => {
          const open = openId === npc.id;
          return (
            <button key={npc.id} type="button" className={`castCard ${open ? "open" : ""}`} onClick={() => setOpenId(open ? null : npc.id)} aria-expanded={open}>
              <span className="castHead">
                <strong>{npc.name}</strong>
                {npc.role && <span className="castRole">{npc.role}</span>}
              </span>
              {open && (
                <span className="castBody">
                  <span className="castDesc">{npc.description}</span>
                  {npc.desire && <span className="castTrait"><em>Quiere:</em> {npc.desire}</span>}
                  {npc.fear && <span className="castTrait"><em>Teme:</em> {npc.fear}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ScenePanel({ sceneTitle, objective, clues, choices, selectedActionDraftId, onChoice, imageUrl, energy, enrichedLabels }: { sceneTitle: string; objective: string; clues: string[]; choices: SceneActionChoice[]; selectedActionDraftId: string; onChoice: (id: string) => void; imageUrl: string; energy: number; enrichedLabels?: Record<string, string> }) {
  const sceneBg = `linear-gradient(90deg, rgba(5,8,18,.82), rgba(5,8,18,.22)), url(${imageUrl})`;
  return (
    <section className="panel scenePanel">
      <div className="sceneImage" style={{ backgroundImage: sceneBg }}>
        <div>
          <h2>{sceneTitle}</h2>
          <p>{objective}</p>
          {clues[0] && <span className="sceneClueInline">🔍 {clues[0]}</span>}
        </div>
      </div>
      <div className="choiceGrid">
        {choices.map((choice) => {
          const energyCost = getActionEnergyCost(choice);
          const disabled = !canPayActionEnergy(energy, choice);
          return (
            <button className={`choiceCard ${choice.category ?? "investigate"} ${choice.id === selectedActionDraftId ? "selected" : ""} ${disabled ? "unavailable" : ""}`} key={choice.id} onClick={() => onChoice(choice.id)} type="button">
              <strong>{enrichedLabels?.[choice.id] ?? choice.label}</strong>
              <div className="choiceMeta">
                <div className="choiceStats">
                  {choice.recommendedStats.map((stat) => (
                    <span key={stat} className={`statChip stat-${stat}`}>{statLabels[stat]}</span>
                  ))}
                </div>
                <span className="choiceCost"><Zap size={10} />{energyCost}{disabled ? <em>−{energyCost - energy}</em> : null}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
function SceneMemoryPanel({ room, sceneClue }: { room: GameRoom; sceneClue: string }) {
  const latest = room.sessionLog[0];
  const clues = Array.from(new Set([sceneClue, ...room.mysteryClues, ...room.memorySummary.clues])).slice(0, 4);
  const threads = room.memorySummary.unresolvedThreads.slice(0, 2);
  const suspects = room.memorySummary.suspects.slice(0, 3);
  const betrayals = room.memorySummary.betrayals.slice(0, 2);
  return (
    <section className="panel memoryPanel">
      <PanelTitle title="Memoria" icon={<Brain size={17} />} />
      <div className="memoryGrid">
        <div><strong>Giro actual</strong><p>{room.memorySummary.currentTwist || "La verdad todavía no tiene forma."}</p></div>
        <div><strong>Pistas</strong>{clues.map((clue) => <span key={clue}>{clue}</span>)}</div>
        <div><strong>Sospechosos</strong>{suspects.map((suspect) => <span key={suspect}>{suspect}</span>)}</div>
        <div><strong>Traiciones</strong>{betrayals.length ? betrayals.map((betrayal) => <span key={betrayal}>{betrayal}</span>) : <p>Nadie mostró aún el cuchillo.</p>}</div>
        <div><strong>Hilos</strong>{threads.length ? threads.map((thread) => <span key={thread}>{thread}</span>) : <p>Sin deudas narrativas todavía.</p>}</div>
        <div><strong>Último turno</strong><p>{latest ? `${latest.playerName}: ${latest.action}` : "La escena acaba de empezar."}</p></div>
      </div>
    </section>
  );
}


function AmbienceControl({ audioRef, audioUrl, ambienceName, mood, isPlaying, setPlaying, volume, setVolume }: { audioRef: RefObject<HTMLAudioElement | null>; audioUrl: string; ambienceName: string; mood: string; isPlaying: boolean; setPlaying: (playing: boolean) => void; volume: number; setVolume: (volume: number) => void }) {
  return (
    <section className="panel ambiencePanel">
      <audio ref={audioRef} src={audioUrl} onError={() => setPlaying(false)} />
      <button className="iconButton" onClick={() => setPlaying(!isPlaying)}>{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
      <div><strong>{ambienceName}</strong><span>{mood.slice(0, 140)}</span></div>
      <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
    </section>
  );
}

function ActionComposer(props: { room: GameRoom | null; activeType?: "human" | "bot"; busy: boolean; botTurnPaused: boolean; turnError: string | null; sceneChoices: SceneActionChoice[]; selectedChoice?: SceneActionChoice; selectedStat: StatKey; setSelectedStat: (stat: StatKey) => void; character: Character; usePet: boolean; setUsePet: (value: boolean) => void; runHuman: () => void; runBot: () => void; multiplayerBlock?: boolean }) {
  const allowedStats = Array.from(new Set(props.sceneChoices.flatMap((choice) => choice.recommendedStats)));
  const isBot = props.activeType === "bot";
  const willRollD4 = !isBot && props.selectedChoice ? shouldGrantCreativeBonus(props.selectedChoice.action, props.selectedStat, props.usePet) : false;
  const selectedEnergyCost = getActionEnergyCost(props.selectedChoice);
  const canPaySelectedAction = isBot || canPayActionEnergy(props.character.energy, props.selectedChoice);
  const blocked = props.multiplayerBlock && !isBot;
  return (
    <section className="panel actionComposer compactAction">
      <PanelTitle title="Tirada" icon={<Dices size={17} />} />
      {!props.room ? <p className="empty">Crea tu personaje e inicia solo para probar una sesión completa con bots.</p> : (
        <>
          {isBot && !blocked && <p className="empty">Turno bot: leé la escena y hacé clic para continuar.</p>}
          {blocked && <p className="empty">Turno de tu oponente — esperando su acción…</p>}
          <div className="actionCompactGrid">
            <div className="actionCompactText">
              <small>{isBot ? "Agente automático" : "Acción elegida"}</small>
              <strong>{isBot ? props.character.name : props.selectedChoice?.label ?? "Elegí una acción"}</strong>
              <span>{isBot ? "El motor elegirá acción, stat y bonus sin input humano." : props.selectedChoice?.action ?? "Seleccioná una opción de escena."}</span>
            </div>
            <label className="statSelectCompact">Stat<select value={props.selectedStat} onChange={(event) => props.setSelectedStat(event.target.value as StatKey)} disabled={isBot || props.busy || blocked}>{allowedStats.map((stat) => <option key={stat} value={stat}>{statLabels[stat]} +{props.character.stats[stat]}</option>)}</select></label>
            <label className="petToggle compactPet"><input type="checkbox" checked={!isBot && props.usePet} onChange={(event) => props.setUsePet(event.target.checked)} disabled={isBot || props.busy || blocked} /> Mascota d4</label>
            <button className="primaryButton" onClick={isBot ? props.runBot : props.runHuman} disabled={blocked || (!isBot && (props.busy || !canPaySelectedAction))}>{isBot ? <Bot size={18} /> : <Dices size={18} />}{props.busy ? "Narrando..." : blocked ? "Esperar turno" : isBot ? (props.botTurnPaused ? "Continuar bot" : "Avanzar bot") : !canPaySelectedAction ? "Sin energía" : "Tirar dados"}</button>
          </div>
          {props.turnError && <p className="turnError">{props.turnError}</p>}
        </>
      )}
    </section>
  );
}


function buildFinalRecap(room: GameRoom) {
  const ending = room.finalEnding;
  const resolved = room.endingResolution;
  const title = resolved?.title ?? ending?.title ?? "La soga aprende otro nombre";
  const decisiveClues = Array.from(new Set([...room.mysteryClues, ...room.memorySummary.clues, ...room.memorySummary.confirmedFacts])).slice(-4);
  const price = [
    ...(resolved?.losses ?? []),
    ...room.players.filter((player) => player.status === "dead").map((player) => `${player.name} cayó: ${player.deathCause ?? "pagó el precio de la escena"}.`)
  ];
  const npcDestiny = Array.from(new Set([
    ...room.memorySummary.npcStates.slice(-3),
    ...room.memorySummary.suspicions.slice(-2)
  ])).filter(Boolean);
  const rewards = resolved?.rewards ?? [];
  const marks = resolved?.persistentMarks?.length ? resolved.persistentMarks : room.memorySummary.forbiddenContradictions.slice(-2);
  const truth = room.memorySummary.currentTwist || room.memorySummary.confirmedFacts.slice(-1)[0] || ending?.description || "El miedo intentó escribir una versión cómoda antes de que la verdad tuviera voz.";
  const summary = decisiveClues.length
    ? `La escena no se cierra por bondad, sino por peso de pruebas: ${decisiveClues.join("; ")}.`
    : (resolved?.narration ?? ending?.description ?? "La mesa cierra la escena con las consecuencias acumuladas.");
  const sections = [
    `Título: ${title}`,
    `Resumen: ${dedupeSentence(summary)}`,
    `Verdad: ${dedupeSentence(truth)}`,
    `Precio: ${price.length ? price.join(" ") : "La victoria no queda limpia; la aldea conserva vergüenza y miedo."}`,
    `Destino de NPCs: ${npcDestiny.length ? npcDestiny.join(" ") : "Los testigos recuerdan quién habló, quién calló y quién sonrió tarde."}`,
    `Recompensa: ${rewards.length ? rewards.join("; ") : "La ruta queda marcada en la memoria del grupo."}`,
    `Marca persistente: ${marks.length ? marks.join("; ") : "Nadie podrá contar esta noche igual que antes."}`,
    "Última imagen: La campana queda muda bajo la lluvia. Nadie se atreve a tocarla."
  ];
  return sections.map(dedupeSentence).join("\n\n");
}

function dedupeSentence(text: string) {
  const seen = new Set<string>();
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      const key = sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

function FinalBanner({ room, onBackToCampaigns, onReplayRoute }: { room: GameRoom; onBackToCampaigns: () => void; onReplayRoute: () => void }) {
  const resolved = room.endingResolution;
  const rewards = resolved?.rewards ?? [];
  const losses = resolved?.losses ?? [];
  const marks = resolved?.persistentMarks ?? [];
  return (
    <section className="panel finalBanner">
      <PanelTitle title="Final alcanzado" icon={<Sparkles size={17} />} />
      <h2>{resolved?.title ?? room.finalEnding?.title ?? "Final de la quest"}</h2>
      <p>{room.finalRecap ?? buildFinalRecap(room)}</p>
      {resolved?.unlockedFutureHook && <p className="futureHook">{resolved.unlockedFutureHook}</p>}
      <div className="endingGrid">
        <div><strong>Recompensas</strong>{rewards.length ? rewards.map((item) => <span key={item}>{item}</span>) : <span>Ninguna recompensa limpia.</span>}</div>
        <div><strong>Pérdidas</strong>{losses.length ? losses.map((item) => <span key={item}>{item}</span>) : <span>Sin pérdida persistente registrada.</span>}</div>
        <div><strong>Marcas</strong>{marks.length ? marks.map((item) => <span key={item}>{item}</span>) : <span>La memoria de la ruta queda asentada.</span>}</div>
      </div>
      <div className="endingActions">
        <button className="ghostButton" onClick={onBackToCampaigns}>Volver a campañas</button>
        <button className="primaryButton" onClick={onReplayRoute}>Jugar otra ruta</button>
      </div>
    </section>
  );
}

type CinematicTurn = {
  event?: GameEvent;
  response?: NarrationResponse;
  legacyNarration: string;
  legacyDialogue: string[];
  legacyConsequence: string;
};

function getStructuredTurn(turn: CinematicTurn): DungeonNarrationOutput | undefined {
  return turn.response?.structuredNarration;
}

function getTurnNarration(turn: CinematicTurn) {
  return getStructuredTurn(turn)?.narration ?? turn.event?.narration ?? turn.response?.playerNarration ?? turn.response?.sections?.narration ?? turn.response?.narration ?? turn.legacyNarration;
}

function getTurnDialogue(turn: CinematicTurn) {
  const structured = getStructuredTurn(turn);
  if (structured?.dialogue?.length) return structured.dialogue.map((line) => ({ speaker: line.speakerName, line: line.line, intention: line.intention }));
  const legacy = turn.response?.npcDialogue ?? turn.legacyDialogue;
  return legacy.filter(Boolean).map((line) => {
    const [speaker, ...rest] = line.split(":");
    return rest.length ? { speaker: speaker.trim(), line: rest.join(":").trim(), intention: "reaccionar" } : { speaker: "Narrador", line, intention: "escena" };
  });
}

function getTurnConsequence(turn: CinematicTurn) {
  return getStructuredTurn(turn)?.consequence ?? {
    summary: turn.event?.consequenceText ?? turn.response?.consequenceText ?? turn.response?.sections?.consequence ?? turn.response?.consequence ?? turn.legacyConsequence
  };
}

function getTurnDangerChange(turn: CinematicTurn) {
  const structured = getStructuredTurn(turn)?.dangerChange;
  if (structured) return structured;
  return undefined;
}

function getTurnClueReveals(turn: CinematicTurn) {
  const structured = getStructuredTurn(turn)?.clueReveals;
  if (structured?.length) return structured;
  return (turn.event?.unlockedClues ?? []).map((clue) => ({ clueId: clue, title: clue, mode: "hint" as const, text: clue }));
}

function getTurnCompanionMoments(turn: CinematicTurn) {
  return getStructuredTurn(turn)?.companionMoments ?? [];
}

function getTurnRoll(turn: CinematicTurn) {
  const structured = getStructuredTurn(turn)?.rollPresentation;
  if (structured) return structured;
  const dice = turn.event?.dice;
  if (!dice && !turn.event) return undefined;
  const result = turn.event?.outcome === "partial_success" ? "partial" : turn.event?.outcome === "failure" ? "failure" : "success";
  const total = dice?.total ?? turn.event?.total ?? 0;
  const dc = dice?.difficulty ?? 0;
  return { total, dc, result, label: `${translateOutcome(turn.event?.outcome ?? result)}: ${total}${dc ? ` vs ${dc}` : ""}` };
}

function DungeonMasterPanel({ room, narration, latestTurnNarration, dice, botTurnPaused, onContinueBot, sections, plotBeat, dialogue, finalRecap, warnings }: { room: GameRoom; narration: string; latestTurnNarration?: NarrationResponse; dice: DiceSnapshot | null; botTurnPaused: boolean; onContinueBot: () => void; sections?: NarrationResponse["sections"]; plotBeat?: NarrationResponse["plotBeat"]; dialogue: string[]; finalRecap?: string; warnings: string[] }) {
  const shownNarration = sections?.narration ?? cleanSection(narration, "Narracion");
  const shownDialogue = sections?.dialogue ?? dialogue.join(" ");
  const shownConsequence = sections?.consequence ?? extractConsequence(narration);
  const hasTurnHistory = room.sessionLog.length > 0;
  const currentScene = getRoomScenes(room)[room.currentSceneIndex];
  const latestTurn: CinematicTurn = {
    event: room.sessionLog[0],
    response: latestTurnNarration,
    legacyNarration: shownNarration,
    legacyDialogue: dialogue,
    legacyConsequence: shownConsequence
  };
  return (
    <aside className="panel dmPanel">
      <PanelTitle title="Dungeon Master IA" icon={<Sparkles size={17} />} />
      {warnings.map((warning) => <div className="warning" key={warning}>{warning}</div>)}
      {hasTurnHistory
        ? <TurnStoryCard turn={latestTurn} sceneTitle={currentScene.title} dice={dice} />
        : <>
            {dice && <DiceOutcomeCard turn={latestTurn} dice={dice} />}
            <CurrentTurnPanel narration={shownNarration} dialogue={shownDialogue} consequence={shownConsequence} />
          </>}
      {botTurnPaused && <button className="primaryButton dmContinueButton" type="button" onClick={onContinueBot}>Continuar turno del bot</button>}
      <NarrativeHistory room={room} />
      <details className="dmMinorDetails" open><summary>Memoria / pistas</summary><MemoryPanel room={room} /></details>
      {finalRecap && <NarratorSection title="Recap" text={finalRecap} />}
    </aside>
  );
}

function TurnStoryCard({ turn, sceneTitle, dice }: { turn: CinematicTurn; sceneTitle: string; dice: DiceSnapshot | null }) {
  const narration = getTurnNarration(turn);
  const paragraphs = narration.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const dialogueLines = getTurnDialogue(turn);
  const clues = getTurnClueReveals(turn);
  const danger = getTurnDangerChange(turn);
  const dangerChanged = danger && danger.before !== danger.after;
  const actionLabel = getStructuredTurn(turn)?.immediateAction?.text ?? turn.event?.actionLabel ?? cleanActionText(turn.event?.action ?? "");
  return (
    <section className="turnStoryCard">
      {actionLabel && (
        <div className="turnActionChip">
          <small>{turn.event?.isBot ? "Bot" : "Vos"}</small>
          <span>{actionLabel}</span>
        </div>
      )}
      <DiceOutcomeCard turn={turn} dice={dice} />
      <div className="turnNarrationText cinematicNarration">
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
      {dialogueLines.length > 0 && (
        <div className="inlineDialogue">
          {dialogueLines.map((line, index) => (
            <p key={index}><strong>{line.speaker}:</strong> "{line.line.replace(/^[""]|[""]$/g, "")}"</p>
          ))}
        </div>
      )}
      {(clues.length > 0 || dangerChanged) && (
        <div className="turnChips">
          {dangerChanged && <span className="chipDanger">⚠ Peligro {danger.before}→{danger.after}</span>}
          {clues.map((clue) => <span key={clue.clueId} className="chipClue">🔍 {clue.title}</span>)}
        </div>
      )}
    </section>
  );
}

function DiceOutcomeCard({ turn, dice }: { turn: CinematicTurn; dice: DiceSnapshot | null }) {
  const roll = getTurnRoll(turn);
  if (!roll) return null;
  const eventDice = turn.event?.dice;
  const checkDice = dice?.check ?? eventDice;
  const d20 = dice?.check.d20.value ?? eventDice?.d20.value;
  const d4 = dice?.check.creativeBonus?.value ?? eventDice?.creativeBonus?.value;
  const d6 = dice?.consequenceRoll;
  const isCritical = Boolean(checkDice?.critical);
  const isFumble = Boolean(checkDice?.fumble);
  return (
    <div className={`diceOutcomeCard ${roll.result}${isCritical ? " critical" : ""}${isFumble ? " fumble" : ""}`}>
      <div className="diceOutcomeMain">
        <span>Resultado</span>
        <strong>{roll.label || `${roll.total} vs ${roll.dc}`}</strong>
      </div>
      {(isCritical || isFumble) && (
        <div className={`diceOutcomeBadge ${isCritical ? "critical" : "fumble"}`}>
          {isCritical ? "★ ¡Crítico!" : "✖ ¡Pifia!"}
        </div>
      )}
      <div className="dmMiniDice" aria-label="Dados del turno">
        <MiniDiceFace kind="d20" label="d20" value={d20 ?? "—"} />
        <MiniDiceFace kind="d4" label="d4" value={d4 ?? "—"} />
        <MiniDiceFace kind="d6" label="d6" value={d6 ?? "—"} />
      </div>
    </div>
  );
}


function MiniDiceFace({ kind, label, value }: { kind: "d20" | "d4" | "d6"; label: string; value: number | string }) {
  return (
    <span className={`miniDiceFace ${kind}`}>
      <span className="miniDiceImageWrap">
        <img src={`/assets/dice/${kind}.webp`} alt="" aria-hidden="true" />
        <strong>{value}</strong>
      </span>
      <small>{label}</small>
    </span>
  );
}

function DialogueStrip({ turn }: { turn: CinematicTurn }) {
  const lines = getTurnDialogue(turn);
  if (!lines.length) return null;
  return (
    <div className="dialogueStrip">
      <small>Diálogo</small>
      {lines.slice(0, 3).map((line, index) => <blockquote key={`${line.speaker}-${index}`}><strong>{line.speaker}:</strong> “{line.line.replace(/^["“]|["”]$/g, "")}”</blockquote>)}
    </div>
  );
}

function CompanionMomentCard({ turn }: { turn: CinematicTurn }) {
  const moments = getTurnCompanionMoments(turn);
  if (!moments.length) return null;
  return (
    <div className="companionMomentCard">
      <small>Compañeros</small>
      {moments.map((moment) => <p key={moment.characterId}><strong>{moment.characterName}</strong> {moment.action}</p>)}
    </div>
  );
}

function ConsequenceCard({ turn }: { turn: CinematicTurn }) {
  const consequence = getTurnConsequence(turn);
  if (!consequence.summary) return null;
  return (
    <div className="consequenceCard">
      <small>Cambio en el mundo</small>
      <p>{consequence.summary}</p>
      {(consequence.physicalChange || consequence.socialChange || consequence.emotionalChange) && (
        <div className="consequenceDetails">
          {consequence.physicalChange && <span>{consequence.physicalChange}</span>}
          {consequence.socialChange && <span>{consequence.socialChange}</span>}
          {consequence.emotionalChange && <span>{consequence.emotionalChange}</span>}
        </div>
      )}
    </div>
  );
}

function DangerChangeCard({ turn }: { turn: CinematicTurn }) {
  const danger = getTurnDangerChange(turn);
  if (!danger) return null;
  return (
    <div className="dangerChangeCard">
      <small>Peligro</small>
      <strong>{danger.before} → {danger.after}</strong>
      <p>{danger.manifestation}</p>
    </div>
  );
}

function ClueRevealCard({ turn }: { turn: CinematicTurn }) {
  const clues = getTurnClueReveals(turn);
  if (!clues.length) return null;
  return (
    <div className="clueRevealCard">
      <small>Pistas</small>
      <div>{clues.map((clue) => <span key={clue.clueId}>{clue.title} — {clue.mode}</span>)}</div>
    </div>
  );
}

function TurnHistoryCollapsed({ room }: { room: GameRoom }) {
  return (
    <details className="turnHistoryCollapsed">
      <summary>Historial completo</summary>
      <div className="collapsedTurnList">
        {room.sessionLog.map((event) => (
          <article key={event.id}>
            <strong>Turno {event.turnNumber ?? event.turn + 1} · {event.playerName}</strong>
            <span>{event.actionLabel ?? cleanActionText(event.action)} · {translateOutcome(event.outcome)} ({event.total})</span>
            <p>{event.consequenceText ?? event.narration}</p>
          </article>
        ))}
      </div>
    </details>
  );
}

function OptionsPanel({ options }: { options: string[] }) {
  return (
    <div className="plotBeatPanel">
      <h3>Opciones disponibles</h3>
      {options.slice(0, 3).map((option) => <span key={option}>{option}</span>)}
    </div>
  );
}

function MemoryPanel({ room }: { room: GameRoom }) {
  const facts = room.memorySummary.confirmedFacts.length ? room.memorySummary.confirmedFacts : room.memorySummary.facts;
  return (
    <div className="plotBeatPanel">
      <h3>Memoria / pistas</h3>
      <span><strong>Hechos</strong> {facts.slice(-3).join(" · ") || "Todavía no hay hechos confirmados nuevos."}</span>
      <span><strong>Pistas</strong> {room.mysteryClues.slice(-3).join(" · ") || "Sin pistas visibles."}</span>
      <span><strong>No contradecir</strong> {room.memorySummary.forbiddenContradictions.slice(-2).join(" · ") || "Sin bloqueos nuevos."}</span>
    </div>
  );
}

function NarrativeHistory({ room }: { room: GameRoom }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const humanPlayer = room.players.find((player) => player.type === "human") ?? room.players[0];
  const allEvents = useMemo(() => [...room.sessionLog], [room.sessionLog]);
  const visibleEvents = useMemo(
    () => onlyMine ? allEvents.filter((event) => event.playerName === humanPlayer.name) : allEvents,
    [allEvents, onlyMine, humanPlayer.name]
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [room.sessionLog.length]);

  return (
    <div className="narrativeHistory">
      <div className="historyHeader">
        <h3>Historial narrativo</h3>
        <label><input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} /> Solo {humanPlayer.name}</label>
      </div>
      <div className="historyTurnList" ref={scrollRef}>
        {visibleEvents.length === 0 && <p className="historyEmpty">Todavía no hay turnos{onlyMine ? ` de ${humanPlayer.name}` : ""}.</p>}
        {visibleEvents.map((event) => {
          const campaignScene = room.campaign.scenes.find((s) => s.id === event.sceneId);
          const actionOption = campaignScene?.multipleChoiceOptions.find((o) => o.id === event.actionId);
          const energyCost = getActionEnergyCost(actionOption);
          return (
            <article key={event.id} className={`historyTurnEntry ${event.isBot ? "historyBot" : "historyHuman"}`}>
              <div className="historyTurnMeta">
                <span className={`historyBadge ${event.isBot ? "bot" : "human"}`}>{event.isBot ? "BOT" : "VOS"}</span>
                <span className="historyTurnLabel">T{event.turnNumber ?? event.turn + 1}</span>
                <span className="historySceneName">{event.sceneTitle}</span>
                <span className={`historyOutcomePill ${event.outcome}`}>{translateOutcome(event.outcome)}</span>
              </div>
              <div className="historyChoiceLine">
                <span>{event.actionLabel ?? cleanActionText(event.action)}</span>
                {energyCost > 0 && <span className="historyCost"><Zap size={10} /> {energyCost}</span>}
              </div>
              <p className="historyNarration">{event.narration}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function HelpButton({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  return (
    <>
      <button className="helpButton" type="button" onClick={() => setOpen(true)} aria-label="Ayuda de Tiny Quest" title="Ayuda">
        <HelpCircle size={18} />
      </button>
      {open && (
        <div className="helpOverlay" role="dialog" aria-modal="true" aria-label="Manual de Tiny Quest">
          <section className="helpPanel">
            <button className="helpClose" type="button" onClick={() => setOpen(false)} aria-label="Cerrar ayuda"><X size={16} /></button>
            <h2>Cómo jugar</h2>
            <p>En Tiny Quest cada campaña dura hasta 15 minutos y tiene 3 escenas. En tu turno elegís una acción, un stat y opcionalmente tu mascota.</p>
            <ul>
              <li><strong>d20</strong>: dado principal. Se suma al modificador del stat elegido para obtener el total. Si el total supera la dificultad (DC) es éxito; si queda 1-2 puntos abajo es éxito parcial; más abajo es fallo.</li>
              <li><strong>d4 — cómo usarlo</strong>: tildá "Mascota d4" antes de tirar para sumar un d4 al resultado. También se activa automáticamente si el stat elegido es Creatividad. Úsalo cuando la acción está en el límite entre éxito y fallo.</li>
              <li><strong>d6 — coste de complicación</strong>: se tira automáticamente en fallos y éxitos parciales. No lo controlás vos — el motor lo lanza para determinar qué tan grave es la consecuencia: daño, pista perdida, subida de peligro o deuda narrativa. Un d6 alto significa que la complicación es seria.</li>
              <li><strong>Fórmula</strong>: d20 + stat + d4 (opcional) = total vs DC.</li>
              <li><strong>Peligro</strong>: sube con fallos y acciones arriesgadas. Si llega a 10 la escena se cierra o se complica gravemente.</li>
              <li><strong>Pistas</strong>: desbloquean rutas y opciones nuevas. Investigan antes de confrontar.</li>
            </ul>
            <p>El Dungeon Master narra lo que ocurre pero no cambia el resultado del dado — pistas, daños, finales y peligro los decide el motor.</p>
          </section>
        </div>
      )}
    </>
  );
}

function CurrentTurnPanel({ narration, dialogue, consequence }: { narration: string; dialogue: string; consequence: string }) {
  const paragraphs = narration.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  return (
    <div className="currentTurnPanel">
      <h3>Turno actual</h3>
      <div className="turnNarrationText">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      <span>{dialogue}</span>
      <strong>{consequence}</strong>
    </div>
  );
}


function PlotBeatPanel({ beat }: { beat: NonNullable<NarrationResponse["plotBeat"]> }) {
  return (
    <div className="plotBeatPanel">
      <h3>{beat.title}</h3>
      <p>{beat.hook}</p>
      <span><strong>Giro</strong> {beat.twist}</span>
      <span><strong>Amenaza</strong> {beat.threat}</span>
    </div>
  );
}

function NarratorSection({ title, text }: { title: string; text: string }) {
  const kind = title.toLowerCase().replaceAll(" ", "-").replace(":", "");
  return <div className={`narratorBlock narrator-${kind}`}><h3>{title}</h3><p>{text}</p></div>;
}

function extractConsequence(text: string) {
  const marker = "Consecuencia:";
  const index = text.indexOf(marker);
  if (index < 0) return "Sin consecuencia grave por ahora.";
  return text.slice(index + marker.length).split("Opciones:")[0].trim();
}

function cleanSection(text: string, section: string) {
  const marker = `${section}:`;
  const index = text.indexOf(marker);
  if (index < 0) return text;
  const rest = text.slice(index + marker.length);
  return rest.split("Diálogo:")[0].split("Consecuencia:")[0].split("Opciones:")[0].trim();
}

function DiceResultBar({ dice, activePlayerId }: { dice: DiceSnapshot | null; activePlayerId?: string }) {
  const isPreviousTurn = Boolean(dice && activePlayerId && dice.playerId !== activePlayerId);

  if (!dice) {
    return (
      <section className="panel diceBar diceBarEmpty">
        <PanelTitle title="Resolución" icon={<Dices size={17} />} />
        <p className="diceBarHint">Elegí una acción y tirá dados.</p>
      </section>
    );
  }

  const d20 = dice.check.d20.value;
  const d4val = dice.check.creativeBonus?.value ?? null;
  const d6val = dice.consequenceRoll ?? null;
  const breakdown = dice.check.rollBreakdown;
  const formula = `${breakdown.d20} d20 +${breakdown.statModifier} ${statLabels[dice.stat]} +${breakdown.d4Bonus} d4 = ${breakdown.total} vs ${dice.check.difficulty}`;

  return (
    <section className="panel diceBar">
      <PanelTitle title={isPreviousTurn ? "Última resolución" : "Resolución actual"} icon={<Dices size={17} />} />
      <div className="diceBarInner">
        <div className="diceBarLeft">
          <strong>{dice.player}{isPreviousTurn ? " · anterior" : ""}</strong>
          <span className={`statChip stat-${dice.stat}`}>{statLabels[dice.stat]}</span>
        </div>
        <div className="diceBarFaces">
          <DiceBadge kind="d20" value={d20} />
          <DiceBadge kind="d4" value={d4val ?? "—"} muted={!d4val} />
          <DiceBadge kind="d6" value={d6val ?? "—"} muted={!d6val} />
        </div>
        <div className="diceBarStatBonus">
          <small>{statLabels[dice.stat]}</small>
          <strong>+{breakdown.statModifier}</strong>
        </div>
        <div className="diceBarTotal">
          <strong>{dice.check.total}</strong>
          <small>vs {dice.check.difficulty}</small>
        </div>
        <div className={`diceBarOutcome ${dice.check.outcome}`}>
          {translateOutcome(dice.check.outcome)}
        </div>
      </div>
      <div className="diceBarFormula">
        <small>{dice.action}</small>
        <code>{formula}{dice.combatNote ? ` · ${dice.combatNote}` : dice.consequence ? ` · coste d6: ${dice.consequence}` : ""}</code>
      </div>
    </section>
  );
}

function DiceBadge({ kind, value, muted = false }: { kind: "d20" | "d4" | "d6"; value: number | string; muted?: boolean }) {
  return (
    <span className={`diceBadge ${kind} ${muted ? "muted" : ""}`}>
      <span className="diceBadgeWrap">
        <img src={`/assets/dice/${kind}.webp`} alt="" aria-hidden="true" />
        <strong>{value}</strong>
      </span>
      <small>{kind}</small>
    </span>
  );
}

function CharacterDesigner({ draft, setDraft, disabled }: { draft: Character; setDraft: (character: Character) => void; disabled: boolean }) {
  const spentPoints = totalExtraPoints(draft.stats);
  const remainingPoints = 8 - spentPoints;
  const selectedSpecies = species.find((item) => item.name === draft.species) ?? species[0];
  const selectedRole = roles.find((item) => item.name === draft.role) ?? roles[0];
  const selectedPet = legendaryPets.find((pet) => pet.id === draft.pet.id) ?? legendaryPets[0];
  const [selectedTalent, setSelectedTalent] = useState<string>(characterTalentAssets[0].id);
  function updateStats(stat: StatKey, delta: number) {
    if (delta > 0 && (remainingPoints <= 0 || draft.stats[stat] >= 4)) return;
    if (delta < 0 && draft.stats[stat] <= 1) return;
    setDraft(createCharacter({ ...draft, stats: { ...draft.stats, [stat]: draft.stats[stat] + delta } }));
  }
  return (
    <section className="panel designer">
      <PanelTitle title="Personaje" icon={<Wand2 size={17} />} />
      <div className="pointsBar"><strong>{remainingPoints}</strong><span>puntos disponibles</span><em>{spentPoints}/8 usados · max. 4</em></div>
      <div className="designerFields">
        <label>Nombre<input value={draft.name} onChange={(event) => setDraft(createCharacter({ ...draft, name: event.target.value }))} disabled={disabled} /></label>
        <label>Linaje<select value={draft.species} onChange={(event) => setDraft(createCharacter({ ...draft, species: event.target.value }))} disabled={disabled}>{species.map((item) => <option key={item.id}>{item.name}</option>)}</select></label>
        <label>Oficio<select value={draft.role} onChange={(event) => setDraft(createCharacter({ ...draft, role: event.target.value }))} disabled={disabled}>{roles.map((item) => <option key={item.id}>{item.name}</option>)}</select></label>
        <label>Mascota<select value={draft.pet.id} onChange={(event) => setDraft(createCharacter({ ...draft, pet: legendaryPets.find((pet) => pet.id === event.target.value) }))} disabled={disabled}>{legendaryPets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label>
      </div>
      <div className="avatarPicker">{avatarOptions.map((avatar) => <button className={draft.avatarUrl === avatar ? "selected" : ""} key={avatar} type="button" onClick={() => setDraft(createCharacter({ ...draft, avatarUrl: avatar }))} disabled={disabled}><img src={avatar} alt="Avatar" /></button>)}</div>
      <div className="characterLore">
        <span>{selectedSpecies.description}</span>
        <span>{selectedRole.description}</span>
        <span>{selectedPet.description}</span>
      </div>
      <label>Concepto<input value={draft.concept} onChange={(event) => setDraft(createCharacter({ ...draft, concept: event.target.value }))} disabled={disabled} /></label>
      <div className="statBarsPanel">
        {(Object.keys(statLabels) as StatKey[]).map((stat) => (
          <div className="statBarRow" key={stat}>
            <img src={characterStatAssets[stat]} alt="" aria-hidden="true" />
            <span>{statLabels[stat]}</span>
            <strong>{draft.stats[stat]}</strong>
            <button className="statArrow" onClick={() => updateStats(stat, -1)} disabled={disabled || draft.stats[stat] <= 1} aria-label={`Bajar ${statLabels[stat]}`}>‹</button>
            <div className="statSegments" aria-label={`${statLabels[stat]} ${draft.stats[stat]}`}>
              {Array.from({ length: 4 }).map((_, index) => <i className={index < draft.stats[stat] ? "filled" : ""} key={index} />)}
            </div>
            <button className="statArrow" onClick={() => updateStats(stat, 1)} disabled={disabled || remainingPoints <= 0 || draft.stats[stat] >= 4} aria-label={`Subir ${statLabels[stat]}`}>›</button>
          </div>
        ))}
        <div className="talentPicker">
          <h3>Talentos</h3>
          <div>
            {characterTalentAssets.map((talent) => (
              <button className={selectedTalent === talent.id ? "selected" : ""} type="button" key={talent.id} onClick={() => setSelectedTalent(talent.id)} disabled={disabled} title={talent.name}>
                <img src={talent.url} alt={talent.name} />
              </button>
            ))}
            <button className="lockedTalent" type="button" disabled aria-label="Talento bloqueado">⌕</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function AbilityProgressionPanel({ character }: { character: Character }) {
  const ability = character.abilityProgression;
  return <section className="panel progression"><PanelTitle title="Progresión" icon={<Zap size={17} />} /><h3>{ability.name}</h3><p><strong>Actual:</strong> {ability.currentSkill}</p><p><strong>Siguiente:</strong> {ability.nextUpgrade}</p><p><strong>Escalado:</strong> {ability.scaling}</p><p><strong>Desbloqueo:</strong> {ability.unlockCondition}</p><div className="dangerMeter"><span style={{ width: `${(ability.progress / ability.progressTarget) * 100}%` }} /></div></section>;
}

function SetupPanel({ startSolo, roomStarted }: { startSolo: () => void; roomStarted: boolean }) {
  return <section className="panel setupPanel"><PanelTitle title="Modo local" icon={<Play size={17} />} /><button className="soloButton" onClick={startSolo} disabled={roomStarted}><Play size={18} /> Iniciar solo</button><p>Master IA con Groq. Imagenes y audio usan assets locales livianos.</p></section>;
}

function PanelTitle({ title, icon }: { title: string; icon: ReactNode }) {
  return <div className="panelTitle">{icon}<span>{title}</span></div>;
}

function translateOutcome(outcome: string) {
  if (outcome === "success") return "éxito";
  if (outcome === "partial_success") return "éxito parcial";
  return "fallo";
}

// ─── Multiplayer components ───────────────────────────────────────────────────

function MultiplayerLobbyScreen({ mode, mpState, joinCodeInput, setJoinCodeInput, onConfirmJoin, onCancel }: {
  mode: "host" | "guest";
  mpState: MultiplayerState;
  joinCodeInput: string;
  setJoinCodeInput: (v: string) => void;
  onConfirmJoin: () => void;
  onCancel: () => void;
}) {
  const isConnecting = mpState.phase === "connecting";
  const roomCode = mpState.roomCode;
  const error = mpState.errorMessage;

  return (
    <main className="appShell lobbyShell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh" }}>
      <section className="panel" style={{ maxWidth: 480, width: "100%", textAlign: "center", padding: "36px 32px" }}>
        <div style={{ marginBottom: 24 }}>
          <Users size={40} style={{ color: "#ffd77b", marginBottom: 12 }} />
          {mode === "host" ? (
            <>
              <h2 style={{ fontSize: 22, marginBottom: 8 }}>Sala creada</h2>
              {isConnecting || !roomCode ? (
                <p style={{ color: "#aaa" }}>Conectando al servidor…</p>
              ) : (
                <>
                  <p style={{ color: "#ccc", marginBottom: 16 }}>Compartí este código con tu oponente:</p>
                  <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: "0.15em", color: "#ffd77b", background: "rgba(255,215,123,0.08)", borderRadius: 12, padding: "16px 24px", marginBottom: 20 }}>
                    {roomCode}
                  </div>
                  <p style={{ color: "#888", fontSize: 13 }}>Esperando que se una tu oponente…</p>
                </>
              )}
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 22, marginBottom: 8 }}>Unirse a sala</h2>
              <p style={{ color: "#ccc", marginBottom: 20 }}>Ingresá el código de 6 caracteres que te compartió el anfitrión:</p>
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") onConfirmJoin(); }}
                maxLength={8}
                placeholder="XXXXXX"
                disabled={isConnecting}
                style={{ fontSize: 32, fontWeight: 900, letterSpacing: "0.2em", textAlign: "center", width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,215,123,0.35)", borderRadius: 10, padding: "14px 16px", color: "#ffd77b", marginBottom: 16, outline: "none" }}
              />
              <button
                className="soloButton"
                style={{ width: "100%", marginBottom: 10 }}
                onClick={onConfirmJoin}
                disabled={isConnecting || joinCodeInput.trim().length < 4}
              >
                {isConnecting ? "Conectando…" : "Unirse"}
              </button>
            </>
          )}
          {error && <p style={{ color: "#ff6b6b", marginTop: 12, fontSize: 13 }}>{error}</p>}
        </div>
        <button className="ghostButton" style={{ width: "100%" }} onClick={onCancel}>
          <X size={14} style={{ marginRight: 6 }} />Cancelar
        </button>
      </section>
    </main>
  );
}

function MultiplayerStatusBar({ mpState, onLeave }: { mpState: MultiplayerState; onLeave: () => void }) {
  const phaseLabel: Record<MultiplayerState["phase"], string> = {
    idle: "", connecting: "Conectando…", lobby_host: "Lobby", lobby_guest: "Lobby",
    waiting_guest: "Esperando oponente…", active: "Tu turno",
    watching: `Turno de ${mpState.opponentName ?? "oponente"}…`,
    narrating: "Narrando…", opponent_gone: "Oponente desconectado", ended: "Partida terminada"
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 16px", background: "rgba(255,215,123,0.08)", borderBottom: "1px solid rgba(255,215,123,0.2)", fontSize: 13 }}>
      <Users size={14} style={{ color: "#ffd77b", flexShrink: 0 }} />
      <span style={{ color: "#ffd77b", fontWeight: 700 }}>Multijugador</span>
      {mpState.roomCode && <span style={{ color: "#aaa" }}>Sala: <strong style={{ color: "#fff" }}>{mpState.roomCode}</strong></span>}
      <span style={{ color: mpState.yourTurn ? "#7fff90" : "#aaa", flexGrow: 1 }}>{phaseLabel[mpState.phase]}</span>
      <button onClick={onLeave} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>Salir</button>
    </div>
  );
}
