import type { SceneActionChoice } from "./types";

export type NarrativeActionType = "examine_object" | "pressure_witness" | "force_route" | "protect_scene" | "combat" | "escape" | "reveal_ending" | "general";

export function getNarrativeActionType(choice: Pick<SceneActionChoice, "id" | "label" | "action" | "category" | "intent" | "riskLevel" | "actionType"> | undefined, rawAction = ""): NarrativeActionType {
  if (choice?.actionType) {
    if (choice.actionType === "investigar_objeto" || choice.actionType === "comparar_evidencia" || choice.actionType === "usar_objeto") return "examine_object";
    if (choice.actionType === "interrogar_npc" || choice.actionType === "confrontar_npc" || choice.actionType === "negociar" || choice.actionType === "mentir") return "pressure_witness";
    if (choice.actionType === "abrir_ruta" || choice.actionType === "cerrar_ruta") return "force_route";
    if (choice.actionType === "proteger_aliado") return "protect_scene";
    if (choice.actionType === "combatir") return "combat";
    if (choice.actionType === "huir") return "escape";
    if (choice.actionType === "revelar_prueba" || choice.actionType === "tomar_decision_moral" || choice.actionType === "sacrificar_recurso") return "reveal_ending";
  }
  const text = `${choice?.id ?? ""} ${choice?.label ?? ""} ${choice?.action ?? rawAction}`.toLowerCase();
  if (text.includes("acusar") || text.includes("reliquia") || text.includes("culpable falso") || text.includes("misericordia") || text.includes("romper la prueba")) return "reveal_ending";
  if (choice?.category === "fight" || choice?.intent === "fight" || text.includes("combat") || text.includes("pelear") || text.includes("enfrentar")) return "combat";
  if (text.includes("ruta") || text.includes("forzar") || text.includes("puerta") || text.includes("salida") || text.includes("paso")) return "force_route";
  if (choice?.category === "defend" || choice?.intent === "protect" || text.includes("proteger") || text.includes("defender") || text.includes("custodia")) return "protect_scene";
  if (choice?.category === "escape" || choice?.intent === "flee" || text.includes("huir") || text.includes("escapar")) return "escape";
  if (choice?.category === "talk" || choice?.intent === "talk" || text.includes("testigo") || text.includes("presionar") || text.includes("interrogar") || text.includes("confes")) return "pressure_witness";
  if (choice?.category === "investigate" || text.includes("examinar") || text.includes("estudiar") || text.includes("objeto") || text.includes("huella") || text.includes("prueba") || text.includes("comparar")) return "examine_object";
  return "general";
}

export function narrativeDoDont(actionType: NarrativeActionType) {
  const table: Record<NarrativeActionType, { must: string[]; avoid: string[] }> = {
    examine_object: {
      must: ["detalle físico", "textura/marca/evidencia", "comparación concreta"],
      avoid: ["confesión espontánea", "persecución calmada", "diálogo como centro"]
    },
    pressure_witness: {
      must: ["diálogo natural", "evasiva o contradicción", "miedo visible del NPC"],
      avoid: ["examinar objetos como acción principal", "descubrir cuerda/huella nueva si no fue revelada por el motor"]
    },
    force_route: {
      must: ["movimiento", "obstáculo", "cambio de posición/ruta"],
      avoid: ["interrogatorio quieto", "análisis minucioso de prueba"]
    },
    protect_scene: {
      must: ["contener gente", "bloquear peligro", "ganar tiempo"],
      avoid: ["perseguir lejos sin abandonar la escena", "descubrir pista decorativa"]
    },
    combat: {
      must: ["distancia", "golpe/defensa", "daño o posición"],
      avoid: ["charla tranquila", "investigación detallada"]
    },
    escape: {
      must: ["velocidad", "respiración", "ruta y pérdida de control"],
      avoid: ["detenerse a estudiar con calma"]
    },
    reveal_ending: {
      must: ["decisión pública", "coste", "consecuencia para acusado/aldea/grupo"],
      avoid: ["nuevas acciones normales", "postergar cierre sin causa"]
    },
    general: {
      must: ["acción resuelta por motor", "consecuencia concreta"],
      avoid: ["frases genéricas de motor"]
    }
  };
  return table[actionType];
}
