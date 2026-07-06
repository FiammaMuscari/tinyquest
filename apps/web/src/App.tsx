import { type CSSProperties, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Brain, Dices, Heart, HelpCircle, Pause, Play, Sparkles, Users, Wand2, X, Zap } from "lucide-react";
import { multiplayerClient, type MultiplayerState } from "./multiplayer/ws-client";
import { createDungeonMasterProvider } from "@tiny-quest/ai-master";
import { createImageProvider, createSoundProvider, readAtmosphereEnv } from "@tiny-quest/atmosphere";
import { characterStatAssets, characterTalentAssets } from "./character-assets";
import { characterPortraitUrl, fullBodyPortraitUrl, isGeneratedPortraitUrl, loadPortrait, medallionDataUri, nameHash, petPortraitUrl, useGeneratedPortrait, worldCardImageUrl } from "./portraits";
import { campaignCardImage } from "./campaign-assets";
import {
  applyNarration,
  buildImprovisedCampaign,
  campaignById,
  campaigns,
  defaultWorldId,
  perspectiveEntryLine,
  getQuestTemper,
  applyQuestTemper,
  worldById,
  worldEras,
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
  type CharacterLook,
  type BotPlayer,
  type Character,
  type CheckResult,
  type DungeonNarrationOutput,
  type GameEvent,
  type GameRoom,
  type NarrationResponse,
  type Scene,
  type SceneActionChoice,
  type StatKey,
  type StoryPerspective,
  type WorldEra
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
const worldStorageKey = "tiny-quest:selected-world";
const perspectiveStorageKey = "tiny-quest:perspective";
const partyStorageKey = "tiny-quest:party-mode";
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
  if (clean.includes("calmar") || clean.includes("misericordia") || clean.includes("hablar") || clean.includes("interrogar") || clean.includes("presionar") || clean.includes("confrontar") || clean.includes("declarar") || clean.includes("negociar") || clean.includes("postura") || clean.includes("convencer") || clean.includes("testigo") || clean.includes("ayuda") || clean.includes("duda") || clean.includes("voto") || clean.includes("votar")) return "social";
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
  // Variantes seeded por la acción: el mismo detalle genérico no puede repetirse
  // palabra por palabra turno tras turno.
  const genericSeed = action.length + sceneTitle.length;
  const pickGeneric = (variants: string[]) => variants[genericSeed % variants.length];
  return {
    object: pickGeneric([
      "un objeto que alguien intento apartar de la vista",
      "una pertenencia dejada atras con demasiado apuro",
      "un bulto tapado a medias, como si sobrara tiempo para esconderlo mejor"
    ]),
    sign: pickGeneric([
      "una marca fisica que contradice la version publica",
      "un corte reciente donde nadie deberia haber tocado",
      "una mancha que alguien intento limpiar y solo corrio"
    ]),
    witness: pickGeneric([
      "un testigo cambia de postura antes de mentir",
      "alguien evita mirar el mismo punto dos veces",
      "una voz baja se corta apenas el grupo se acerca"
    ]),
    path: pickGeneric([
      "una ruta estrecha abierta con coste",
      "un paso lateral que nadie vigila del todo",
      "una salida usada hace poco, todavia tibia de pisadas"
    ]),
    placeDetail: pickGeneric([
      "el lugar conserva una senal que puede tocarse",
      "el aire guarda un olor que no pertenece a la escena",
      "algo quedo movido de su sitio y nadie lo admite"
    ]),
    damage: pickGeneric(["el polvo se corre", "la marca se borronea", "el rastro pierde nitidez"])
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
      narration: `La noche todavía no termina de caer cuando el grupo cruza la entrada de ${sceneTitle}. ${premise}\n\nAdentro, ${npc} mide a los recién llegados sin acercarse, con algo guardado detrás de los dientes. El nombre de ${enemy} se dice en voz baja, como si nombrarlo pudiera apurar lo que viene. Cada minuto que pasa endurece la versión que alguien ya escribió.`,
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
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  // Retrato del héroe generado automáticamente: mientras no fijes un retrato clásico
  // del picker, la cara se imagina (y re-imagina, con debounce) según nombre +
  // linaje + oficio + concepto. Elegir un retrato clásico corta la auto-generación;
  // "Reimaginar" en la forja la vuelve a encender.
  const manualAvatarRef = useRef(false);
  useEffect(() => {
    const current = draftRef.current.avatarUrl;
    if (current.startsWith("/assets/") && current !== avatarOptions[0]) manualAvatarRef.current = true;
    if (manualAvatarRef.current) return;
    // La primera selección (género/piel/ojos) es obligatoria: sin ella no se forja imagen.
    if (!lookComplete(draftRef.current)) return;
    const timer = setTimeout(() => {
      const urls = heroImageUrls(draftRef.current);
      const shot = draftRef.current.look?.avatarShot ?? "face";
      const nextUrl = urls[shot];
      const currentUrl = draftRef.current.avatarUrl;
      // Misma identidad con otra seed = retrato reimaginado a propósito: se respeta.
      const sameIdentity = isGeneratedPortraitUrl(currentUrl) && currentUrl.replace(/seed=\d+$/, "") === nextUrl.replace(/seed=\d+$/, "");
      if (!sameIdentity && currentUrl !== nextUrl) {
        // Se piden las DOS imágenes (frente y cuerpo entero) para poder alternar al instante.
        void loadPortrait(urls.face, { priority: true }).catch(() => undefined);
        void loadPortrait(urls.fullbody, { priority: true }).catch(() => undefined);
        setDraft(createCharacter({ ...draftRef.current, avatarUrl: nextUrl }));
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [draft.name, draft.species, draft.role, draft.concept, draft.look?.gender, draft.look?.skinTone, draft.look?.eyeColor]);
  function reimagineHeroPortrait(seedNonce: number) {
    if (!lookComplete(draftRef.current)) return;
    manualAvatarRef.current = false;
    const urls = heroImageUrls(draftRef.current, seedNonce);
    void loadPortrait(urls.face, { priority: true }).catch(() => undefined);
    void loadPortrait(urls.fullbody, { priority: true }).catch(() => undefined);
    const shot = draftRef.current.look?.avatarShot ?? "face";
    setDraft(createCharacter({ ...draftRef.current, avatarUrl: urls[shot] }));
  }
  // Elegir un rasgo del retrato implica querer el retrato generado: sale del modo
  // manual (retrato clásico fijo) para que el efecto auto-regenere con el rasgo.
  function unlockAutoPortrait() {
    manualAvatarRef.current = false;
  }
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => readStoredCampaignId());
  // Historia improvisada: campaña generada por el LLM en runtime; no vive en el registro estático.
  const [improvisedCampaign, setImprovisedCampaign] = useState<Campaign | null>(null);
  const [forgingStory, setForgingStory] = useState(false);
  const [forgeError, setForgeError] = useState<string | null>(null);
  // Mundo sellado + perspectiva: el jugador elige ambiente y punto de entrada; el resto se descubre jugando.
  const [selectedWorldId, setSelectedWorldId] = useState(() => localStorage.getItem(worldStorageKey) ?? defaultWorldId);
  const [perspective, setPerspective] = useState<StoryPerspective>(() => (localStorage.getItem(perspectiveStorageKey) === "interior" ? "interior" : "exterior"));
  const [improvisedWorldId, setImprovisedWorldId] = useState<string | null>(null);
  // "alone" = recorrido en solitario (sin bots): cada turno es del jugador.
  const [partyMode, setPartyMode] = useState<"alone" | "companions">(() => (localStorage.getItem(partyStorageKey) === "companions" ? "companions" : "alone"));
  const selectedWorld = worldById(selectedWorldId);
  const selectedCampaign = improvisedCampaign && improvisedCampaign.id === selectedCampaignId ? improvisedCampaign : campaignById(selectedCampaignId);
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
  // Invalidates a pending LLM opening if a turn resolves before it arrives.
  const openingTokenRef = useRef(0);
  // Columnas del juego redimensionables por el usuario (px persistidos; null = default responsive).
  const [gameCols, setGameCols] = useState<{ left: number | null; right: number | null }>(() => ({
    left: Number(localStorage.getItem("tiny-quest:col-left")) || null,
    right: Number(localStorage.getItem("tiny-quest:col-right")) || null
  }));
  const gameColsRef = useRef(gameCols);
  useEffect(() => { gameColsRef.current = gameCols; }, [gameCols]);
  const gameFrameRef = useRef<HTMLElement | null>(null);
  // Recorrido: banner de capítulo al cambiar de escena + toast al descubrir pista.
  const [chapterBanner, setChapterBanner] = useState<{ number: number; title: string; law?: string } | null>(null);
  const lastSceneIndexRef = useRef(0);
  const [clueToast, setClueToast] = useState<string | null>(null);
  const prevClueCountRef = useRef(0);
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

  // Precalienta los retratos del elenco apenas arranca la partida: cuando el modal
  // "Personajes" se abra, ya están pintados o en camino. El styleHint debe ser
  // idéntico al que usa CastPanel (misma URL = misma entrada de caché).
  useEffect(() => {
    if (!room) return;
    const styleHint = `${selectedWorld.era}, ${normalizeUiText(room.campaign.genre)}`;
    for (const npc of room.campaign.npcs) {
      loadPortrait(npc.portraitUrl ?? characterPortraitUrl(npc.name, npc.appearance ?? npc.description, styleHint)).catch(() => undefined);
    }
  }, [room?.selectedCampaignId]);

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

  // Capítulo nuevo: banner dramático + una ley del mundo grabada al cruzar de escena.
  useEffect(() => {
    if (!room) { lastSceneIndexRef.current = 0; setChapterBanner(null); return; }
    if (room.currentSceneIndex > lastSceneIndexRef.current) {
      const index = room.currentSceneIndex;
      lastSceneIndexRef.current = index;
      setChapterBanner({ number: index + 1, title: sceneList[index]?.title ?? "", law: selectedWorld.worldRules[index - 1] });
      const timer = window.setTimeout(() => setChapterBanner(null), 8000);
      return () => window.clearTimeout(timer);
    }
    if (room.currentSceneIndex < lastSceneIndexRef.current) lastSceneIndexRef.current = room.currentSceneIndex;
  }, [room?.currentSceneIndex, room?.id]);

  // Pista nueva descubierta: aviso brillante, sin spoilear nada más.
  useEffect(() => { prevClueCountRef.current = room?.mysteryClues.length ?? 0; }, [room?.id]);
  useEffect(() => {
    if (!room) return;
    const count = room.mysteryClues.length;
    if (count > prevClueCountRef.current && room.sessionLog.length > 0) {
      setClueToast(room.mysteryClues[count - 1]);
      prevClueCountRef.current = count;
      const timer = window.setTimeout(() => setClueToast(null), 7000);
      return () => window.clearTimeout(timer);
    }
    prevClueCountRef.current = count;
  }, [room?.mysteryClues.length, room?.id]);

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

  // Un solo click: si el mundo elegido todavía no tiene historia (o la forja previa
  // falló), forja y ARRANCA apenas termina — sin pedir un segundo click.
  async function startSolo() {
    if (forgingStory) return;
    let campaignToPlay = selectedCampaign;
    if (!selectedWorld.authoredCampaignId && (improvisedWorldId !== selectedWorld.id || !improvisedCampaign)) {
      const forged = await forgeStory("", selectedWorld);
      if (!forged) return; // el error + Reintentar quedan visibles en la Forja
      campaignToPlay = forged;
    }
    launchSolo(campaignToPlay);
  }

  function launchSolo(campaignToPlay: Campaign) {
    narrativeIndexRef.current = new NarrativeMemoryIndex({
      embeddingProvider: new MockEmbeddingProvider(),
      store: new InMemoryVectorStore()
    });
    // El temple de la quest: copia del héroe con +1/−1 según lo que exige ESTA historia.
    const nextRoom = createSoloRoom(applyQuestTemper(draft, campaignToPlay), campaignToPlay, partyMode === "companions" ? 2 : 0);
    setRoom(nextRoom);
    const firstScene = getRoomScenes(nextRoom).find((candidate) => candidate.id === nextRoom.initialSceneId) ?? getRoomScenes(nextRoom)[0];
    setSelectedActionDraftId(firstScene.actionChoices[0].id);
    setSelectedStat(firstScene.actionChoices[0].recommendedStats[0]);
    setNpcDialogue([`${campaignToPlay.npcs[0].name}: Si quieres la verdad, tendrás que pagar con algo más que dados.`]);
    setDmSections(undefined);
    setPlotBeat(undefined);
    setLatestTurnNarration(undefined);
    const opening = buildOpeningBeat(campaignToPlay, firstScene.title, firstScene.objective);
    setCurrentNarration(opening.sections.narration);
    setNpcDialogue([opening.sections.dialogue]);
    setNextOptions(opening.sections.options);
    setDmSections(opening.sections);
    setPlotBeat(opening.plotBeat);
    requestLlmOpening(nextRoom, firstScene, campaignToPlay);
  }

  // La apertura estática se muestra al instante; el LLM la reemplaza con la escena
  // narrada de verdad apenas responde (si un turno se resuelve antes, se descarta).
  // La campaña llega por parámetro: tras forjar, el estado todavía no está actualizado.
  function requestLlmOpening(nextRoom: GameRoom, firstScene: Scene, campaignToPlay: Campaign) {
    if (!masterProvider.generateOpeningScene) return;
    const openingToken = ++openingTokenRef.current;
    const sceneNpcs = (firstScene.npcIds?.length
      ? campaignToPlay.npcs.filter((npc) => firstScene.npcIds?.includes(npc.id))
      : campaignToPlay.npcs
    ).slice(0, 4).map((npc) => ({ name: npc.name, role: npc.role, description: npc.description, desire: npc.desire, fear: npc.fear }));
    masterProvider.generateOpeningScene({
      campaignTitle: campaignToPlay.title,
      narratorVoice: campaignToPlay.narratorVoice,
      premise: campaignToPlay.premise ?? campaignToPlay.storyHook,
      storyHook: campaignToPlay.storyHook,
      stakes: campaignToPlay.stakes,
      scene: { title: firstScene.title, objective: firstScene.objective },
      npcs: sceneNpcs,
      optionLabels: firstScene.actionChoices.map((choice) => choice.label).slice(0, 4),
      playerNames: nextRoom.players.map((player) => player.name),
      perspectiveEntry: perspectiveEntryLine(selectedWorld, perspective)
    }).then((llmOpening) => {
      if (openingTokenRef.current !== openingToken) return;
      setCurrentNarration(llmOpening.narration);
      if (llmOpening.dialogue) setNpcDialogue([llmOpening.dialogue]);
      setDmSections((prev) => prev ? { ...prev, narration: llmOpening.narration, dialogue: llmOpening.dialogue ?? prev.dialogue } : prev);
    }).catch(() => {
      // La apertura estática ya está visible; no hay nada que romper.
    });
  }

  // La forja genera la historia del mundo sellado: el LLM escribe la ficción dentro
  // de las reglas del mundo y del punto de entrada; buildImprovisedCampaign la monta
  // sobre la mecánica probada.
  async function forgeStory(extraWish: string, worldOverride?: WorldEra, perspectiveOverride?: StoryPerspective): Promise<Campaign | null> {
    const world = worldOverride ?? selectedWorld;
    const chosenPerspective = perspectiveOverride ?? perspective;
    if (!masterProvider.generateImprovisedStory || forgingStory) return null;
    setForgingStory(true);
    setForgeError(null);
    try {
      const content = await masterProvider.generateImprovisedStory({
        userPrompt: extraWish.trim(),
        playerNames: [draft.name],
        // La historia debe atarse a la identidad del héroe (y no robarle el nombre a un NPC).
        hero: { name: draft.name, species: draft.species, role: draft.role, petName: draft.pet.name, concept: draft.concept },
        worldContext: {
          worldName: world.name,
          era: world.era,
          ambience: world.ambience,
          rules: world.worldRules,
          seasoning: world.forgeSeasoning,
          perspective: chosenPerspective,
          entryLine: perspectiveEntryLine(world, chosenPerspective)
        }
      });
      const built = buildImprovisedCampaign(content);
      // El LLM imaginó el aspecto de cada personaje: acá nace su retrato generado.
      const campaign: Campaign = {
        ...built,
        npcs: built.npcs.map((npc) => ({ ...npc, portraitUrl: characterPortraitUrl(npc.name, npc.appearance ?? npc.description, `${world.era}, ${world.name}`) }))
      };
      setImprovisedCampaign(campaign);
      setImprovisedWorldId(world.id);
      setSelectedCampaignId(campaign.id);
      return campaign;
    } catch (error) {
      setForgeError(error instanceof Error ? error.message : "La forja falló. Probá de nuevo en unos segundos.");
      return null;
    } finally {
      setForgingStory(false);
    }
  }

  function selectWorld(worldId: string) {
    const world = worldById(worldId);
    setSelectedWorldId(worldId);
    localStorage.setItem(worldStorageKey, worldId);
    if (world.authoredCampaignId) {
      setSelectedCampaignId(world.authoredCampaignId);
    } else if (improvisedWorldId === world.id && improvisedCampaign) {
      setSelectedCampaignId(improvisedCampaign.id);
    } else {
      // Mundo sin historia madre: se forja apenas lo elegís, mientras armás tu héroe.
      void forgeStory("", world);
    }
  }

  function startColumnDrag(side: "left" | "right", event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const frame = gameFrameRef.current;
    if (!frame) return;
    const startX = event.clientX;
    const tracks = getComputedStyle(frame).gridTemplateColumns.split(" ").map((value) => parseFloat(value));
    const startLeft = tracks[0] ?? 250;
    const startRight = tracks[2] ?? 420;
    const frameWidth = frame.clientWidth;
    const handleEl = event.currentTarget;
    handleEl.classList.add("dragging");
    document.body.style.userSelect = "none";
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      if (side === "left") {
        const next = Math.round(Math.min(Math.min(560, frameWidth - startRight - 380), Math.max(170, startLeft + dx)));
        setGameCols((cols) => ({ ...cols, left: next }));
      } else {
        const next = Math.round(Math.min(Math.min(780, frameWidth - startLeft - 380), Math.max(320, startRight - dx)));
        setGameCols((cols) => ({ ...cols, right: next }));
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      handleEl.classList.remove("dragging");
      document.body.style.userSelect = "";
      const cols = gameColsRef.current;
      if (cols.left) localStorage.setItem("tiny-quest:col-left", String(cols.left)); else localStorage.removeItem("tiny-quest:col-left");
      if (cols.right) localStorage.setItem("tiny-quest:col-right", String(cols.right)); else localStorage.removeItem("tiny-quest:col-right");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function resetColumn(side: "left" | "right") {
    localStorage.removeItem(side === "left" ? "tiny-quest:col-left" : "tiny-quest:col-right");
    setGameCols((cols) => ({ ...cols, [side]: null }));
  }

  function choosePartyMode(next: "alone" | "companions") {
    setPartyMode(next);
    localStorage.setItem(partyStorageKey, next);
  }

  function choosePerspective(next: StoryPerspective) {
    setPerspective(next);
    localStorage.setItem(perspectiveStorageKey, next);
    // La historia improvisada nace del punto de entrada: cambiarlo re-forja el mundo.
    if (!selectedWorld.authoredCampaignId) void forgeStory("", selectedWorld, next);
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
    openingTokenRef.current += 1;
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
      const nextScene = getRoomScenes(nextRoom)[nextRoom.currentSceneIndex];
      const nextChoices = getVisibleActionChoices(nextScene, nextRoom);
      // El motor es la verdad: las opciones mostradas son siempre las reales del motor,
      // nunca texto suelto del narrador mapeado por posición.
      const realOptionLabels = nextChoices.map((choice) => choice.label).slice(0, 4);
      setRoom(nextRoom);
      setCurrentNarration(safeNarration);
      setNpcDialogue(narration.npcDialogue);
      setNextOptions(realOptionLabels);
      setLatestTurnNarration(narration);
      setDmSections({
        narration: safeNarration,
        dialogue: narration.sections?.dialogue ?? narration.npcDialogue.join(" "),
        consequence: safeConsequence,
        options: realOptionLabels
      });
      setPlotBeat(narration.plotBeat);
      // El narrador solo puede enriquecer labels si referencia el id exacto de la opción.
      if (narration.enrichedOptions?.length) {
        const labels: Record<string, string> = {};
        for (const opt of narration.enrichedOptions) {
          if (opt.id && opt.label) labels[opt.id] = opt.label;
        }
        setEnrichedChoiceLabels(labels);
      } else {
        setEnrichedChoiceLabels({});
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
        const fallbackScene = getRoomScenes(safeRoom)[safeRoom.currentSceneIndex];
        const fallbackOptionLabels = getVisibleActionChoices(fallbackScene, safeRoom).map((choice) => choice.label).slice(0, 4);
        setRoom(safeRoom);
        setCurrentNarration(safeNarration);
        setNpcDialogue(fallback.npcDialogue);
        setNextOptions(fallbackOptionLabels);
        setLatestTurnNarration(fallback);
        setEnrichedChoiceLabels({});
        setDmSections({ narration: safeNarration, dialogue: fallback.npcDialogue.join(" "), consequence: safeConsequence, options: fallbackOptionLabels });
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
        draft={draft}
        setDraft={setDraft}
        startSolo={startSolo}
        onMultiplayerHost={startMultiplayerHost}
        onMultiplayerJoin={openMultiplayerJoin}
        improvisedCampaign={improvisedCampaign}
        forgingStory={forgingStory}
        forgeError={forgeError}
        onForgeStory={(wish) => { void forgeStory(wish); }}
        selectedWorld={selectedWorld}
        onSelectWorld={selectWorld}
        perspective={perspective}
        onChoosePerspective={choosePerspective}
        partyMode={partyMode}
        onChoosePartyMode={choosePartyMode}
        onReimagineHero={reimagineHeroPortrait}
        onUnlockAutoPortrait={unlockAutoPortrait}
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
      {chapterBanner && !room.sessionComplete && (
        <div className="chapterBanner" role="status" onClick={() => setChapterBanner(null)}>
          <em>Capítulo {["I", "II", "III", "IV", "V"][chapterBanner.number - 1] ?? chapterBanner.number}</em>
          <strong>{chapterBanner.title}</strong>
          {chapterBanner.law && <p>⚖ Ley del mundo grabada: {chapterBanner.law}</p>}
        </div>
      )}
      {clueToast && !room.sessionComplete && (
        <div className="clueToast" role="status" onClick={() => setClueToast(null)}>
          <strong>🔍 Pista descubierta</strong>
          <span>{clueToast}</span>
        </div>
      )}
      {isMultiplayer && mpState.phase === "opponent_gone" && (
        <div className="mpDisconnectOverlay">
          <p>Tu oponente se desconectó. La partida continúa si regresa en 5 minutos.</p>
          <button className="ghostButton" onClick={cancelMultiplayer}>Volver al menú</button>
        </div>
      )}
      <section
        className="gameFrame gameFrameResizable"
        ref={gameFrameRef}
        style={{
          ["--col-left" as string]: gameCols.left ? `${gameCols.left}px` : undefined,
          ["--col-right" as string]: gameCols.right ? `${gameCols.right}px` : undefined
        } as React.CSSProperties}
      >
        <TurnQueue room={room} draft={draft} audioRef={audioRef} audioUrl={sceneAudioUrl} ambienceName={scene.title} mood={soundMood} isPlaying={isAudioPlaying} setPlaying={setAudioPlaying} volume={volume} setVolume={setVolume} journey={{ worldName: selectedWorld.name, scenes: sceneList.map((item) => item.title), currentIndex: room.currentSceneIndex, laws: selectedWorld.worldRules.slice(0, room.currentSceneIndex), totalLaws: selectedWorld.worldRules.length }} />
        {/* La narración vive en la pista central ancha; elección y dados en la columna derecha. */}
        <DungeonMasterPanel room={room} narration={currentNarration} latestTurnNarration={latestTurnNarration} dice={dice} botTurnPaused={!isMultiplayer && botTurnPaused} onContinueBot={runBotTurn} sections={dmSections} plotBeat={plotBeat} dialogue={npcDialogue} finalRecap={room?.finalRecap} warnings={atmosphereEnv.warnings} />
        <section className="centerColumn actionColumn">
          {!room.sessionComplete && <ScenePanel sceneTitle={scene.title} objective={scene.objective} clues={room?.mysteryClues ?? [scene.mysteryClue]} choices={visibleChoices} selectedActionDraftId={(isBotTurn(room) || mpBlockActions) ? "" : selectedActionDraftId} onChoice={chooseSceneAction} imageUrl={sceneImageUrl} energy={currentCharacter.energy} enrichedLabels={enrichedChoiceLabels} roundInScene={room.roundInScene} />}
          {!room.sessionComplete && <CastPanel sceneId={scene.id} npcIds={scene.npcIds ?? []} npcs={room.campaign.npcs} styleHint={`${selectedWorld.era}, ${normalizeUiText(room.campaign.genre)}`} />}
          {!room.sessionComplete && <ActionComposer room={room} activeType={activePlayer?.type} busy={busy || (isMultiplayer && mpState.phase === "narrating")} botTurnPaused={!isMultiplayer && botTurnPaused} turnError={turnError ?? mpState.errorMessage} sceneChoices={visibleChoices} selectedChoice={selectedActionDraft} selectedStat={selectedStat} setSelectedStat={setSelectedStat} character={currentCharacter} usePet={usePet} setUsePet={setUsePet} runHuman={handleHumanTurn} runBot={runBotTurn} multiplayerBlock={mpBlockActions} />}
          <DiceResultBar dice={dice} activePlayerId={activePlayer?.id} />
        </section>
        <div className="colHandle colHandleLeft" role="separator" aria-orientation="vertical" title="Arrastrá para redimensionar · doble click restablece" onPointerDown={(event) => startColumnDrag("left", event)} onDoubleClick={() => resetColumn("left")} />
        <div className="colHandle colHandleRight" role="separator" aria-orientation="vertical" title="Arrastrá para redimensionar · doble click restablece" onPointerDown={(event) => startColumnDrag("right", event)} onDoubleClick={() => resetColumn("right")} />
      </section>
    </main>
  );
}

function LobbyScreen({ selectedCampaign, draft, setDraft, startSolo, onMultiplayerHost, onMultiplayerJoin, improvisedCampaign, forgingStory, forgeError, onForgeStory, selectedWorld, onSelectWorld, perspective, onChoosePerspective, partyMode, onChoosePartyMode, onReimagineHero, onUnlockAutoPortrait }: { selectedCampaign: Campaign; draft: Character; setDraft: (character: Character) => void; startSolo: () => void; onMultiplayerHost: () => void; onMultiplayerJoin: () => void; improvisedCampaign: Campaign | null; forgingStory: boolean; forgeError: string | null; onForgeStory: (prompt: string) => void; selectedWorld: WorldEra; onSelectWorld: (worldId: string) => void; perspective: StoryPerspective; onChoosePerspective: (perspective: StoryPerspective) => void; partyMode: "alone" | "companions"; onChoosePartyMode: (mode: "alone" | "companions") => void; onReimagineHero: (seedNonce: number) => void; onUnlockAutoPortrait: () => void }) {
  const [showHelp, setShowHelp] = useState(false);
  const [forgePrompt, setForgePrompt] = useState("");
  const [editingHero, setEditingHero] = useState(false);
  // Ficha rápida de un personaje forjado (click en un chip del teaser).
  const [castPeek, setCastPeek] = useState<CastPeek | null>(null);
  // Estado del retrato del héroe: avisa que la personalización tarda (con prioridad en la cola).
  const heroPortrait = useGeneratedPortrait(isGeneratedPortraitUrl(draft.avatarUrl) ? draft.avatarUrl : undefined, { priority: true });
  // Paso 3 obligatorio antes de empezar: el héroe necesita rasgos (género/piel/ojos).
  const heroLookDone = lookComplete(draft);
  // El temple de la quest: la historia elegida sube una stat y baja otra en la partida.
  const questTemper = getQuestTemper(selectedCampaign);
  const improvisedSelected = improvisedCampaign !== null && selectedCampaign.id === improvisedCampaign.id;
  const canForge = forgePrompt.trim().length >= 12 && !forgingStory;
  const mpBlocked = improvisedSelected || !selectedWorld.authoredCampaignId;
  return (
    <main className="appShell lobbyShell">
      <HelpButton open={showHelp} setOpen={setShowHelp} />
      <header className="lobbyHeader">
        <div>
          <img className="brandLogo" src="/assets/brand/tiny-quest-logo.png" alt="Tiny Quest" />
        </div>
        <div className="lobbyHeaderActions">
          <button className="ghostButton" type="button" onClick={onMultiplayerHost} disabled={mpBlocked} title={mpBlocked ? "Las historias forjadas online llegan pronto — por ahora jugalas en solitario." : undefined}><Users size={16} /> Crear sala</button>
          <button className="ghostButton" type="button" onClick={onMultiplayerJoin}><Users size={16} /> Unirse con código</button>
        </div>
      </header>

      <section className="lobbyLayout">
        {editingHero ? (
          <section className="heroEditWrap lobbyHeroGrid soloHero heroSpecial">
            <CharacterDesigner draft={draft} setDraft={setDraft} disabled={false} onReimagine={onReimagineHero} onUnlockAutoPortrait={onUnlockAutoPortrait} />
            <button className="ghostButton heroDone" type="button" onClick={() => setEditingHero(false)}>✔ Guardar héroe y continuar</button>
          </section>
        ) : (
          <section className="panel heroSummary heroSpecial">
            <PanelTitle title="1 · Forjá tu héroe" icon={<Wand2 size={17} />} />
            <div className="heroSummaryRow">
              <HeroAvatarImg url={draft.avatarUrl} name={draft.name} priority />
              <div className="heroSummaryInfo">
                <strong>{draft.name}</strong>
                <span>{draft.species} · {draft.role}</span>
                <span className="heroSummaryPet"><NpcPortrait name={draft.pet.name} portraitUrl={petPortraitUrl(draft.pet.name, draft.pet.description)} size={22} /> {draft.pet.name}</span>
              </div>
              <div className="heroSummaryActions">
                <button className="ghostButton" type="button" onClick={() => setEditingHero(true)}>Editar héroe</button>
                <button className="reimagineButton" type="button" onClick={() => onReimagineHero(1 + Math.floor(Math.random() * 9000))} disabled={!heroLookDone} title={heroLookDone ? "La IA imagina otra cara para tu identidad" : "Primero elegí género, piel y ojos en Editar héroe"}>
                  <Sparkles size={13} /> Reimaginar héroe
                </button>
              </div>
            </div>
            {!heroLookDone && <p className="startHint">Tu héroe todavía no tiene cara: entrá a <strong>Editar héroe</strong> y elegí género, piel y ojos para forjar su retrato.</p>}
            {heroPortrait.status === "loading" && <p className="portraitStatus">✨ Personalizando tu retrato… puede tardar un minuto, seguí armando tu historia.</p>}
          </section>
        )}

        <section className="panel lobbyThemesPanel storyBuilder">
          <PanelTitle title="2 · Elegí mundo" icon={<Sparkles size={17} />} />
          <div className="worldGrid">
            {worldEras.map((world) => (
              <WorldCard key={world.id} world={world} selected={world.id === selectedWorld.id} disabled={forgingStory && world.id !== selectedWorld.id} onSelect={() => onSelectWorld(world.id)} />
            ))}
          </div>
          <div className="stepDivider"><PanelTitle title="3 · Forjá tu historia" icon={<Zap size={17} />} /></div>
          <div className="quickChoices">
            <div className="quickChoiceGroup">
              <span>Entrás</span>
              <div className="pillRow">
                <button type="button" className={perspective === "exterior" ? "selected" : ""} onClick={() => onChoosePerspective("exterior")} disabled={forgingStory}>Desde afuera</button>
                <button type="button" className={perspective === "interior" ? "selected" : ""} onClick={() => onChoosePerspective("interior")} disabled={forgingStory}>Desde adentro</button>
              </div>
            </div>
            <div className="quickChoiceGroup">
              <span>Recorrido</span>
              <div className="pillRow">
                <button type="button" className={partyMode === "alone" ? "selected" : ""} onClick={() => onChoosePartyMode("alone")}>En solitario</button>
                <button type="button" className={partyMode === "companions" ? "selected" : ""} onClick={() => onChoosePartyMode("companions")} title="Belo y Miri juegan sus propios turnos">Con compañeros</button>
              </div>
            </div>
          </div>
          <p className="entryHint">{perspectiveEntryLine(selectedWorld, perspective)}</p>
          <div className="storyForgeRow">
            <input
              value={forgePrompt}
              onChange={(event) => setForgePrompt(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && canForge) onForgeStory(forgePrompt.trim()); }}
              placeholder="⚡ Tus ideas para el narrador (opcional): elfos, dinastías, un traidor en la familia…"
              disabled={forgingStory}
              aria-label="Ideas para la historia del mundo"
            />
            <button type="button" className="soloButton forgeButton" disabled={!canForge} onClick={() => onForgeStory(forgePrompt.trim())}>
              {forgingStory ? "Forjando…" : "Reforjar historia"}
            </button>
          </div>
          {forgingStory && <ForgeRitual />}
          {forgeError && !forgingStory && <p className="storyForgeError">{forgeError} <button type="button" className="ghostButton retryForge" onClick={() => onForgeStory(forgePrompt.trim())}>Reintentar</button></p>}
          {improvisedSelected && !forgingStory && improvisedCampaign && (
            <div className="forgedTeaser">
              <strong>⚡ {normalizeUiText(improvisedCampaign.title)}</strong>
              <p>{normalizeUiText(improvisedCampaign.premise ?? improvisedCampaign.description)}</p>
              {improvisedCampaign.forgeNotes?.summary && (
                <div className="forgedSummary">
                  {improvisedCampaign.forgeNotes.summary.objective && <p><em>Objetivo</em>{normalizeUiText(improvisedCampaign.forgeNotes.summary.objective)}</p>}
                  {improvisedCampaign.forgeNotes.summary.risk && <p><em>Riesgo</em>{normalizeUiText(improvisedCampaign.forgeNotes.summary.risk)}</p>}
                  {improvisedCampaign.forgeNotes.summary.firstMystery && <p><em>Primer misterio</em>{normalizeUiText(improvisedCampaign.forgeNotes.summary.firstMystery)}</p>}
                  {improvisedCampaign.forgeNotes.summary.timeLimit && <p><em>Reloj</em>{normalizeUiText(improvisedCampaign.forgeNotes.summary.timeLimit)}</p>}
                  {improvisedCampaign.forgeNotes.evidence && improvisedCampaign.forgeNotes.evidence.length > 0 && (
                    <p><em>Evidencia</em>{improvisedCampaign.forgeNotes.evidence.map((item) => normalizeUiText(item)).join(" · ")}</p>
                  )}
                </div>
              )}
              {improvisedCampaign.forgeNotes?.heroBond && <p className="heroBondLine">⚔ {normalizeUiText(improvisedCampaign.forgeNotes.heroBond)}</p>}
              {improvisedCampaign.forgeNotes?.keywordsUsed && improvisedCampaign.forgeNotes.keywordsUsed.length > 0 && (
                <div className="keywordsUsed">
                  <em>Tus ideas en la historia:</em>
                  {improvisedCampaign.forgeNotes.keywordsUsed.map((keyword) => (
                    <span key={keyword.idea}>✓ {normalizeUiText(keyword.idea)} → {normalizeUiText(keyword.how)}</span>
                  ))}
                </div>
              )}
              <div className="forgedTeaserCast">
                {improvisedCampaign.npcs.map((npc, index) => (
                  <button
                    key={npc.id}
                    type="button"
                    className="castChip castChipButton"
                    style={{ "--chip-i": index } as CSSProperties}
                    onClick={() => setCastPeek({ name: npc.name, role: npc.role, description: npc.description, desire: npc.desire, fear: npc.fear, portraitUrl: npc.portraitUrl, bond: npc.bond, whyMightLie: npc.whyMightLie })}
                  >
                    <NpcPortrait name={npc.name} role={npc.role} portraitUrl={npc.portraitUrl} size={28} />
                    <span className="castChipText">
                      <strong>{npc.name}</strong>
                      {npc.bond && <small>{normalizeUiText(npc.bond)}</small>}
                    </span>
                  </button>
                ))}
                {improvisedCampaign.enemies[0] && (
                  <button
                    type="button"
                    className="castChip threat castChipButton"
                    style={{ "--chip-i": improvisedCampaign.npcs.length } as CSSProperties}
                    onClick={() => setCastPeek({ name: improvisedCampaign.enemies[0].name, description: improvisedCampaign.enemies[0].description, portraitUrl: characterPortraitUrl(improvisedCampaign.enemies[0].name, improvisedCampaign.enemies[0].description, `${selectedWorld.era}, ${selectedWorld.name}`), threat: true, dangerLevel: improvisedCampaign.enemies[0].dangerLevel })}
                  >
                    <NpcPortrait name={improvisedCampaign.enemies[0].name} role="amenaza" size={28} portraitUrl={characterPortraitUrl(improvisedCampaign.enemies[0].name, improvisedCampaign.enemies[0].description, `${selectedWorld.era}, ${selectedWorld.name}`)} />
                    {improvisedCampaign.enemies[0].name}
                  </button>
                )}
              </div>
              {(improvisedCampaign.scenes[0]?.multipleChoiceOptions?.length ?? 0) > 0 && (
                <div className="firstPaths">
                  <em>Primeros caminos posibles:</em>
                  <ol>
                    {improvisedCampaign.scenes[0].multipleChoiceOptions.slice(0, 3).map((option, index) => (
                      <li key={`path-${index}`}>{normalizeUiText(option.label)}</li>
                    ))}
                  </ol>
                </div>
              )}
              <em className="teaserHint">Tocá un personaje para ver qué sabe, qué quiere y por qué podría mentirte — sus secretos reales se revelan jugando. Los retratos se pintan de a uno: dales unos minutos.</em>
            </div>
          )}
          {castPeek && <CharacterPeekModal peek={castPeek} onClose={() => setCastPeek(null)} />}
        </section>

        <section className="panel finalStep">
          <PanelTitle title="4 · Revisá y empezá" icon={<Play size={17} />} />
          <div className="questTemper">
            Esta historia templa tu <em className={`statChip stat-${questTemper.blessed}`}>{statLabels[questTemper.blessed]} +1</em> y descuida tu <em className={`statChip stat-${questTemper.strained} strained`}>{statLabels[questTemper.strained]} −1</em> durante la partida.
          </div>
          <button className="startCta" type="button" onClick={startSolo} disabled={forgingStory || editingHero || !heroLookDone}>
            <Play size={20} /> {forgingStory ? "Forjando tu historia…" : !heroLookDone ? "Forjá tu héroe para empezar" : editingHero ? "Guardá tu héroe para empezar" : "Empezar la historia"}
          </button>
          {!heroLookDone && !editingHero && <p className="startHint">Falta el paso 1: tu héroe necesita género, piel y ojos para que el narrador lo vea.</p>}
          {editingHero && <p className="startHint">Guardá tu héroe (arriba) para desbloquear el comienzo.</p>}
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

type JourneyInfo = { worldName: string; scenes: string[]; currentIndex: number; laws: string[]; totalLaws: number };

function TurnQueue({ room, draft, audioRef, audioUrl, ambienceName, mood, isPlaying, setPlaying, volume, setVolume, journey }: { room: GameRoom | null; draft: Character; audioRef: RefObject<HTMLAudioElement | null>; audioUrl: string; ambienceName: string; mood: string; isPlaying: boolean; setPlaying: (v: boolean) => void; volume: number; setVolume: (v: number) => void; journey?: JourneyInfo }) {
  const players = room?.players ?? [{ id: "preview", name: draft.name, type: "human" as const, character: draft, temporaryItems: [] }];
  return (
    <aside className="panel turnQueue">
      <PanelTitle title="Turnos" icon={<Bot size={17} />} />
      {players.map((player, index) => {
        const active = room?.activePlayerIndex === index;
        const next = room && (room.activePlayerIndex + 1) % players.length === index;
        return (
          <article className={`queueCard ${active ? "current" : ""}`} key={player.id}>
            <div className="avatar"><HeroAvatarImg url={player.type === "bot" ? characterPortraitUrl(player.name, `${player.character.species} ${player.character.role}, compañero de aventuras leal`, journey?.worldName ?? "mundo de fantasía") : player.character.avatarUrl} name={player.name} priority={player.type === "human"} /><span>{player.type === "bot" ? "BOT" : "TU"}</span></div>
            <div><strong>{player.name}</strong><span>{player.character.species} · {player.character.role}</span><small>{player.status === "dead" ? "Caído trágicamente" : active ? "Turno actual" : next ? "Siguiente" : "En cola"}</small></div>
            <div className="miniMeters"><span><Heart size={13} /> {player.character.vitality}</span><span><Zap size={13} /> {player.character.energy}</span><span><NpcPortrait name={player.character.pet.name} portraitUrl={petPortraitUrl(player.character.pet.name, player.character.pet.description)} size={14} /> {player.character.pet.name}</span></div>
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
      {journey && (
        <div className="journeyPanel">
          <h3>El recorrido</h3>
          <ol className="journeyPath">
            {journey.scenes.map((title, index) => (
              <li key={`${title}-${index}`} className={index < journey.currentIndex ? "done" : index === journey.currentIndex ? "current" : "future"}>
                <i aria-hidden="true" />
                {/* Las escenas futuras son incógnitas: el recorrido se revela al caminarlo. */}
                <span>{index <= journey.currentIndex ? title : "· · ·"}</span>
              </li>
            ))}
          </ol>
          <div className="journeyLaws">
            <h4>Leyes de {journey.worldName}</h4>
            {journey.laws.length === 0 && <p className="journeyLocked">Todavía no conocés ninguna. Se graban al avanzar de capítulo.</p>}
            {journey.laws.map((law) => <p key={law} className="journeyLaw">⚖ {law}</p>)}
            {journey.laws.length < journey.totalLaws && journey.laws.length > 0 && (
              <p className="journeyLocked">{journey.totalLaws - journey.laws.length} {journey.totalLaws - journey.laws.length === 1 ? "ley sellada" : "leyes selladas"} por descubrir…</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

// Retrato de NPC: pasa por la caché persistente (portraits.ts) — genera una vez,
// guarda el blob y reintenta solo si falla. Mientras se pinta muestra el medallón
// procedural con pulso de forja; si el servicio muere, el medallón queda.
function NpcPortrait({ name, role, portraitUrl, size = 46 }: { name: string; role?: string; portraitUrl?: string; size?: number }) {
  const { src, status } = useGeneratedPortrait(isGeneratedPortraitUrl(portraitUrl) ? portraitUrl : undefined);
  if (src) {
    return <img className={`npcPortrait npcPortraitImg ${status === "loading" ? "portraitForging" : ""}`} src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  }
  const hash = nameHash(name);
  const hue = hash % 360;
  const hue2 = (hue + 40 + (hash % 60)) % 360;
  const roleKind = /amenaza|antagonista|villan/i.test(role ?? "") ? "threat" : /principal|líder|lider|jefe/i.test(role ?? "") ? "primary" : "secondary";
  const ring = roleKind === "threat" ? "#e86450" : roleKind === "primary" ? "#ffbf35" : "#75eadb";
  const initial = (name.replace(/^(el|la|los|las|un|una)\s+/i, "").trim()[0] ?? "?").toUpperCase();
  const gradientId = `npcGrad-${hash}`;
  return (
    <svg className={`npcPortrait ${status === "loading" ? "portraitForging" : ""}`} width={size} height={size} viewBox="0 0 46 46" role="img" aria-label={name}>
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={`hsl(${hue}, 55%, 38%)`} />
          <stop offset="100%" stopColor={`hsl(${hue2}, 60%, 14%)`} />
        </radialGradient>
      </defs>
      <circle cx="23" cy="23" r="21.5" fill={`url(#${gradientId})`} stroke={ring} strokeWidth="2" />
      {/* Silueta genérica: hombros + cabeza, apenas sugerida */}
      <circle cx="23" cy="17.5" r="6.5" fill="rgba(8,10,16,.55)" />
      <path d="M9 38 Q23 26 37 38 L37 41 Q23 45 9 41 Z" fill="rgba(8,10,16,.55)" />
      <text x="23" y="27.5" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff3d8" style={{ textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>{initial}</text>
    </svg>
  );
}

// Card de mundo con arte generado: paisaje/mapa característico pintado por IA,
// cacheado para siempre. Hasta que llega la imagen, queda el gradiente de base.
function WorldCard({ world, selected, disabled, onSelect }: { world: WorldEra; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const { src } = useGeneratedPortrait(worldCardImageUrl(world.id, world.name, world.era, world.tagline));
  return (
    <button
      type="button"
      className={`worldCard ${selected ? "selected" : ""} ${src ? "hasArt" : ""}`}
      style={src ? { backgroundImage: `linear-gradient(180deg, rgba(4,8,18,.18) 0%, rgba(4,8,18,.55) 55%, rgba(3,6,14,.92) 100%), url(${src})` } : undefined}
      onClick={onSelect}
      disabled={disabled}
      title={world.authoredCampaignId ? "Historia madre lista · online disponible" : "La historia se forja al elegirlo"}
    >
      <em>{world.era}</em>
      <strong>{world.name}</strong>
      <span>{world.tagline}</span>
    </button>
  );
}

// Ficha pública de un personaje forjado: lo que el jugador puede leer antes de
// jugar. Nunca incluye secret/whatTheyHide/alibi — eso se descubre en la partida.
type CastPeek = { name: string; role?: string; description: string; desire?: string; fear?: string; portraitUrl?: string; threat?: boolean; dangerLevel?: number; bond?: string; whyMightLie?: string };

// La personalización física del héroe es obligatoria antes de forjar su retrato.
function lookComplete(draft: Character): boolean {
  return Boolean(draft.look?.gender && draft.look?.skinTone && draft.look?.eyeColor);
}

// Las dos imágenes del héroe con el mismo seed: retrato de frente y cuerpo entero.
function heroImageUrls(draft: Character, nonce = 0): { face: string; fullbody: string } {
  const spec = heroPortraitSpec(draft);
  return {
    face: characterPortraitUrl(spec.name, spec.appearance, spec.styleHint, nonce),
    fullbody: fullBodyPortraitUrl(spec.name, spec.appearance, spec.styleHint, nonce)
  };
}

function CharacterPeekModal({ peek, onClose }: { peek: CastPeek; onClose: () => void }) {
  return (
    <div className="castModalBackdrop" onClick={onClose} role="presentation">
      <div className="castModal peekModal" role="dialog" aria-label={peek.name} onClick={(event) => event.stopPropagation()}>
        <div className="castModalHead">
          <strong>{peek.threat ? "⚔ La amenaza" : "Personaje"}</strong>
          <button type="button" className="castClose" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="peekBody">
          <NpcPortrait name={peek.name} role={peek.threat ? "amenaza" : peek.role} portraitUrl={peek.portraitUrl} size={92} />
          <div className="peekIdentity">
            <strong>{normalizeUiText(peek.name)}</strong>
            {peek.role && <span className="castRole">{normalizeUiText(peek.role)}</span>}
            {peek.threat && typeof peek.dangerLevel === "number" && <span className="peekDanger">Peligro {peek.dangerLevel}/10</span>}
          </div>
        </div>
        {peek.bond && <p className="peekBond">{normalizeUiText(peek.bond)}</p>}
        <p className="peekDesc">{normalizeUiText(peek.description)}</p>
        {peek.desire && <p className="peekTrait"><em>Quiere</em>{normalizeUiText(peek.desire)}</p>}
        {peek.fear && <p className="peekTrait"><em>Teme</em>{normalizeUiText(peek.fear)}</p>}
        {peek.whyMightLie && <p className="peekTrait"><em>Podría mentirte</em>{normalizeUiText(peek.whyMightLie)}</p>}
        <p className="peekSealed">Lo que esconde queda sellado hasta que lo descubras jugando.</p>
      </div>
    </div>
  );
}

// Ritual de forja: mientras el LLM escribe la historia, la fragua respira —
// frases que rotan, brasas que suben y una barra de calor. Pura UI, cero datos.
const forgeRitualLines = [
  "El narrador enciende la fragua…",
  "Nacen los testigos y sus nombres…",
  "Alguien ya está mintiendo…",
  "Se templan los capítulos…",
  "La amenaza abre los ojos…",
  "Se sella el destino…"
];

function ForgeRitual() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((value) => value + 1), 2100);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="forgeRitual" role="status">
      <div className="forgeSparks" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <p key={step}>{forgeRitualLines[step % forgeRitualLines.length]}</p>
      <div className="forgeEmberBar"><span /></div>
    </div>
  );
}

// Identidad visual del héroe: rasgos elegidos (género/piel/ojos) + nombre + linaje
// + oficio + concepto arman el prompt. Misma identidad → misma cara (seed por
// nombre, caché por URL). Los rasgos van PRIMERO para que la imagen los respete.
function heroPortraitSpec(draft: Character): { name: string; appearance: string; styleHint: string } {
  const selectedSpecies = species.find((item) => item.name === draft.species);
  const look = draft.look ?? {};
  const traits = [look.gender, look.skinTone && `piel ${look.skinTone}`, look.eyeColor && `ojos ${look.eyeColor}`].filter(Boolean).join(", ");
  const appearance = [traits, `${draft.species} ${draft.role}, heroic protagonist`, selectedSpecies?.visualFlavor, draft.concept].filter(Boolean).join(". ");
  return { name: draft.name.trim() || "Aventurera", appearance, styleHint: "epic fantasy adventure, hero portrait" };
}

// Opciones de rasgos del retrato: etiquetas en español (van directo al prompt)
// + color de muestra para el swatch. Click en el elegido = soltar la elección.
const lookGenderOptions = ["femenino", "masculino", "andrógino"] as const;
const lookSkinOptions = [
  { label: "pálida", color: "#f2e3d5" },
  { label: "clara", color: "#eac9a8" },
  { label: "trigueña", color: "#c98d5f" },
  { label: "morena", color: "#8d5a3b" },
  { label: "oscura", color: "#553524" },
  { label: "cenicienta", color: "#9aa0a8" }
] as const;
const lookEyeOptions = [
  { label: "marrones", color: "#6b4226" },
  { label: "ámbar", color: "#d19a3d" },
  { label: "verdes", color: "#4e8d5b" },
  { label: "azules", color: "#4a7fc1" },
  { label: "grises", color: "#9aa4ad" },
  { label: "violetas", color: "#8a5fc1" }
] as const;

// Avatar del héroe / jugadores: si la URL es generada pasa por la caché con
// medallón data-URI de placeholder (sigue siendo un <img>, así hereda el CSS
// de .avatar img / .heroPortrait / .heroSummaryRow img sin tocar selectores).
function HeroAvatarImg({ url, name, className, priority = false }: { url: string; name: string; className?: string; priority?: boolean }) {
  const generated = isGeneratedPortraitUrl(url);
  const { src, status } = useGeneratedPortrait(generated ? url : undefined, { priority });
  if (!generated) return <img className={className} src={url} alt={name} />;
  if (src) return <img className={`${className ?? ""} ${status === "loading" ? "portraitForging" : "portraitFade"}`} src={src} alt={name} />;
  return <img className={`${className ?? ""} ${status === "failed" ? "" : "portraitForging"}`} src={medallionDataUri(name)} alt={name} />;
}

function CastPanel({ sceneId, npcIds, npcs, styleHint }: { sceneId: string; npcIds: string[]; npcs: CampaignNPC[]; styleHint: string }) {
  const [open, setOpen] = useState(false);
  // Unión: NPCs activos de la escena (npcIds) + los que declaran presencia vía appearsInScenes.
  const primary = npcIds.map((id) => npcs.find((npc) => npc.id === id)).filter((npc): npc is CampaignNPC => Boolean(npc));
  const secondary = npcs.filter((npc) => !npcIds.includes(npc.id) && npc.appearsInScenes?.includes(sceneId));
  const present = [...primary, ...secondary];
  if (!present.length) return null;
  return (
    <>
      <button type="button" className="castTrigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Users size={14} />
        <span>Personajes</span>
        <span className="castCount">{present.length}</span>
      </button>
      {open && (
        <div className="castModalBackdrop" onClick={() => setOpen(false)} role="presentation">
          <div className="castModal" role="dialog" aria-label="Personajes en escena" onClick={(event) => event.stopPropagation()}>
            <div className="castModalHead">
              <strong>Personajes en escena</strong>
              <button type="button" className="castClose" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="castList">
              {present.map((npc) => (
                <div key={npc.id} className="castCard open">
                  <span className="castHead">
                    <NpcPortrait name={npc.name} role={npc.role} portraitUrl={npc.portraitUrl ?? characterPortraitUrl(npc.name, npc.appearance ?? npc.description, styleHint)} />
                    <span className="castHeadText">
                      <strong>{npc.name}</strong>
                      {npc.role && <span className="castRole">{npc.role}</span>}
                    </span>
                  </span>
                  <span className="castBody">
                    <span className="castDesc">{npc.description}</span>
                    {npc.desire && <span className="castTrait"><em>Quiere:</em> {npc.desire}</span>}
                    {npc.fear && <span className="castTrait"><em>Teme:</em> {npc.fear}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


function ScenePanel({ sceneTitle, objective, clues, choices, selectedActionDraftId, onChoice, imageUrl, energy, enrichedLabels, roundInScene = 0 }: { sceneTitle: string; objective: string; clues: string[]; choices: SceneActionChoice[]; selectedActionDraftId: string; onChoice: (id: string) => void; imageUrl: string; energy: number; enrichedLabels?: Record<string, string>; roundInScene?: number }) {
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
          const roundsLeft = choice.expiresAfterRound !== undefined ? choice.expiresAfterRound - roundInScene : null;
          const isCrisis = choice.skillTag === "crisis";
          return (
            <button className={`choiceCard ${choice.category ?? "investigate"} ${choice.id === selectedActionDraftId ? "selected" : ""} ${disabled ? "unavailable" : ""} ${isCrisis ? "crisisChoice" : ""}`} key={choice.id} onClick={() => onChoice(choice.id)} type="button">
              <strong>{enrichedLabels?.[choice.id] ?? choice.label}</strong>
              {/* Un solo tag por opción: el stat principal. Excepciones puntuales:
                  expiración inminente y costo solo cuando bloquea por falta de energía. */}
              <div className="choiceMeta">
                <div className="choiceStats">
                  {roundsLeft !== null && roundsLeft <= 2
                    ? <span className="expiryChip">⏳ {roundsLeft <= 1 ? "última ronda" : `${roundsLeft} rondas`}</span>
                    : <span className={`statChip stat-${choice.recommendedStats[0]}`}>{statLabels[choice.recommendedStats[0]]}</span>}
                </div>
                {energyCost > 0 && <span className="choiceCost"><Zap size={10} />{energyCost}{disabled ? <em>−{energyCost - energy}</em> : null}</span>}
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
  const plan = resolved?.plan;
  return (
    <section className="panel finalBanner">
      <PanelTitle title="Final alcanzado" icon={<Sparkles size={17} />} />
      <h2>
        {resolved?.title ?? room.finalEnding?.title ?? "Final de la quest"}
        {plan && <span className={`endingTier tier-${plan.tier}`}>{plan.tierLabel}</span>}
      </h2>
      {plan ? (
        <div className="endingClauses">
          {plan.clauses.map((clause, index) => <p key={index} className="endingClause" style={{ "--clause-index": index } as React.CSSProperties}>{clause}</p>)}
        </div>
      ) : (
        <p>{room.finalRecap ?? buildFinalRecap(room)}</p>
      )}
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

const builderTabList = [
  { id: "species", label: "Linaje" },
  { id: "role", label: "Oficio" },
  { id: "pet", label: "Compañero" }
] as const;
type BuilderTab = typeof builderTabList[number]["id"];

function CharacterDesigner({ draft, setDraft, disabled, onReimagine, onUnlockAutoPortrait }: { draft: Character; setDraft: (character: Character) => void; disabled: boolean; onReimagine?: (seedNonce: number) => void; onUnlockAutoPortrait?: () => void }) {
  const spentPoints = totalExtraPoints(draft.stats);
  const remainingPoints = 8 - spentPoints;
  const selectedSpecies = species.find((item) => item.name === draft.species) ?? species[0];
  const selectedRole = roles.find((item) => item.name === draft.role) ?? roles[0];
  const selectedPet = legendaryPets.find((pet) => pet.id === draft.pet.id) ?? legendaryPets[0];
  const [selectedTalent, setSelectedTalent] = useState<string>(characterTalentAssets[0].id);
  const [builderTab, setBuilderTab] = useState<BuilderTab>("species");
  const speciesAffinity = Object.keys(selectedSpecies.statBonus ?? {})[0] as StatKey | undefined;
  const tabValue: Record<BuilderTab, string> = { species: selectedSpecies.name, role: selectedRole.name, pet: selectedPet.name };
  function updateStats(stat: StatKey, delta: number) {
    if (delta > 0 && (remainingPoints <= 0 || draft.stats[stat] >= 4)) return;
    if (delta < 0 && draft.stats[stat] <= 1) return;
    setDraft(createCharacter({ ...draft, stats: { ...draft.stats, [stat]: draft.stats[stat] + delta } }));
  }
  // Estado del retrato para avisar "personalizando…" (con prioridad: tu cara primero).
  const heroPortrait = useGeneratedPortrait(isGeneratedPortraitUrl(draft.avatarUrl) ? draft.avatarUrl : undefined, { priority: true });
  const heroLookDone = lookComplete(draft);
  const currentShot = draft.look?.avatarShot ?? "face";
  function chooseLook(patch: Partial<CharacterLook>) {
    onUnlockAutoPortrait?.();
    setDraft(createCharacter({ ...draft, look: { ...draft.look, ...patch } }));
  }
  // Alterna entre retrato de frente y cuerpo entero SIN regenerar: conserva la seed
  // actual (mismo rostro en ambas tomas) reescribiéndola en la URL de la otra toma.
  function chooseShot(shot: "face" | "fullbody") {
    const urls = heroImageUrls(draft);
    const currentSeed = draft.avatarUrl.match(/seed=(\d+)/)?.[1];
    const nextUrl = currentSeed && isGeneratedPortraitUrl(draft.avatarUrl) ? urls[shot].replace(/seed=\d+$/, `seed=${currentSeed}`) : urls[shot];
    onUnlockAutoPortrait?.();
    setDraft(createCharacter({ ...draft, look: { ...draft.look, avatarShot: shot }, avatarUrl: nextUrl }));
  }
  return (
    <section className="panel designer designerForge">
      <PanelTitle title="Forjá tu héroe" icon={<Wand2 size={17} />} />

      <div className="forgeLeft">
        <div className="heroIdentity">
          <div className="heroPortraitColumn">
            <div className={`heroPortraitFrame ${currentShot === "fullbody" ? "fullbodyFrame" : ""}`}>
              <HeroAvatarImg url={draft.avatarUrl} name={draft.name} className="heroPortrait" priority />
            </div>
            {heroLookDone && (
              <div className="shotToggle" role="group" aria-label="Tipo de imagen del avatar">
                <button type="button" className={currentShot === "face" ? "selected" : ""} onClick={() => chooseShot("face")} disabled={disabled}>Frente</button>
                <button type="button" className={currentShot === "fullbody" ? "selected" : ""} onClick={() => chooseShot("fullbody")} disabled={disabled}>Cuerpo</button>
              </div>
            )}
            {/* Nonce al azar: cada click es una cara nueva (en ambas tomas); la elegida persiste. */}
            {onReimagine && (
              <button type="button" className="reimagineButton" onClick={() => onReimagine(1 + Math.floor(Math.random() * 9000))} disabled={disabled || !heroLookDone} title={heroLookDone ? "La IA imagina otra cara para la misma identidad" : "Elegí género, piel y ojos primero"}>
                <Sparkles size={13} /> Reimaginar héroe
              </button>
            )}
            {heroPortrait.status === "loading" && <span className="portraitStatus">✨ Personalizando…</span>}
            {!heroLookDone && <span className="portraitStatus lookNeeded">Elegí género, piel y ojos →</span>}
          </div>
          <div className="heroIdentityFields">
            <label>Nombre<input value={draft.name} onChange={(event) => setDraft(createCharacter({ ...draft, name: event.target.value }))} disabled={disabled} /></label>
            <label>Concepto<input value={draft.concept} onChange={(event) => setDraft(createCharacter({ ...draft, concept: event.target.value }))} disabled={disabled} /></label>
            <div className="lookPicker">
              <div className="lookGroup">
                <span>Género</span>
                <div className="lookPills">
                  {lookGenderOptions.map((option) => (
                    <button key={option} type="button" className={draft.look?.gender === option ? "selected" : ""} onClick={() => chooseLook({ gender: draft.look?.gender === option ? undefined : option })} disabled={disabled}>{option}</button>
                  ))}
                </div>
              </div>
              <div className="lookGroup">
                <span>Piel</span>
                <div className="lookSwatches">
                  {lookSkinOptions.map((option) => (
                    <button key={option.label} type="button" title={`Piel ${option.label}`} aria-label={`Piel ${option.label}`} className={draft.look?.skinTone === option.label ? "selected" : ""} style={{ background: option.color }} onClick={() => chooseLook({ skinTone: draft.look?.skinTone === option.label ? undefined : option.label })} disabled={disabled} />
                  ))}
                </div>
              </div>
              <div className="lookGroup">
                <span>Ojos</span>
                <div className="lookSwatches">
                  {lookEyeOptions.map((option) => (
                    <button key={option.label} type="button" title={`Ojos ${option.label}`} aria-label={`Ojos ${option.label}`} className={draft.look?.eyeColor === option.label ? "selected" : ""} style={{ background: option.color }} onClick={() => chooseLook({ eyeColor: draft.look?.eyeColor === option.label ? undefined : option.label })} disabled={disabled} />
                  ))}
                </div>
              </div>
            </div>
            <div className="avatarPicker heroAvatarPicker">{avatarOptions.map((avatar) => <button className={draft.avatarUrl === avatar ? "selected" : ""} key={avatar} type="button" onClick={() => setDraft(createCharacter({ ...draft, avatarUrl: avatar }))} disabled={disabled} aria-label="Elegir retrato"><img src={avatar} alt="" /></button>)}</div>
          </div>
        </div>

        <div className="builderTabs" role="tablist" aria-label="Construcción del personaje">
          {builderTabList.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={builderTab === tab.id} className={builderTab === tab.id ? "active" : ""} onClick={() => setBuilderTab(tab.id)}>
              <span>{tab.label}</span>
              <strong>{tabValue[tab.id]}</strong>
            </button>
          ))}
        </div>

        {builderTab === "species" && (
          <>
            <div className="builderCardGrid">
              {species.map((item) => {
                const affinity = Object.keys(item.statBonus ?? {})[0] as StatKey | undefined;
                return (
                  <button key={item.id} type="button" disabled={disabled} className={`builderCard ${draft.species === item.name ? "selected" : ""}`} onClick={() => setDraft(createCharacter({ ...draft, species: item.name }))}>
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                    {affinity && <span className="cardChips"><em className={`statChip stat-${affinity}`}>{statLabels[affinity]}</em></span>}
                  </button>
                );
              })}
            </div>
            <div className="builderDetail">
              <p><strong>Don</strong>{selectedSpecies.passiveTrait}</p>
              <p><strong>Sombra</strong>{selectedSpecies.quirk}</p>
              <p><strong>Aspecto</strong>{selectedSpecies.visualFlavor}</p>
            </div>
          </>
        )}
        {builderTab === "role" && (
          <>
            <div className="builderCardGrid">
              {roles.map((item) => (
                <button key={item.id} type="button" disabled={disabled} className={`builderCard ${draft.role === item.name ? "selected" : ""}`} onClick={() => setDraft(createCharacter({ ...draft, role: item.name }))}>
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                  <span className="cardChips">
                    <em className={`statChip stat-${item.mainStat}`}>{statLabels[item.mainStat]}</em>
                    <em className={`statChip stat-${item.secondaryStat}`}>{statLabels[item.secondaryStat]}</em>
                  </span>
                </button>
              ))}
            </div>
            <div className="builderDetail">
              <p><strong>Habilidad</strong>{selectedRole.specialAbility}</p>
              <p><strong>Límite</strong>{selectedRole.limitation}</p>
              <p><strong>Estilo</strong>{selectedRole.playstyle}</p>
            </div>
          </>
        )}
        {builderTab === "pet" && (
          <>
            <div className="builderCardGrid">
              {legendaryPets.map((pet) => (
                <button key={pet.id} type="button" disabled={disabled} className={`builderCard ${draft.pet.id === pet.id ? "selected" : ""}`} onClick={() => setDraft(createCharacter({ ...draft, pet }))}>
                  <strong>{pet.name}</strong>
                  <span>{pet.description}</span>
                  <span className="cardChips"><em className={`statChip stat-${pet.preferredStat}`}>{statLabels[pet.preferredStat]}</em></span>
                </button>
              ))}
            </div>
            <div className="builderDetail petDetail">
              {/* La compañera tiene SU retrato generado, separado del héroe. */}
              <NpcPortrait name={selectedPet.name} portraitUrl={petPortraitUrl(selectedPet.name, selectedPet.description)} size={72} />
              <div className="petDetailText">
                <p><strong>Pasiva</strong>{selectedPet.passiveAbility}</p>
                <p><strong>Activa</strong>{selectedPet.activeAbility}</p>
                <p><strong>Recarga</strong>{selectedPet.cooldownTurns} turnos entre usos del +1d4.</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="forgeRight">
        <div className="pointsBar"><strong>{remainingPoints}</strong><span>puntos de forja</span><em>{spentPoints}/8 asignados sobre los valores base · máx. 4 por stat</em></div>
        <div className="statBarsPanel">
          {(Object.keys(statLabels) as StatKey[]).map((stat) => (
            <div className="statBarRow" key={stat}>
              <img src={characterStatAssets[stat]} alt="" aria-hidden="true" />
              <span>
                {statLabels[stat]}
                {speciesAffinity === stat && <i className="affinityMark" title={`Afinidad de ${selectedSpecies.name}`}>◆</i>}
                {selectedRole.mainStat === stat && <i className="affinityMark roleMark" title={`Stat principal de ${selectedRole.name}`}>★</i>}
                {selectedRole.secondaryStat === stat && <i className="affinityMark roleMark secondary" title={`Stat secundario de ${selectedRole.name}`}>☆</i>}
              </span>
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
                <button className={`talentOption ${selectedTalent === talent.id ? "selected" : ""}`} type="button" key={talent.id} onClick={() => setSelectedTalent(talent.id)} disabled={disabled}>
                  <img src={talent.url} alt="" />
                  <span>{talent.name}</span>
                </button>
              ))}
              <button className="lockedTalent" type="button" disabled aria-label="Talento bloqueado">⌕</button>
            </div>
          </div>
        </div>
        <div className="heroSheet">
          <h3>Ficha viva</h3>
          <p className="sheetBlock"><strong>Quién sos</strong>{selectedSpecies.name} · {selectedRole.name} · {selectedPet.name}</p>
          <p className="sheetBlock"><strong>Qué te ayuda</strong>{selectedSpecies.passiveTrait} {selectedRole.specialAbility} {selectedPet.activeAbility}</p>
          <p className="sheetBlock"><strong>Qué te complica</strong>{selectedSpecies.quirk} {selectedRole.limitation}</p>
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
