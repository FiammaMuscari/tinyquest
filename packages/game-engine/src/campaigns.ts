import type { Campaign, CampaignActionOption, ImprovisedStoryContent, StatName, WorldTheme } from "./types";

const campaignBgImages: Record<string, string> = {
  "dukes-last-mask": "/assets/campaigns/masked-duke.webp",
  "red-moon-killer": "/assets/campaigns/red-moon-killer.webp",
  "buried-crown": "/assets/campaigns/buried-crown.webp",
  "broken-oath-academy": "/assets/campaigns/broken-oath-academy.webp",
  "black-salt-pirates": "/assets/campaigns/black-salt-pirates.webp",
  "house-that-remembers": "/assets/campaigns/remembering-house.webp",
  "kitchen-moon": "/assets/campaigns/kitchen-moon.webp"
};

function option(
  id: string,
  label: string,
  category: CampaignActionOption["category"],
  recommendedStat: StatName,
  riskLevel: CampaignActionOption["riskLevel"],
  description: string,
  extra: Partial<CampaignActionOption> = {}
): CampaignActionOption {
  const riskDanger = riskLevel === "high" ? 2 : riskLevel === "medium" ? 1 : 0;
  return {
    id,
    label,
    category,
    intent: category === "escape" ? "flee" : category === "defend" ? "protect" : category === "create" ? "trick" : category,
    recommendedStat,
    allowedStats: [recommendedStat],
    riskLevel,
    description,
    possibleOutcomeHint: "Puede revelar pista, reducir peligro o abrir combate breve.",
    progressOnSuccess: riskLevel === "high" ? 1 : 0.75,
    dangerOnPartial: riskLevel === "high" ? 1 : 0,
    dangerOnFailure: Math.max(1, riskDanger),
    ...extra
  };
}

function campaign(input: Omit<Campaign, "durationMinutes" | "maxPlayers" | "recommendedPlayers" | "supportsSoloBots"> & { durationMinutes?: number }): Campaign {
  return { ...input, durationMinutes: input.durationMinutes ?? 15, maxPlayers: 4, recommendedPlayers: 1, supportsSoloBots: true };
}

export const campaigns: Campaign[] = [
  campaign({
    id: "dukes-last-mask",
    title: "La Última Máscara del Duque",
    genre: "misterio cortesano medieval",
    description: "Un duque cae muerto durante un baile; cada máscara oculta rostro, deseo y coartada.",
    storyHook: "Resolver el asesinato antes del último vals.",
    difficulty: "normal",
    recommendedStats: ["mind", "charm", "focus", "courage"],
    recommendedSkills: ["deducción", "diálogo", "duelo"],
    npcs: [{ id: "duchess", name: "Duquesa Viuda", description: "Elegante, furiosa y demasiado serena.", motive: "Proteger una alianza prohibida." }],
    enemies: [{ id: "swan-duelist", name: "Duelista del Cisne Negro", description: "Asesina de salón con estoque ritual.", vitality: 8, attackBonus: 3, defense: 13, dangerLevel: 2, weaknessStats: ["charm", "courage"], specialMove: "Desafío público" }],
    clues: [{ id: "mask-clue", text: "La máscara del duque fue cambiada antes del brindis." }],
    possibleEndings: [{ id: "truth", title: "Verdad en el vals", description: "El culpable queda expuesto sin romper la corte." }],
    legendaryPets: ["Sabueso del Umbral", "Polilla de Cripta"],
    rewards: [{ id: "silver-invite", name: "Invitación de Plata", description: "+1 narrativo en futuras cortes." }],
    imagePrompt: "Baile de máscaras medieval, veneno, cisnes negros, velas doradas, intriga romántica.",
    ambientSoundPrompt: "Vals lejano, copas, seda, susurros nobles, tensión contenida.",
    narratorGuidance: "Usa intriga elegante, romance peligroso y pistas limpias.",
    // BORRADOR editable: opciones de crisis a nivel campaña (aplican en cualquier escena si el peligro llega a crítico).
    crisisOptions: [
      { id: "crisis-mostrar-mascara", label: "Mostrar la máscara cambiada ante toda la corte", actionType: "revelar_prueba", riskLevel: "high", recommendedStats: ["courage", "mind"], requiredClues: ["mask-clue"], consequenceHints: { onSuccess: "La corte entera ve el cambio de máscara; ya no hay vuelta atrás.", onFailure: "La corte duda del grupo y el culpable gana tiempo." }, endingBias: { truth: 1 } },
      { id: "crisis-confrontar-duquesa", label: "Confrontar a la Duquesa Viuda con la máscara cambiada", actionType: "confrontar_npc", targetId: "duchess", targetKind: "npc", riskLevel: "high", recommendedStats: ["charm", "courage"], requiredClues: ["mask-clue"], requiredNpcs: ["duchess"], consequenceHints: { onSuccess: "La duquesa debe elegir entre su alianza prohibida y la verdad.", onFailure: "La duquesa cierra la corte al grupo." }, endingBias: { truth: 1 } },
      { id: "crisis-desarmar-duelista", label: "Desarmar a la Duelista del Cisne Negro antes del último vals", actionType: "combatir", targetId: "swan-duelist", targetKind: "creature", riskLevel: "high", recommendedStats: ["courage", "body"], consequenceHints: { onSuccess: "El estoque ritual cae y el salón queda sin arma.", onFailure: "El duelo se vuelve público y alguien más queda en peligro." } },
      { id: "crisis-proteger-duquesa", label: "Proteger a la Duquesa Viuda del estoque ritual", actionType: "proteger_aliado", targetId: "duchess", targetKind: "npc", riskLevel: "high", recommendedStats: ["body", "courage"], requiredNpcs: ["duchess"], consequenceHints: { onSuccess: "La duquesa queda a salvo y en deuda con el grupo.", onFailure: "El estoque encuentra otro blanco." }, endingBias: { mercy: 1 } },
      { id: "crisis-pactar-silencio", label: "Pactar silencio con la Duquesa Viuda a cambio de la verdad", actionType: "negociar", targetId: "duchess", targetKind: "npc", riskLevel: "medium", recommendedStats: ["charm", "mind"], requiredNpcs: ["duchess"], consequenceHints: { onSuccess: "La verdad completa a cambio de que un nombre no se pronuncie.", onFailure: "La duquesa usa la oferta como prueba de debilidad." }, endingBias: { mercy: 1, corruption: 1 } }
    ],
    scenes: [
      { id: "duke-ball", title: "El Baile de Máscaras", description: "El duque cae mientras todos aplauden.", objective: "Asegurar la primera pista.", allowedStats: ["mind", "charm", "focus", "courage"], difficulty: 12, clueIds: ["mask-clue"], npcIds: ["duchess"], imagePrompt: "salón dorado con máscaras", ambientSoundPrompt: "vals y susurros", multipleChoiceOptions: [option("inspect-mask", "Examinar la máscara", "investigate", "mind", "low", "Buscar veneno, magia o cambio de identidad."), option("question-duchess", "Interrogar a la duquesa", "talk", "charm", "medium", "Presionar sin causar escándalo."), option("challenge-duelist", "Aceptar el duelo", "fight", "courage", "high", "Forzar al asesino a moverse.")] },
      { id: "false-names", title: "El Salón de Nombres Falsos", description: "Los invitados intercambiaron identidades.", objective: "Separar coartadas reales de máscaras.", allowedStats: ["mind", "focus", "charm"], difficulty: 13, clueIds: ["mask-clue"], npcIds: ["duchess"], imagePrompt: "galería de retratos y espejos", ambientSoundPrompt: "pasos sobre mármol", multipleChoiceOptions: [option("compare-names", "Comparar nombres", "investigate", "focus", "medium", "Cruzar invitaciones con rostros."), option("dance-talk", "Bailar para obtener verdad", "talk", "charm", "medium", "Sacar una confesión entre pasos."), option("pet-scent", "Usar mascota", "pet", "luck", "low", "Seguir el rastro correcto.")] },
      { id: "last-dance", title: "El Último Baile", description: "El asesino intenta cerrar la noche.", objective: "Revelar culpable o pactar silencio.", allowedStats: ["mind", "charm", "courage"], difficulty: 15, clueIds: ["mask-clue"], npcIds: ["duchess"], enemyIds: ["swan-duelist"], hasCombat: true, imagePrompt: "duelo bajo arañas doradas", ambientSoundPrompt: "vals acelerado y acero", multipleChoiceOptions: [option("reveal-killer", "Revelar al culpable", "investigate", "mind", "medium", "Unir pistas ante todos."), option("final-duel", "Duelo final", "fight", "courage", "high", "Resolver con acero."), option("negotiate-truth", "Negociar la verdad", "talk", "charm", "medium", "Salvar a alguien sin mentir.")] }
    ]
  }),
  campaign({
    id: "red-moon-killer",
    title: "El Asesino de la Luna Roja",
    genre: "intriga urbana licántropa",
    tone: "tenso, político y moral",
    theme: "justicia contra ley en un mundo que criminaliza la naturaleza",
    description: "En la ciudad de Veldaran el Inspector Bran va a ejecutar a un licántropo inocente para enterrar sus propios crímenes. El grupo tiene horas para encontrar al testigo clandestino, robar el archivo y llegar al Tribunal antes de que la sentencia sea irreversible.",
    storyHook: "El Pacto de Plata promete juicio, pero alguien en la Guardia ya firmó la sentencia antes del amanecer.",
    durationMinutes: 25,
    energyMax: 6,
    difficulty: "normal",
    recommendedStats: ["mind", "courage", "charm", "focus"],
    recommendedSkills: ["investigación", "negociación", "combate de calle", "magia forense"],
    factions: [
      { id: "guardia-umbral", name: "Guardia del Umbral", agenda: "Mantener el monopolio mágico de la ciudad", pressure: "Patrullas selladas, registros bloqueados, mandatos de arresto rápidos" },
      { id: "mano-bronce", name: "La Mano de Bronce", agenda: "Proteger licántropos sin registro antes de que los cacen", pressure: "Silencio, rutas ocultas y desconfianza total a extraños" },
      { id: "casa-verano", name: "Casa Verano", agenda: "Usar este caso para ganar control sobre la Guardia", pressure: "Recursos, influencia política y condiciones propias" },
      { id: "senado-sellos", name: "Senado de Sellos", agenda: "Mantener la apariencia de juicio legal", pressure: "Quieren un culpable presentable antes del amanecer" }
    ],
    suspects: [
      { id: "nicolas-fierro", name: "Nicolás Fierro, guardia de noche", motive: "Estaba en la escena del crimen violando su permiso", secret: "Fue a ayudar a Issa a salir de la ciudad ilegalmente", suspicion: 5 },
      { id: "issa-mano", name: "Issa, joven sin registro", motive: "Fue vista huyendo de la escena como bestia", secret: "Vio a la verdadera asesina pero no puede testificar sin ser detenida", suspicion: 3 },
      { id: "casa-verano-suspect", name: "Agente de Casa Verano", motive: "Carvell investigaba sus cuentas", secret: "Tienen un agente que vigilaba a Carvell esa noche", suspicion: 2 },
      { id: "inspector-bran", name: "Inspector Bran", motive: "Carvell lo chantajeaba con un desfalco", secret: "Su agente Cora mató a Carvell por orden suya", suspicion: 1 }
    ],
    npcs: [
      { id: "nicolas-fierro", name: "Nicolás Fierro", description: "Licántropo registrado, guardia de noche para Casa Verano. Marca de plata en la muñeca izquierda, ahora rota. Mira el suelo cuando miente y el horizonte cuando tiene miedo.", motive: "Proteger a Issa sin exponer a la Mano de Bronce.", role: "acusado", fear: "Que ejecuten a Issa si ella testifica", desire: "Que alguien pruebe que las marcas no son suyas", appearsInScenes: ["cuartel-umbral", "muros-bajos", "archivo-veldaran", "tribunal-sello"], whatTheyKnow: ["No mató a Carvell", "Issa estuvo cerca esa noche", "Su marca se rompió cuando Cora lo empujó"], whatTheyHide: ["Estaba ayudando a Issa a cruzar la muralla ilegalmente"], relationshipToOtherNPCs: { "issa-mano": "La protege como a una hija desde que la Mano la recogió; mentiría en el tribunal antes que nombrarla" }, canDie: true },
      { id: "issa-mano", name: "Issa", description: "Dieciséis años, pelo corto quemado por magia propia, uñas con tinta de arco negro. Habla poco pero observa cada salida.", motive: "Sobrevivir sin que la Mano de Bronce pague su testimonio.", role: "testigo clandestino", fear: "Que la Guardia desmantele la red completa si testifica", desire: "Que Nicolás salga sin que ella tenga que aparecer", appearsInScenes: ["muros-bajos", "tribunal-sello"], whatTheyKnow: ["Vio a una mujer con capa verde matar a Carvell con un cuchillo recto", "La mujer tenía una marca de la Guardia en el antebrazo izquierdo"], whatTheyHide: ["Está aterrada de transformarse en público bajo presión"], canBetray: false },
      { id: "inspector-bran", name: "Inspector Bran", description: "Cincuenta años, uniforme impecable, manos que no sudan aunque la sala esté llena. Cuando sonríe, lo hace después de pensar si vale la pena.", motive: "Ejecutar a Nicolás antes de que aparezca el cuaderno de Carvell.", role: "antagonista principal", fear: "Que el cuaderno de Carvell llegue al Senado", desire: "Cerrar el caso esta noche y quemar el rastro mañana", appearsInScenes: ["cuartel-umbral", "archivo-veldaran", "tribunal-sello"], whatTheyKnow: ["Cora mató a Carvell", "El cuaderno de Carvell lo destruye", "El sello de la orden es falsificado"], whatTheyHide: ["Transfirió fondos de la Guardia a una cuenta privada desde hace tres años"], relationshipToOtherNPCs: { "keeper-tomas": "Sabe que Tomás lo vio entrar al archivo esa noche; lo mantiene callado a fuerza de miedo, no de pruebas" }, canBetray: true },
      { id: "mara-fierro", name: "Mara Fierro", description: "Partera de los muros bajos, lleva vendajes y navaja en el mismo bolsillo. Confía en el grupo exactamente hasta donde puede verificar.", motive: "Sacar a su marido vivo sin entregar a nadie de la Mano.", role: "aliada con condiciones", fear: "Que detengan a Nicolás mientras ella está fuera consiguiendo ayuda", desire: "Un testigo que no necesite exponerse para hablar", appearsInScenes: ["muros-bajos", "archivo-veldaran", "tribunal-sello"], whatTheyKnow: ["La ruta hacia la Mano de Bronce en los muros bajos", "Issa confía en ella"], whatTheyHide: ["Tiene una copia parcial del cuaderno de Carvell"], relationshipToOtherNPCs: { "issa-mano": "Le debe a Issa el aviso que salvó a Nicolás de la primera redada; paga esa deuda escondiéndola" } },
      { id: "keeper-tomas", name: "Tomás, Guardián del Registro", description: "Anciano con dedos manchados de sello azul. Trabaja en el archivo desde que la ciudad tenía otro nombre. Bran lo tiene asustado.", motive: "Cumplir su juramento al Registro aunque le cueste el puesto.", role: "aliado bajo presión", fear: "Que Bran lo acuse de complicidad si habla", desire: "Que alguien con autoridad le dé permiso para decir lo que sabe", appearsInScenes: ["cuartel-umbral", "archivo-veldaran", "tribunal-sello"], whatTheyKnow: ["El sello de emergencia fue usado tres horas después de que el Senado cerró"], whatTheyHide: ["Tiene un registro de cuando Bran entró al archivo esa noche"] },
      { id: "lena-subofficer", name: "Lena, Subofficer de la Guardia", description: "Treinta años, corte uniformada, un ojo más atento que el otro desde una herida vieja. Lleva semanas con dudas sobre Bran.", motive: "Que la Guardia no quede manchada por la ambición de un superior.", role: "aliada potencial", fear: "Actuar antes de tener prueba concreta y quedar sola", desire: "Que alguien le traiga lo que ella no puede buscar sin autorización", appearsInScenes: ["cuartel-umbral", "archivo-veldaran", "tribunal-sello"], whatTheyKnow: ["Bran firmó el mandato de arresto antes de investigar la escena"], whatTheyHide: ["Hizo una copia del acta original antes de que Bran la reemplazara"] },
      { id: "patrona-verano", name: "Patrona Verano", description: "Sesenta años, ropa de trabajo sobre joyas viejas, negocia como respira: siempre activa. Quiere el control de la Guardia, no el caos.", motive: "Usar el caso para exigir una reforma del sistema de nombramientos de inspectores.", role: "aliada con agenda propia", fear: "Que el escándalo salpique a Casa Verano antes de que ella lo use", desire: "La cabeza de Bran y un asiento en el comité de supervisión de la Guardia", appearsInScenes: ["archivo-veldaran", "tribunal-sello"], whatTheyKnow: ["Tiene financiadores en el Senado", "Carvell investigaba las cuentas de Bran"], whatTheyHide: ["Ella filtró información a Carvell para dañar a Bran"] }
    ],
    enemies: [
      { id: "guardia-bran", name: "Agentes de Bran", description: "Tres guardias leales a Bran personalmente, no al uniforme. Llevan plata líquida en frascos pequeños.", vitality: 9, attackBonus: 3, defense: 13, dangerLevel: 2, weaknessStats: ["courage", "charm"], specialMove: "Plata líquida: +2 daño contra licántropos presentes" },
      { id: "cora-sombra", name: "Cora la Sombra", description: "Agente secreta de Bran, treinta años, capa corta verde, cuchillo de línea recta. Aparece cuando el caso está a punto de cerrarse.", vitality: 7, attackBonus: 4, defense: 14, dangerLevel: 3, weaknessStats: ["mind", "focus"], specialMove: "Desaparecer: si falla, no vuelve en esa escena" }
    ],
    clues: [
      { id: "marca-rota", label: "Marca de plata rota por impacto", text: "La marca de plata de Nicolás se rompió por impacto físico, no por transformación. Una transformación derrite la plata; esta fue golpeada.", description: "Alguien empujó a Nicolás con fuerza suficiente para romper el sello, que cayó cerca del cadáver.", source: "Cuartel de la Guardia", sceneId: "cuartel-umbral", unlocksFlags: ["marca_rota_vista"], unlocksActions: ["comparar-marca"], suspectsAffected: [{ suspectId: "nicolas-fierro", suspicionChange: -3 }, { suspectId: "inspector-bran", suspicionChange: 1 }], endingImpact: ["nicolas-libre", "verdad-completa"] },
      { id: "mordida-falsa", label: "Herida de cuchillo, no de colmillo", text: "La herida principal en Carvell es de hoja recta de 15 centímetros. Un licántropo no deja ese borde limpio.", description: "El ataque de bestia fue una puesta en escena. Alguien mató con cuchillo y marcó por encima.", source: "Cadáver, cuartel de la Guardia", sceneId: "cuartel-umbral", unlocksFlags: ["herida_falsa_vista"], suspectsAffected: [{ suspectId: "nicolas-fierro", suspicionChange: -2 }, { suspectId: "issa-mano", suspicionChange: -1 }], endingImpact: ["nicolas-libre"] },
      { id: "bota-cora", label: "Huella de bota de Guardia femenina", text: "Una huella de bota femenina tamaño 37 con suela reglamentaria de la Guardia. Ningún agente registrado de ese turno usa ese número.", description: "Alguien con equipo de la Guardia estuvo en la escena y no figura en el turno oficial.", source: "Muros bajos, escena del crimen", sceneId: "muros-bajos", unlocksFlags: ["huella_cora_vista"], unlocksActions: ["identificar-cora"], suspectsAffected: [{ suspectId: "inspector-bran", suspicionChange: 2 }], endingImpact: ["verdad-completa"] },
      { id: "sello-falsificado", label: "Sello senatorial usado fuera de horario", text: "El sello de emergencia en la orden de ejecución fue impreso a las 2:47am. El Senado cierra a las 11pm.", description: "Alguien con acceso al sello real lo usó ilegalmente para fabricar una orden que parece legal.", source: "Cuartel, despacho de Bran", sceneId: "cuartel-umbral", unlocksFlags: ["sello_falso_visto"], unlocksActions: ["confrontar-bran-sello"], suspectsAffected: [{ suspectId: "inspector-bran", suspicionChange: 3 }], endingImpact: ["nicolas-libre", "bran-detenido"] },
      { id: "cuaderno-carvell", label: "Cuaderno de chantaje de Carvell", text: "El cuaderno de Carvell registra tres años de transferencias desde la Guardia del Umbral a una cuenta privada bajo autorización del Inspector Bran.", description: "Carvell lo usaba como protección. Cuando quiso más dinero, Bran mandó a Cora.", source: "Cuarto de Carvell, muros bajos", sceneId: "muros-bajos", unlocksFlags: ["cuaderno_encontrado"], suspectsAffected: [{ suspectId: "inspector-bran", suspicionChange: 4 }], endingImpact: ["bran-detenido", "verdad-completa"] },
      { id: "testimonio-issa", label: "Issa vio a Cora matar a Carvell", text: "Issa vio a una mujer con capa verde y marca de Guardia en el antebrazo izquierdo clavar un cuchillo a Carvell desde atrás, luego marcar la herida con una garra falsa.", description: "Testigo presencial del crimen real. No puede testificar sin revelar que existe sin registro.", source: "Issa, Mano de Bronce", sceneId: "muros-bajos", unlocksFlags: ["issa_habló"], suspectsAffected: [{ suspectId: "nicolas-fierro", suspicionChange: -5 }, { suspectId: "inspector-bran", suspicionChange: 3 }], endingImpact: ["nicolas-libre", "verdad-completa", "comunidad-expuesta"] },
      { id: "registro-bran-archivo", label: "Bran entró al archivo la noche del crimen", text: "El registro de acceso nocturno muestra que Bran entró al archivo a las 3:12am — después del reporte del cadáver pero antes de que el turno oficial comenzara.", description: "Fue al archivo antes que nadie para asegurarse de que no hubiera prueba física de su presencia en la escena.", source: "Archivo de Veldaran", sceneId: "archivo-veldaran", unlocksFlags: ["registro_bran_visto"], suspectsAffected: [{ suspectId: "inspector-bran", suspicionChange: 3 }], endingImpact: ["bran-detenido"] }
    ],
    possibleEndings: [
      { id: "verdad-completa", type: "good", title: "El sello no miente por siempre", description: "Bran detenido, Nicolás libre, Issa protegida con estatus temporal. El Pacto de Plata queda intacto pero con una nueva cláusula de supervisión.", requires: { confirmedClues: ["marca-rota", "sello-falsificado", "cuaderno-carvell"], dangerMax: 8 } },
      { id: "nicolas-libre", type: "bittersweet", title: "Un hombre libre, una sombra suelta", description: "Nicolás sale. Bran desaparece antes del tribunal. La Mano de Bronce sobrevive, pero Cora no fue atrapada.", requires: { confirmedClues: ["marca-rota", "mordida-falsa"], dangerMax: 9 } },
      { id: "bran-detenido", type: "good", title: "El inspector cae", description: "Bran es detenido con las pruebas del archivo. Nicolás libre. La Mano de Bronce paga el precio de la visibilidad.", requires: { confirmedClues: ["sello-falsificado", "cuaderno-carvell"], dangerMax: 9 } },
      { id: "comunidad-expuesta", type: "tragic", title: "La Mano se abre", description: "Issa testifica. Bran cae. La Mano de Bronce es desmantelada por el Senado. Algunos sobreviven, otros no.", requires: { confirmedClues: ["testimonio-issa"], dangerMax: 10 } },
      { id: "ejecucion-tragica", type: "tragic", title: "La sentencia firmada antes del amanecer", description: "Bran ejecuta a Nicolás antes de que llegue el grupo. El cuaderno de Carvell sigue circulando.", requires: { dangerMax: 10 } },
      { id: "verano-gana", type: "false", title: "La casa que sostiene el juicio", description: "Casa Verano protege a Nicolás, expone a Bran y toma el asiento de supervisión. Todo es legal, nada es justo.", requires: { dangerMax: 10 } },
      { id: "heroic-cost", type: "heroic", title: "El que cubre el paso", description: "Un compañero compra el tiempo necesario para que el testimonio llegue al tribunal.", requires: { dangerMax: 10 } }
    ],
    threats: [
      { id: "ejecucion-urgente", name: "Orden de ejecución de emergencia", pressure: "Bran tiene hasta el amanecer para ejecutar antes de que el Senado abra. Cada ronda es tiempo real.", escalatesWhen: "Fallos en el cuartel o en el archivo" },
      { id: "cazadores-bran", name: "Agentes de Bran en la ciudad", pressure: "Dos equipos rastreando cualquier pista que el grupo descubra", escalatesWhen: "Contacto con la Mano de Bronce o el archivo" }
    ],
    twists: [
      { id: "cora-marca", title: "La suela de la Guardia", trigger: "bota-cora", reveal: "La huella no es de Nicolás: es de alguien en activo dentro de la Guardia." },
      { id: "cuaderno-activo", title: "Carvell sabía", trigger: "cuaderno-carvell", reveal: "Carvell no fue asesinado por ser testigo: fue asesinado por ser chantajista." },
      { id: "sello-nocturno", title: "El Senado estaba cerrado", trigger: "sello-falsificado", reveal: "La ejecución fue diseñada para terminar antes de que alguien pudiera apelar legalmente." }
    ],
    graveConsequences: [
      "Nicolás puede ser ejecutado si el grupo llega tarde al tribunal.",
      "Issa puede ser detenida si testifica sin protección suficiente.",
      "La Mano de Bronce puede ser desmantelada si el tribunal exige nombrar fuentes.",
      "Cora puede escapar si el grupo no la intercepta en el tribunal.",
      "Mara puede quedar expuesta si Bran identifica que ella tiene parte del cuaderno."
    ],
    legendaryPets: ["Sabueso del Umbral", "Alma Dracónica"],
    rewards: [{ id: "red-moon-charm", name: "Amuleto de Luna Roja", description: "+1 narrativo contra maldiciones de sellos y pactos rotos." }],
    imagePrompt: "Ciudad amurallada medieval noche, cuartel mágico, archivo sellado, tribunal con sellos, intriga política.",
    ambientSoundPrompt: "Ciudad nocturna, patrullas, lluvia en adoquines, campanas de cuartel, documentos sellados.",
    narratorGuidance: "Español latino natural. Veldaran es una ciudad donde los licántropos son ciudadanos registrados bajo el Pacto de Plata, no monstruos. La Guardia del Umbral tiene autoridad sobre magia y seres registrados. La Mano de Bronce es una red de refugio clandestina, no un ejército. Bran es peligroso porque cree que tiene razón. Issa habla poco porque sabe que las palabras tienen precio. El Pacto de Plata es la ley: tenerlo o no no define quién es monstruo.",
    premise: "En Veldaran, el Inspector Bran va a ejecutar a Nicolás Fierro antes del amanecer. La orden está sellada pero es falsa. El grupo tiene horas para probarlo.",
    hiddenTruth: "Carvell chantajeaba a Bran con tres años de desfalco de la Guardia. Bran mandó a su agente Cora a matarlo y usó esa muerte para deshacerse también de Nicolás, cuya presencia en la escena fue accidental.",
    mainConflict: "Tiempo real contra sistema corrupto: cada ronda, Bran avanza en el proceso de ejecución mientras el grupo busca la prueba que lo destruye.",
    stakes: [
      "Nicolás puede morir esta noche si el grupo no llega al tribunal con pruebas.",
      "Issa puede quedar atrapada entre testificar y desaparecer.",
      "La Mano de Bronce sobrevive o cae según lo que el grupo decida revelar.",
      "Bran puede escapar si el caso se cierra sin nombrarlo directamente."
    ],
    timeline: [
      "23:00: Cora mata a Carvell. Nicolás, que estaba ayudando a Issa, huye y pierde su marca en el forcejeo.",
      "00:30: Bran llega a la escena, asegura el área y arresta a Nicolás antes de que exista orden oficial.",
      "02:47: Bran usa el sello senatorial robado para firmar una orden de ejecución de emergencia.",
      "06:00: El Senado abre. Si la ejecución ya ocurrió, es legal retroactivamente bajo el artículo de emergencia."
    ],
    backstory: "Bran lleva tres años desviando fondos de la Guardia. Carvell, un funcionario con acceso a los libros, lo descubrió y comenzó a cobrar silencio. Cuando Carvell pidió demasiado, Bran ordenó a Cora eliminarlo. Nicolás estuvo en el lugar incorrecto ayudando ilegalmente a Issa a cruzar el sector sellado de la muralla.",
    sceneFlow: ["El Cuartel del Umbral", "Los Muros Bajos", "El Archivo de Veldaran", "El Tribunal del Gran Sello"],
    possibleReveals: [
      "La marca de Nicolás no se rompió en una transformación: fue un impacto físico.",
      "Hay una huella de bota de la Guardia que no figura en ningún turno registrado.",
      "El sello de emergencia fue usado tres horas después del cierre oficial del Senado.",
      "Carvell tenía un cuaderno con tres años de transferencias firmadas por Bran.",
      "Issa vio a Cora matar a Carvell con un cuchillo y luego marcar la herida."
    ],
    moralDilemmas: [
      "Usar a Issa como testigo la protege a ella pero puede destruir la Mano de Bronce.",
      "Aceptar el trato de Casa Verano salva a Nicolás pero entrega control de la Guardia a otra casa con sus propios intereses.",
      "Exponer el desfalco de Bran destruye su carrera pero también revela irregularidades antiguas en la Guardia."
    ],
    failureStates: [
      "Bran ejecuta a Nicolás antes de que el tribunal abra.",
      "Cora destruye el cuaderno de Carvell antes de que el grupo lo saque.",
      "Issa es detenida cuando el grupo la lleva al tribunal sin protección.",
      "Bran huye antes del veredicto y Cora con él."
    ],
    endingConditions: {
      "verdad-completa": "Marca rota + sello falso + cuaderno + peligro máximo 8.",
      "nicolas-libre": "Marca rota + herida falsa. Bran escapa pero Nicolás sale.",
      "bran-detenido": "Sello falso + cuaderno. La Mano de Bronce paga visibilidad.",
      "comunidad-expuesta": "Testimonio de Issa sin protección suficiente.",
      "ejecucion-tragica": "Peligro crítico antes de llegar al tribunal.",
      "verano-gana": "Aceptar el trato de Patrona Verano en escena 3."
    },
    storyObjects: [
      { id: "marca-rota-object", name: "Marca de plata rota", type: "evidencia", description: "La marca de identificación del Pacto de Plata de Nicolás, partida por impacto.", location: "cuartel de la Guardia / muñeca de Nicolás", status: "found", relatedClues: ["marca-rota"], relatedNPCs: ["nicolas-fierro"], unlocksActions: ["comparar-marca"], unlocksEndings: ["nicolas-libre", "verdad-completa"], history: "Cayó cuando Cora empujó a Nicolás durante el forcejeo." },
      { id: "cuaderno-carvell-object", name: "Cuaderno de Carvell", type: "documento", description: "Libreta con tres años de registros de transferencias firmadas por Bran.", location: "cuarto de Carvell, muros bajos", status: "hidden", relatedClues: ["cuaderno-carvell"], relatedNPCs: ["inspector-bran"], unlocksActions: ["mostrar-cuaderno-senado"], unlocksEndings: ["verdad-completa", "bran-detenido"], history: "Carvell lo guardaba como póliza de seguro. Bran no sabe exactamente dónde está." },
      { id: "orden-falsificada-object", name: "Orden de ejecución de emergencia", type: "documento", description: "Mandato sellado con sello senatorial nocturno. La marca de tiempo contradice el horario oficial.", location: "despacho de Bran, cuartel", status: "hidden", relatedClues: ["sello-falsificado"], relatedNPCs: ["inspector-bran", "keeper-tomas"], unlocksActions: ["presentar-orden-tribunal"], unlocksEndings: ["nicolas-libre", "bran-detenido"], history: "Bran usó un sello sustraído para fabricar legalidad antes del amanecer." },
      { id: "bota-huella-object", name: "Molde de la huella de Cora", type: "evidencia", description: "Bota femenina, suela reglamentaria de la Guardia, talla 37. No figura en ningún turno oficial.", location: "muros bajos, escena del crimen", status: "hidden", relatedClues: ["bota-cora"], relatedNPCs: ["cora-sombra", "inspector-bran"], unlocksActions: ["identificar-cora"], unlocksEndings: ["verdad-completa"], history: "Cora la dejó sin darse cuenta de que el barro era demasiado fresco." },
      { id: "cadaver-carvell", name: "Cuerpo de Carvell", type: "evidencia", description: "El cadáver de Carvell antes de que la Guardia lo selle. La herida principal es de hoja recta de 15 centímetros, no de colmillo.", location: "cuartel de la Guardia", status: "found", relatedClues: ["mordida-falsa"], relatedNPCs: ["inspector-bran"], unlocksActions: ["inspeccionar-herida-carvell"], unlocksEndings: ["nicolas-libre"], history: "Cora mató a Carvell con cuchillo y marcó la herida con una garra falsa para incriminar a un licántropo." }
    ],
    // BORRADOR editable: consecuencias con sabor de campaña (cascada: este banco → default).
    consequenceBank: [
      { id: "lr-patrol", text: "Una patrulla de la Guardia del Umbral cambia su ruta: ahora pasa por donde el grupo necesita moverse.", match: { dangerBands: ["low", "medium"] }, effects: { dangerDelta: 1 } },
      { id: "lr-bran-clock", text: "Bran firma un papel más: el proceso de ejecución avanza un paso mientras el grupo pierde el suyo.", effects: { dangerDelta: 1 } },
      { id: "lr-mano-doubt", text: "Alguien de la Mano de Bronce ve al grupo actuar y reporta hacia adentro: la red ajusta sus salidas.", match: { actionTypes: ["interrogar_npc", "negociar", "mentir"] } },
      { id: "lr-seal-echo", text: "Un sello de registro queda incompleto: el rastro burocrático del grupo ahora existe y alguien puede leerlo.", match: { actionTypes: ["investigar_objeto", "comparar_evidencia", "usar_objeto"] } },
      { id: "lr-silver-cost", text: "La plata líquida de los guardias marca la ropa de alguien del grupo: los licántropos de la ciudad lo olerán.", match: { actionTypes: ["combatir", "proteger_aliado"] }, effects: { vitalityDelta: -1 } },
      { id: "lr-witness-fear", text: "Un testigo posible ve la escena y decide que testificar cuesta demasiado: una voz menos para el tribunal.", match: { outcomes: ["failure"] } },
      { id: "lr-cora-shadow", text: "Una capa verde aparece un instante al fondo y desaparece: Cora ya sabe dónde está el grupo.", match: { dangerBands: ["high", "critical"] }, effects: { dangerDelta: 1 } },
      { id: "lr-senate-hours", text: "El reloj del Senado marca una hora menos para el amanecer: lo que quede por probar tendrá menos tiempo.", match: { dangerBands: ["medium", "high", "critical"] } }
    ],
    // BORRADOR editable: opciones que las pistas desbloquean (CampaignClue.unlocksActions → este pool).
    unlockableOptions: [
      option("comparar-marca", "Comparar la marca rota con una marca derretida real", "investigate", "mind", "medium", "Pedir a Lena una marca retirada por transformación real y mostrar la diferencia de rotura.", { actionType: "comparar_evidencia", energyCost: 1, targetId: "marca-rota-object", targetKind: "object", objectId: "marca-rota-object", requiredClues: ["marca-rota"], unlocksFlags: ["marca_comparada"], progressOnSuccess: 1, exhausts: true }),
      option("confrontar-bran-sello", "Exigir a Bran el horario oficial del sello", "talk", "mind", "high", "Poner la marca de las 2:47am frente a Bran y pedirle que explique el horario ante testigos.", { actionType: "confrontar_npc", energyCost: 2, targetId: "inspector-bran", targetKind: "npc", npcId: "inspector-bran", requiredClues: ["sello-falsificado"], unlocksFlags: ["bran_presionado"], progressOnSuccess: 1.5, dangerOnFailure: 2, exhausts: true }),
      option("identificar-cora", "Buscar la talla 37 en el registro de equipamiento", "investigate", "focus", "medium", "Cruzar la huella con el registro de botas entregadas por la Guardia fuera de turno.", { actionType: "comparar_evidencia", energyCost: 1, targetId: "bota-huella-object", targetKind: "object", objectId: "bota-huella-object", requiredClues: ["bota-cora"], unlocksFlags: ["cora_identificada"], progressOnSuccess: 1, exhausts: true })
    ],
    causalLinks: [
      { cause: "marca-rota", effect: "nicolas-fierro", relation: "cleared", description: "La marca rota confirma que Nicolás no se transformó en la escena." },
      { cause: "sello-falsificado", effect: "inspector-bran", relation: "implicated", description: "El sello nocturno apunta directamente a quien tenía acceso al despacho del Senado." },
      { cause: "cuaderno-carvell", effect: "bran-detenido", relation: "unlocked", description: "El cuaderno cierra el caso contra Bran si llega al tribunal." },
      { cause: "testimonio-issa", effect: "verdad-completa", relation: "unlocked", description: "El testimonio de Issa es la única prueba presencial del crimen real." }
    ],
    scenes: [
      {
        id: "cuartel-umbral",
        title: "El Cuartel del Umbral",
        description: "Los cuarteles de la Guardia del Umbral huelen a sello frío y hierro limpio. Nicolás está detenido en el piso inferior en un cuarto de materiales, no en una celda oficial. Bran firma papeles arriba. La subofficer Lena mira los pasillos sin saber qué busca.",
        objective: "Encontrar la primera contradicción en el arresto antes de que Bran selle la orden.",
        dramaticObjective: "Convertir una detención ilegal en un expediente de duda pública.",
        mainConflict: "Tiempo contra burocracia: Bran sube la escalera con papeles mientras el grupo trabaja abajo.",
        location: "planta baja del cuartel de la Guardia del Umbral, Veldaran",
        timePressure: "Bran sella la orden de ejecución al final de ronda cuatro.",
        initialDanger: 2, maxDanger: 8, requiredProgress: 3,
        allowedStats: ["mind", "courage", "charm", "focus"],
        difficulty: 12,
        clueIds: ["marca-rota", "mordida-falsa", "sello-falsificado"],
        npcIds: ["nicolas-fierro", "lena-subofficer", "keeper-tomas"],
        imagePrompt: "cuartel mágico nocturno, pasillos sellados, prisionero en cuarto de materiales",
        ambientSoundPrompt: "pasos de guardia, lluvia, sello de documentos, respiración contenida",
        // BORRADOR editable: opciones de crisis de esta escena.
        crisisOptions: [
          { id: "crisis-sacar-nicolas-cuartel", label: "Sacar a Nicolás del cuarto de materiales antes de que Bran selle la orden", actionType: "proteger_aliado", targetId: "nicolas-fierro", targetKind: "npc", riskLevel: "high", recommendedStats: ["courage", "body"], requiredNpcs: ["nicolas-fierro"], consequenceHints: { onSuccess: "Nicolás sale del cuartel, pero ahora es un fugitivo oficial.", onFailure: "Bran acelera el traslado y aísla a Nicolás." }, endingBias: { mercy: 1, chaos: 1 } },
          { id: "crisis-confrontar-bran-sello", label: "Confrontar a Bran con el sello de las 2:47am", actionType: "confrontar_npc", targetId: "inspector-bran", targetKind: "npc", riskLevel: "high", recommendedStats: ["mind", "courage"], requiredClues: ["sello-falsificado"], requiredNpcs: ["inspector-bran"], consequenceHints: { onSuccess: "Bran entiende que el grupo sabe; el juego se vuelve directo.", onFailure: "Bran destruye la copia que el grupo tenía a mano." }, endingBias: { truth: 1 } },
          { id: "crisis-lena-frena-traslado", label: "Pedir a Lena que frene el traslado con su copia del acta", actionType: "negociar", targetId: "lena-subofficer", targetKind: "npc", riskLevel: "medium", recommendedStats: ["charm", "focus"], requiredFlags: ["lena_aliada"], requiredNpcs: ["lena-subofficer"], consequenceHints: { onSuccess: "Lena usa su autoridad y compra una ronda entera.", onFailure: "Lena queda marcada ante Bran y pierde acceso." }, endingBias: { truth: 1 } },
          { id: "crisis-bloquear-escalera", label: "Bloquear la escalera ante los guardias de Bran", actionType: "combatir", targetId: "guardia-bran", targetKind: "creature", riskLevel: "high", recommendedStats: ["body", "courage"], consequenceHints: { onSuccess: "Los guardias retroceden y el pasillo inferior queda libre.", onFailure: "La plata líquida sale de los frascos." } }
        ],
        multipleChoiceOptions: [
          option("examinar-marca-nicolas", "Examinar la marca de plata rota de Nicolás", "investigate", "mind", "low", "Comparar el tipo de rotura con lo que deja una transformación real versus un golpe físico.", { actionType: "investigar_objeto", energyCost: 0, targetId: "marca-rota-object", targetKind: "object", objectId: "marca-rota-object", unlocksClues: ["marca-rota"], unlocksFlags: ["marca_rota_vista"], progressOnSuccess: 1, dangerOnFailure: 1, successOutcome: { kind: "evidence_confirmed", clueId: "marca-rota", summary: "La marca de plata de Nicolás se rompió por impacto, no por transformación. Una transformación la derrite; esta fue golpeada.", visibleConsequence: "Lena se acerca a mirar sin pedir permiso. Algo en su cara cambia." }, partialOutcome: { kind: "evidence_partial", summary: "La rotura es rara pero el grupo necesita comparación directa para sostenerlo.", visibleConsequence: "Hace falta ver otra marca rota por transformación real para confirmar la diferencia." }, failureOutcome: { kind: "evidence_contaminated", summary: "Un guardia de Bran nota el examen y alerta arriba.", visibleConsequence: "Bran manda bajar a alguien para apurar el proceso." }, narrationHints: { mustMention: ["marca de plata", "Nicolás", "rotura"], mustNotMention: ["turba", "aldea", "bestia", "actúa sobre la escena"] , style: "examen forense, contraste físico"}, memoryImpact: "La marca de Nicolás fue examinada como evidencia de impacto.", exhausts: true }),
          option("hablar-lena", "Encontrar a Lena antes de que Bran la vea hablar", "talk", "charm", "medium", "Extraer lo que sospecha sin ponerla en peligro directo.", { actionType: "negociar", energyCost: 1, targetId: "lena-subofficer", targetKind: "npc", npcId: "lena-subofficer", unlocksClues: ["sello-falsificado"], unlocksFlags: ["lena_aliada"], progressOnSuccess: 1, dangerOnPartial: 1, dangerOnFailure: 2, successOutcome: { kind: "npc_confession", clueId: "sello-falsificado", summary: "Lena muestra la orden: el sello senatorial tiene marca de las 2:47am, tres horas después del cierre del Senado.", visibleConsequence: "Lena guarda la copia y dice que necesitan más antes de que ella se mueva." }, partialOutcome: { kind: "npc_evasion", summary: "Lena admite que algo no encaja pero exige una prueba concreta antes de comprometerse.", visibleConsequence: "Señala el archivo de acceso nocturno sin decirlo abiertamente." }, failureOutcome: { kind: "social_pressure", summary: "Un guardia de Bran pasa cerca y Lena cierra la conversación.", visibleConsequence: "Bran baja a verificar el estado del detenido." }, narrationHints: { mustMention: ["Lena", "sello", "orden"], mustNotMention: ["aldea", "turba", "bestia"] , style: "diálogo político velado"}, memoryImpact: "Lena fue contactada o se cerró antes de hablar.", exhausts: true }),
          option("hablar-nicolas", "Escuchar a Nicolás antes de que lo aíslen", "talk", "courage", "medium", "Entrar al cuarto de materiales y conseguir su versión.", { actionType: "interrogar_npc", energyCost: 1, expiresAfterRound: 3, targetId: "nicolas-fierro", targetKind: "npc", npcId: "nicolas-fierro", unlocksFlags: ["nicolas_habló", "issa_nombre_conocido"], progressOnSuccess: 1, dangerOnPartial: 1, dangerOnFailure: 2, successOutcome: { kind: "npc_confession", summary: "Nicolás cuenta que estaba ayudando a alguien sin registro a cruzar la muralla cuando Cora llegó y lo empujó. Vio a una mujer con capa verde alejarse.", visibleConsequence: "No dice el nombre de Issa pero dibuja el camino de los muros bajos con los dedos en el suelo." }, partialOutcome: { kind: "npc_evasion", summary: "Nicolás confirma que no mató a nadie pero no da nombres hasta que prometan proteger a quien lo llamó.", visibleConsequence: "Queda en silencio y mira hacia la pared norte." }, failureOutcome: { kind: "npc_closes_off", summary: "Un guardia interrumpe y mueve a Nicolás a otra sala.", visibleConsequence: "No hay segunda oportunidad de hablar con Nicolás hasta el tribunal." }, narrationHints: { mustMention: ["Nicolás", "cuarto", "capa verde"], mustNotMention: ["turba", "aldea", "bestia"] , style: "diálogo íntimo de cárcel"}, memoryImpact: "Nicolás habló o fue aislado antes de dar el nombre.", exhausts: true }),
          option("inspeccionar-herida-carvell", "Examinar el cuerpo de Carvell antes de que lo sellen", "investigate", "mind", "low", "Comparar la herida con lo que un ataque real de licántropo deja.", { actionType: "investigar_objeto", energyCost: 0, expiresAfterRound: 3, targetId: "cadaver-carvell", targetKind: "object", objectId: "cadaver-carvell", unlocksClues: ["mordida-falsa"], unlocksFlags: ["herida_falsa_vista"], progressOnSuccess: 1, dangerOnFailure: 1, successOutcome: { kind: "evidence_confirmed", clueId: "mordida-falsa", summary: "La herida principal es de hoja recta de 15 centímetros. Un licántropo no deja ese filo.", visibleConsequence: "El médico forense que estaba revisando se detiene y mira al grupo." }, partialOutcome: { kind: "evidence_partial", summary: "La herida parece de instrumento pero el barro cubre parte del borde.", visibleConsequence: "Hace falta una segunda comparación para sostenerlo ante el tribunal." }, failureOutcome: { kind: "evidence_contaminated", summary: "Un guardia cierra el área antes de que terminen.", visibleConsequence: "El cuerpo queda sellado y ya no puede examinarse." }, narrationHints: { mustMention: ["herida", "Carvell", "hoja"], mustNotMention: ["turba", "aldea", "bestia"] , style: "examen médico forense"}, memoryImpact: "La herida de Carvell fue o no fue examinada antes del cierre.", exhausts: true }),
          option("distraer-guardia-bran", "Sacar a los guardias de Bran del pasillo inferior", "defend", "courage", "medium", "Crear una distracción que abra el paso al cuarto de Nicolás.", { actionType: "mentir", energyCost: 1, targetId: "guardia-bran", targetKind: "creature", unlocksFlags: ["pasillo_libre"], progressOnSuccess: 0.5, dangerOnPartial: 1, dangerOnFailure: 2, successOutcome: { kind: "social_pressure", summary: "Los guardias salen. El grupo tiene tres minutos antes de que vuelvan.", visibleConsequence: "Lena aparece en el pasillo y cierra una puerta sin explicar por qué." }, partialOutcome: { kind: "social_pressure", summary: "Un guardia se queda pero mira para otro lado.", visibleConsequence: "El paso está libre solo si el grupo actúa rápido." }, failureOutcome: { kind: "npc_closes_off", summary: "Los guardias alertan a Bran.", visibleConsequence: "Bran baja personalmente y mueve a Nicolás a una sala sin ventanas." }, narrationHints: { mustMention: ["guardia", "pasillo", "distracción"], mustNotMention: ["turba", "aldea", "bestia"] , style: "tensión social y acción"}, exhausts: true })
        ]
      },
      {
        id: "muros-bajos",
        title: "Los Muros Bajos",
        description: "El sector sur de la muralla antigua esconde tres capas de construcción y una comunidad que no figura en ningún registro. La lluvia apaga faroles. Mara camina delante y no se da vuelta para comprobar si el grupo la sigue.",
        objective: "Encontrar a Issa y al cuaderno de Carvell antes de que los agentes de Bran los rastreen hasta aquí.",
        dramaticObjective: "Decidir cuánto de esta comunidad usar como herramienta y cuánto proteger como fin.",
        mainConflict: "Testimonio contra supervivencia: Issa puede cerrar el caso, pero hablar tiene un precio que no es solo suyo.",
        location: "sector sur de la muralla antigua, red de La Mano de Bronce",
        timePressure: "Los agentes de Bran llegan al final de ronda cuatro. Si están aquí, la red queda expuesta.",
        initialDanger: 3, maxDanger: 9, requiredProgress: 3,
        allowedStats: ["charm", "focus", "mind", "courage"],
        difficulty: 13,
        clueIds: ["bota-cora", "cuaderno-carvell", "testimonio-issa"],
        npcIds: ["issa-mano", "mara-fierro"],
        enemyIds: ["guardia-bran"],
        hasCombat: true,
        imagePrompt: "murallas antiguas nocturnas, red clandestina, refugio subterráneo, lluvia, desconfianza",
        ambientSoundPrompt: "pasos en piedra mojada, respiración contenida, lluvia en muralla, silencio de red clandestina",
        // BORRADOR editable: opciones de crisis de esta escena.
        crisisOptions: [
          { id: "crisis-cubrir-issa-tuneles", label: "Cubrir la retirada de Issa por los túneles de la Mano", actionType: "proteger_aliado", targetId: "issa-mano", targetKind: "npc", riskLevel: "high", recommendedStats: ["body", "focus"], requiredNpcs: ["issa-mano"], consequenceHints: { onSuccess: "Issa desaparece a salvo; la red conserva su testigo.", onFailure: "Un agente ve por dónde salió Issa." }, endingBias: { mercy: 1 } },
          { id: "crisis-esconder-cuaderno", label: "Esconder el cuaderno de Carvell antes del registro", actionType: "usar_objeto", targetId: "cuaderno-carvell-object", targetKind: "object", riskLevel: "medium", recommendedStats: ["focus", "creativity"], requiredClues: ["cuaderno-carvell"], consequenceHints: { onSuccess: "El cuaderno queda fuera del alcance de Bran.", onFailure: "El escondite improvisado deja una esquina visible." }, endingBias: { truth: 1 } },
          { id: "crisis-frenar-agentes-sur", label: "Frenar a los agentes de Bran en la entrada sur", actionType: "combatir", targetId: "guardia-bran", targetKind: "creature", riskLevel: "high", recommendedStats: ["courage", "body"], consequenceHints: { onSuccess: "La comunidad gana tiempo para cerrar tres salidas.", onFailure: "Un agente identifica rostros de la comunidad." } },
          { id: "crisis-copia-mara", label: "Pedirle a Mara su copia parcial del cuaderno", actionType: "negociar", targetId: "mara-fierro", targetKind: "npc", riskLevel: "medium", recommendedStats: ["charm", "mind"], requiredFlags: ["mano_confía"], requiredNpcs: ["mara-fierro"], consequenceHints: { onSuccess: "Mara entrega su seguro de vida a cambio de una promesa concreta.", onFailure: "Mara decide que el grupo pide más de lo que ofrece." }, endingBias: { truth: 1, sacrifice: 1 } }
        ],
        multipleChoiceOptions: [
          option("ganar-confianza-mano", "Convencer a La Mano de Bronce de que el grupo no es una trampa", "talk", "charm", "high", "Demostrar en acto, no en palabras, que van a proteger la comunidad.", { actionType: "negociar", energyCost: 2, targetId: "mara-fierro", targetKind: "npc", npcId: "mara-fierro", unlocksFlags: ["mano_confía", "issa_accesible"], progressOnSuccess: 1, dangerOnPartial: 1, dangerOnFailure: 3, successOutcome: { kind: "npc_confession", summary: "Mara lleva al grupo donde Issa espera. La comunidad no desaparece todavía.", visibleConsequence: "Tres personas que estaban escondidas aparecen en el umbral. Issa está entre ellas." }, partialOutcome: { kind: "social_pressure", summary: "Mara acepta llevarlos a Issa pero la comunidad se prepara para moverse si algo sale mal.", visibleConsequence: "Hay cuatro salidas abiertas que antes estaban cerradas." }, failureOutcome: { kind: "social_pressure", summary: "La red se cierra. Mara desaparece con Issa.", visibleConsequence: "El grupo queda en los muros bajos sin acceso. Los agentes de Bran están a ronda y media." }, narrationHints: { mustMention: ["Mara", "comunidad", "confianza"], mustNotMention: ["turba", "aldea", "bestia"] , style: "negociación en territorio ajeno"}, exhausts: true }),
          option("hablar-issa", "Pedirle a Issa que cuente lo que vio", "talk", "charm", "medium", "Escuchar sin presionar sobre cómo va a usarse su testimonio.", { actionType: "interrogar_npc", energyCost: 1, targetId: "issa-mano", targetKind: "npc", npcId: "issa-mano", requiredFlags: ["issa_accesible"], unlocksClues: ["testimonio-issa"], unlocksFlags: ["issa_habló"], progressOnSuccess: 1, dangerOnPartial: 1, dangerOnFailure: 2, successOutcome: { kind: "npc_confession", clueId: "testimonio-issa", summary: "Issa describe a Cora: capa verde corta, marca de Guardia en el antebrazo izquierdo, cuchillo de línea recta. La vio matar a Carvell y marcar la herida después.", visibleConsequence: "Issa pregunta si el grupo puede garantizar que ella no sea detenida. Espera una respuesta real." }, partialOutcome: { kind: "npc_evasion", summary: "Issa da la descripción de la capa pero no el detalle del cuchillo ni la marca de Guardia.", visibleConsequence: "Dice que hay más pero necesita ver que el grupo puede protegerla primero." }, failureOutcome: { kind: "npc_closes_off", summary: "Issa se cierra. El grupo oyó lo mínimo pero no lo suficiente para el tribunal.", visibleConsequence: "Mara dice que no vuelvan a preguntar esta noche." }, narrationHints: { mustMention: ["Issa", "capa verde", "cuchillo"], mustNotMention: ["turba", "aldea"] , style: "diálogo de testigo asustado"}, exhausts: true }),
          option("buscar-cuaderno-carvell", "Buscar el cuaderno de Carvell en su cuarto", "investigate", "focus", "medium", "Carvell alquilaba una habitación en esta red. Sus cosas siguen ahí.", { actionType: "investigar_objeto", energyCost: 1, targetId: "cuaderno-carvell-object", targetKind: "object", objectId: "cuaderno-carvell-object", requiredFlags: ["mano_confía"], unlocksClues: ["cuaderno-carvell"], unlocksFlags: ["cuaderno_encontrado"], progressOnSuccess: 1, dangerOnFailure: 1, successOutcome: { kind: "evidence_confirmed", clueId: "cuaderno-carvell", summary: "El cuaderno registra tres años de transferencias desde la Guardia a una cuenta bajo autorización de Bran.", visibleConsequence: "Mara mira la primera página y dice: 'Entonces sí era real.'" }, partialOutcome: { kind: "evidence_partial", summary: "El cuaderno está pero arrancaron las últimas páginas, las más recientes.", visibleConsequence: "Hay suficiente para crear duda pero no para cerrar el caso solo con esto." }, failureOutcome: { kind: "evidence_contaminated", summary: "Un agente de Bran ya estuvo aquí. El cuaderno no está.", visibleConsequence: "El peligro sube porque Bran sabe que la red existe." }, narrationHints: { mustMention: ["cuaderno", "Carvell", "transferencias"], mustNotMention: ["turba", "aldea"] , style: "búsqueda sigilosa nocturna"}, exhausts: true }),
          option("rastrear-huella-cora", "Seguir las huellas hasta el punto de entrada de Cora", "investigate", "mind", "medium", "El barro de los muros bajos no se seca en la noche de lluvia.", { actionType: "investigar_objeto", energyCost: 1, targetId: "bota-huella-object", targetKind: "object", objectId: "bota-huella-object", unlocksClues: ["bota-cora"], unlocksFlags: ["huella_cora_vista"], progressOnSuccess: 1, dangerOnFailure: 1, successOutcome: { kind: "evidence_confirmed", clueId: "bota-cora", summary: "Una huella de bota femenina tamaño 37 con suela reglamentaria de la Guardia. Ningún agente de ese turno usa ese número.", visibleConsequence: "Alguien de la comunidad dice que esa bota la vio pasar antes de la medianoche con alguien que no volvió." }, partialOutcome: { kind: "evidence_partial", summary: "La huella es de suela de Guardia pero la lluvia borró el tamaño exacto.", visibleConsequence: "Sirve para señalar dirección pero no para identificar a Cora directamente." }, failureOutcome: { kind: "evidence_contaminated", summary: "La lluvia borró la zona donde estaban las huellas.", visibleConsequence: "Esa ruta de evidencia se cierra." }, narrationHints: { mustMention: ["huella", "bota", "barro"], mustNotMention: ["turba", "aldea"] , style: "rastreo forense en lluvia"}, exhausts: true }),
          option("frenar-agentes-bran", "Enfrentar a los agentes de Bran que se acercan", "fight", "courage", "high", "Comprar tiempo para que la comunidad se mueva antes de que lleguen.", { actionType: "combatir", energyCost: 2, permanent: true, targetId: "guardia-bran", targetKind: "creature", unlocksFlags: ["agentes_detenidos"], dangerOnPartial: 1, dangerOnFailure: 3, progressOnSuccess: 0.5, successOutcome: { kind: "combat_shift", summary: "Los agentes retroceden. La comunidad tiene tiempo de cerrar tres salidas y reubicar a los más vulnerables.", visibleConsequence: "Issa mira al grupo de otra manera después de esto." }, partialOutcome: { kind: "combat_shift", summary: "Los agentes retroceden heridos pero llaman refuerzos.", visibleConsequence: "El peligro sube pero la comunidad ganó una hora." }, failureOutcome: { kind: "ally_harmed", summary: "Un agente identifica a dos personas de la comunidad antes de retroceder.", visibleConsequence: "Esas personas ya no pueden testificar en el tribunal sin riesgo." }, narrationHints: { mustMention: ["agentes", "combate", "muralla"], mustNotMention: ["turba", "aldea"] , style: "combate urbano nocturno"}, exhausts: false })
        ]
      },
      {
        id: "archivo-veldaran",
        title: "El Archivo de Veldaran",
        description: "El archivo central cierra a las once pero tiene un cuarto de consulta nocturna para la Guardia. Tomás trabaja ahí desde que la ciudad tenía otro nombre. Bran llega dentro de una hora para quemar lo que queda.",
        objective: "Conseguir el registro de acceso nocturno de Bran y la copia del acta sellada antes de que él los destruya.",
        dramaticObjective: "Elegir entre el trato de Patrona Verano y actuar solos con el tiempo que queda.",
        mainConflict: "Archivo cerrado contra tiempo real: si Bran llega primero, la evidencia desaparece.",
        location: "archivo central de Veldaran, cuarto de consulta nocturna",
        timePressure: "Bran llega al final de ronda tres con orden de incautación.",
        initialDanger: 5, maxDanger: 9, requiredProgress: 3,
        allowedStats: ["focus", "mind", "charm", "courage"],
        difficulty: 14,
        clueIds: ["registro-bran-archivo"],
        npcIds: ["keeper-tomas", "patrona-verano", "inspector-bran"],
        enemyIds: ["guardia-bran"],
        hasCombat: true,
        imagePrompt: "archivo nocturno sellado, documentos mágicos protegidos, cuarto de consulta, lluvia afuera",
        ambientSoundPrompt: "papel, sello de documentos, pasos en corredor, lluvia afuera",
        // BORRADOR editable: opciones de crisis de esta escena.
        crisisOptions: [
          { id: "crisis-salvar-copias", label: "Sacar las copias firmadas antes de que Bran queme el expediente", actionType: "usar_objeto", targetId: "orden-falsificada-object", targetKind: "object", riskLevel: "high", recommendedStats: ["focus", "body"], requiredFlags: ["tomas_aliado"], consequenceHints: { onSuccess: "Las copias con firma de Tomás salen del archivo.", onFailure: "Una copia se pierde en el fuego." }, endingBias: { truth: 1 } },
          { id: "crisis-proteger-tomas", label: "Interponerse entre Bran y el registro de Tomás", actionType: "proteger_aliado", targetId: "keeper-tomas", targetKind: "npc", riskLevel: "high", recommendedStats: ["courage", "body"], requiredNpcs: ["keeper-tomas"], consequenceHints: { onSuccess: "Tomás conserva el registro y el valor de usarlo.", onFailure: "Bran acusa a Tomás de complicidad delante de sus guardias." }, endingBias: { mercy: 1 } },
          { id: "crisis-aceptar-precio-verano", label: "Aceptar el precio de Patrona Verano para abrir el archivo ya", actionType: "tomar_decision_moral", targetId: "patrona-verano", targetKind: "npc", riskLevel: "medium", recommendedStats: ["charm", "mind"], requiredNpcs: ["patrona-verano"], consequenceHints: { onSuccess: "El archivo completo se abre; la deuda con Casa Verano queda firmada.", onFailure: "Verano sube el precio al ver la urgencia." }, endingBias: { corruption: 1 } },
          { id: "crisis-confrontar-bran-registro", label: "Confrontar a Bran con el registro de las 3:12am", actionType: "confrontar_npc", targetId: "inspector-bran", targetKind: "npc", riskLevel: "high", recommendedStats: ["mind", "courage"], requiredClues: ["registro-bran-archivo"], requiredNpcs: ["inspector-bran"], consequenceHints: { onSuccess: "Bran pierde el control del relato delante de Lena.", onFailure: "Bran incauta el registro con una orden en regla." }, endingBias: { truth: 1 } }
        ],
        multipleChoiceOptions: [
          option("convencer-tomas", "Convencer a Tomás de abrir el registro de acceso nocturno", "talk", "charm", "medium", "Darle permiso para decir lo que ya sabe, sin que él tenga que asumir la responsabilidad.", { actionType: "negociar", energyCost: 1, targetId: "keeper-tomas", targetKind: "npc", npcId: "keeper-tomas", unlocksClues: ["registro-bran-archivo"], unlocksFlags: ["registro_bran_visto", "tomas_aliado"], progressOnSuccess: 1, dangerOnPartial: 1, dangerOnFailure: 2, successOutcome: { kind: "npc_confession", clueId: "registro-bran-archivo", summary: "Tomás muestra el registro: Bran entró al archivo a las 3:12am, cuarenta minutos después del reporte del cadáver.", visibleConsequence: "Tomás hace dos copias y guarda una para sí mismo. Dice: Si esto sale mal, yo nunca estuve aquí." }, partialOutcome: { kind: "npc_evasion", summary: "Tomás abre el registro pero no firma la copia ni la certifica.", visibleConsequence: "La información está disponible pero sin firma de autoridad es más difícil de usar en tribunal." }, failureOutcome: { kind: "social_pressure", summary: "Tomás cierra el archivo. Bran lo llamó por adelantado.", visibleConsequence: "El archivo queda bloqueado y el peligro sube." }, narrationHints: { mustMention: ["Tomás", "registro", "archivo"], mustNotMention: ["turba", "aldea"] , style: "diálogo de conciencia bajo presión"}, exhausts: true }),
          option("copiar-orden-falsificada", "Sacar copia de la orden de ejecución del despacho de Bran", "investigate", "focus", "high", "El cuarto de Bran en el archivo tiene una copia del mandato.", { actionType: "investigar_objeto", energyCost: 2, targetId: "orden-falsificada-object", targetKind: "object", objectId: "orden-falsificada-object", requiredFlags: ["tomas_aliado"], unlocksFlags: ["orden_copiada"], progressOnSuccess: 1, dangerOnPartial: 1, dangerOnFailure: 2, successOutcome: { kind: "evidence_confirmed", summary: "La copia muestra el sello senatorial con marca de las 2:47am. El archivo de horas oficiales prueba que el Senado cerró a las 23:00.", visibleConsequence: "Tomás fecha y firma la copia como guardián del registro oficial." }, partialOutcome: { kind: "evidence_partial", summary: "La copia sale sin la firma de Tomás. Sirve como evidencia pero puede ser impugnada.", visibleConsequence: "El grupo tiene el papel pero no la autoridad de quien lo emite." }, failureOutcome: { kind: "evidence_contaminated", summary: "El cuarto de Bran tiene trampa mágica. La copia sale dañada.", visibleConsequence: "El peligro sube y Bran llega antes de lo esperado." }, narrationHints: { mustMention: ["orden", "sello", "Bran"], mustNotMention: ["turba", "aldea"] , style: "acción sigilosa en archivo"}, exhausts: true }),
          option("negociar-verano", "Aceptar el trato de Patrona Verano", "talk", "charm", "high", "Verano ofrece abrir el archivo completo a cambio de apoyo político en el Senado.", { actionType: "tomar_decision_moral", energyCost: 1, targetId: "patrona-verano", targetKind: "npc", npcId: "patrona-verano", unlocksFlags: ["verano_aliada", "archivo_abierto"], progressOnSuccess: 1.5, dangerOnPartial: 0, dangerOnFailure: 2, successOutcome: { kind: "moral_choice", summary: "Verano abre el archivo completo. Todo el expediente de Bran está disponible. El grupo acordó apoyar la reforma de supervisión de la Guardia.", visibleConsequence: "Verano dice: Lo que quieren está en el armario tres. Yo espero el resultado del tribunal." }, partialOutcome: { kind: "social_pressure", summary: "Verano abre parte del archivo pero exige una promesa más específica antes del tribunal.", visibleConsequence: "Tienen acceso parcial pero el trato todavía no está cerrado." }, failureOutcome: { kind: "social_pressure", summary: "Verano evalúa que el grupo no puede darle lo que quiere y se retira.", visibleConsequence: "El archivo queda cerrado y el grupo debe actuar solos." }, narrationHints: { mustMention: ["Verano", "supervisión", "archivo"], mustNotMention: ["turba", "aldea"] , style: "negociación política de alto costo"}, exhausts: true }),
          option("frenar-bran-archivo", "Interceptar a Bran antes de que destruya documentos", "fight", "courage", "high", "Bran llega temprano con guardias. Hay que comprarlo tiempo o sacarlo de la sala.", { actionType: "combatir", energyCost: 2, permanent: true, targetId: "guardia-bran", targetKind: "creature", unlocksFlags: ["bran_detenido_archivo"], dangerOnPartial: 1, dangerOnFailure: 3, progressOnSuccess: 1, successOutcome: { kind: "combat_shift", summary: "Bran retrocede. Los documentos están intactos. Tomás certifica lo que escuchó como testimonio oficial.", visibleConsequence: "Lena aparece en la puerta con una copia adicional." }, partialOutcome: { kind: "social_pressure", summary: "Bran es detenido pero destruye una página antes de salir.", visibleConsequence: "El expediente está incompleto pero todavía es funcional." }, failureOutcome: { kind: "social_pressure", summary: "Bran quema el cuaderno si el grupo lo tenía. Retrocede después.", visibleConsequence: "Una evidencia clave desaparece y el peligro llega a nivel crítico." }, narrationHints: { mustMention: ["Bran", "archivo", "documentos"], mustNotMention: ["turba", "aldea"] , style: "combate en corredor de archivo"}, exhausts: false })
        ]
      },
      {
        id: "tribunal-sello",
        title: "El Tribunal del Gran Sello",
        description: "La sala del Senado huele a cera antigua y presión sin nombre. Nicolás espera de pie en el centro. Bran está en el estrado. En las gradas: un mercader que perdió un cargamento por una alarma falsa de licántropo, una madre que no dejó dormir a sus hijos esta semana, un sacerdote que recita la Ley del Sello, un soldado retirado que conoce a Bran desde hace veinte años y lo mira sin parpadear.",
        objective: "Presentar las pruebas, proteger a los testigos y cerrar el caso antes de que el miedo colectivo vote antes que el juez.",
        dramaticObjective: "Elegir qué verdad presentar y a qué precio.",
        mainConflict: "Evidencia incompleta contra tiempo real: cada ronda que pasa sin veredicto le da a Bran una salida legal.",
        location: "sala del Senado de Sellos, Veldaran",
        timePressure: "La cuarta ronda fuerza sentencia definitiva.",
        initialDanger: 7, maxDanger: 10, requiredProgress: 4,
        isFinal: true,
        allowedStats: ["mind", "charm", "courage", "focus"],
        difficulty: 15,
        clueIds: ["marca-rota", "mordida-falsa", "sello-falsificado", "cuaderno-carvell", "testimonio-issa", "registro-bran-archivo"],
        npcIds: ["nicolas-fierro", "inspector-bran", "issa-mano", "mara-fierro", "keeper-tomas", "lena-subofficer", "patrona-verano"],
        enemyIds: ["cora-sombra"],
        hasCombat: true,
        imagePrompt: "tribunal de sellos medieval nocturno, estrado, público diverso, juzgado mágico bajo lluvia",
        ambientSoundPrompt: "sala grande, murmullo contenido, campana de orden, lluvia afuera",
        // BORRADOR editable: opciones de crisis de esta escena (final).
        crisisOptions: [
          { id: "crisis-confrontar-bran-tribunal", label: "Confrontar a Bran con el registro de las 3:12am ante el juez", actionType: "confrontar_npc", targetId: "inspector-bran", targetKind: "npc", riskLevel: "high", recommendedStats: ["mind", "courage"], requiredClues: ["registro-bran-archivo"], requiredNpcs: ["inspector-bran"], consequenceHints: { onSuccess: "El juez exige a Bran explicar qué hacía en el archivo antes de su turno.", onFailure: "Bran impugna la fuente y gana la ronda legal." }, endingBias: { truth: 1 } },
          { id: "crisis-sacar-nicolas-tribunal", label: "Sacar a Nicolás del estrado antes de la sentencia", actionType: "proteger_aliado", targetId: "nicolas-fierro", targetKind: "npc", riskLevel: "high", recommendedStats: ["body", "courage"], requiredNpcs: ["nicolas-fierro"], consequenceHints: { onSuccess: "Nicolás sale vivo, pero el caso queda sin cerrar.", onFailure: "La Guardia rodea la sala y el grupo queda del lado equivocado de la ley." }, endingBias: { mercy: 1, chaos: 1 } },
          { id: "crisis-cerrar-puerta-cora", label: "Cerrar la puerta lateral antes de que Cora escape", actionType: "cerrar_ruta", targetId: "cora-sombra", targetKind: "creature", riskLevel: "high", recommendedStats: ["focus", "body"], consequenceHints: { onSuccess: "Cora queda atrapada en la sala con el cuchillo encima.", onFailure: "Cora desaparece y no vuelve esta noche." }, endingBias: { truth: 1 } },
          { id: "crisis-escudar-issa", label: "Escudar a Issa mientras termina su testimonio", actionType: "proteger_aliado", targetId: "issa-mano", targetKind: "npc", riskLevel: "high", recommendedStats: ["body", "courage"], energyCost: 2, requiredFlags: ["issa_habló"], requiredNpcs: ["issa-mano"], consequenceHints: { onSuccess: "Issa termina de hablar y el juez registra cada palabra.", onFailure: "El testimonio queda a medias y el sacerdote lo objeta." }, endingBias: { sacrifice: 1, truth: 1 } },
          { id: "crisis-cuaderno-mesa", label: "Exigir el veredicto con el cuaderno de Carvell sobre la mesa", actionType: "revelar_prueba", targetId: "cuaderno-carvell-object", targetKind: "object", riskLevel: "high", recommendedStats: ["mind", "charm"], energyCost: 2, requiredClues: ["cuaderno-carvell"], consequenceHints: { onSuccess: "El Senado no puede fingir que las transferencias no existen.", onFailure: "Bran pide peritaje y compra la última ronda." }, endingBias: { truth: 1 } }
        ],
        multipleChoiceOptions: [
          option("presentar-evidencia-sello", "Presentar la orden falsificada ante el tribunal", "investigate", "mind", "medium", "Mostrar el sello con marca nocturna ante el juez antes de que Bran hable.", { actionType: "revelar_prueba", energyCost: 1, targetId: "orden-falsificada-object", targetKind: "object", requiredClues: ["sello-falsificado"], unlocksFlags: ["sello_presentado_tribunal"], progressOnSuccess: 2, dangerOnPartial: 0, dangerOnFailure: 2, successOutcome: { kind: "evidence_confirmed", summary: "El juez examina la marca de tiempo. Pide al Senado confirmar el horario de cierre oficial. Bran pierde el primer argumento.", visibleConsequence: "El mercader en las gradas deja de murmurar. El soldado retirado mira a Bran." }, partialOutcome: { kind: "social_pressure", summary: "El juez recibe la orden pero Bran impugna la cadena de custodia.", visibleConsequence: "El grupo necesita una segunda fuente que corrobore el sello." }, failureOutcome: { kind: "social_pressure", summary: "Bran argumenta que la copia fue alterada por el grupo.", visibleConsequence: "El peligro sube y la credibilidad del grupo queda cuestionada." }, narrationHints: { mustMention: ["orden", "sello", "tribunal"], mustNotMention: ["turba", "aldea", "bestia"] , style: "acusación formal ante tribunal"}, exhausts: true }),
          option("traer-issa-testigo", "Llevar a Issa a testificar con protección del grupo", "defend", "courage", "high", "Comprometer al grupo como escudo físico mientras Issa habla.", { actionType: "proteger_aliado", energyCost: 2, targetId: "issa-mano", targetKind: "npc", npcId: "issa-mano", requiredFlags: ["issa_habló"], unlocksFlags: ["issa_testificó"], progressOnSuccess: 2.5, dangerOnPartial: 1, dangerOnFailure: 3, successOutcome: { kind: "ally_protected", summary: "Issa testifica. Describe a Cora con precisión: capa verde, marca de Guardia, cuchillo recto. El juez registra.", visibleConsequence: "Cora intenta salir por la puerta lateral. Hay que decidir si alguien la sigue." }, partialOutcome: { kind: "social_pressure", summary: "Issa testifica pero el sacerdote objeta la validez de un testigo sin registro.", visibleConsequence: "El tribunal acepta el testimonio como evidencia circunstancial, no definitiva." }, failureOutcome: { kind: "ally_harmed", summary: "Cora está en la sala. Ataca a Issa antes de que empiece a hablar.", visibleConsequence: "El juez suspende la sesión. Issa sobrevive pero no puede testificar esta noche." }, narrationHints: { mustMention: ["Issa", "testimonio", "Cora"], mustNotMention: ["turba", "aldea"] , style: "protección bajo presión judicial"}, exhausts: true }),
          option("presentar-cuaderno-senado", "Presentar el cuaderno de Carvell al Senado", "investigate", "mind", "medium", "El cuaderno cierra el motivo de Bran si el tribunal lo acepta.", { actionType: "revelar_prueba", energyCost: 1, targetId: "cuaderno-carvell-object", targetKind: "object", requiredClues: ["cuaderno-carvell"], unlocksFlags: ["cuaderno_presentado"], progressOnSuccess: 2, dangerOnPartial: 0, dangerOnFailure: 1, successOutcome: { kind: "evidence_confirmed", summary: "El Senado reconoce la firma de Bran en las transferencias. El motivo queda registrado.", visibleConsequence: "Bran mira al soldado retirado y el soldado desvía la mirada por primera vez." }, partialOutcome: { kind: "social_pressure", summary: "El Senado acepta la evidencia pero Bran pide peritaje para verificar autenticidad.", visibleConsequence: "El peritaje puede demorar. Bran gana tiempo." }, failureOutcome: { kind: "social_pressure", summary: "Bran argumenta que el cuaderno fue fabricado por la defensa.", visibleConsequence: "El grupo pierde un turno respondiendo y el peligro sube." }, narrationHints: { mustMention: ["cuaderno", "Bran", "transferencias"], mustNotMention: ["turba", "aldea"] , style: "presentación de prueba al senado"}, exhausts: true }),
          option("interceptar-cora", "Interceptar a Cora cuando intenta escapar", "fight", "courage", "high", "La asesina real está en la sala. Si sale, el caso no se cierra.", { actionType: "combatir", energyCost: 3, permanent: true, targetId: "cora-sombra", targetKind: "creature", unlocksFlags: ["cora_detenida"], dangerOnPartial: 1, dangerOnFailure: 2, progressOnSuccess: 1, successOutcome: { kind: "combat_shift", summary: "Cora es detenida. Tiene el cuchillo en la capa. La bota coincide con la huella. Lena la registra oficialmente.", visibleConsequence: "Bran deja de hablar. El juez pide silencio y la sala escucha el sonido de alguien que entendió que perdió." }, partialOutcome: { kind: "social_pressure", summary: "Cora es herida pero escapa por la puerta lateral. El cuchillo queda en el suelo.", visibleConsequence: "El cuchillo como evidencia entra al expediente aunque Cora no esté." }, failureOutcome: { kind: "social_pressure", summary: "Cora escapa. El caso puede cerrarse igual pero el culpable real está libre.", visibleConsequence: "El tribunal falla a favor del grupo pero Cora puede volver." }, narrationHints: { mustMention: ["Cora", "cuchillo", "escape"], mustNotMention: ["turba vaga", "aldea"] , style: "combate de captura en sala cerrada"}, exhausts: false }),
          option("hablar-al-publico", "Hablar directamente a las personas en las gradas", "talk", "charm", "medium", "El mercader, la madre, el sacerdote y el soldado votan su miedo si nadie les habla antes.", { actionType: "tomar_decision_moral", energyCost: 1, targetId: "senado-sellos", targetKind: "faction", unlocksFlags: ["publico_escuchó"], progressOnSuccess: 2, dangerOnPartial: 0, dangerOnFailure: 1, successOutcome: { kind: "social_pressure", summary: "La madre pregunta por qué Nicolás estaba ahí. El grupo le responde. Ella dice: si fue a ayudar a alguien como eso, yo tampoco llamaría a la Guardia. El mercader asiente.", visibleConsequence: "El miedo colectivo no desaparece pero tiene ahora una cara humana en frente." }, partialOutcome: { kind: "social_pressure", summary: "El sacerdote objeta pero el soldado pide silencio. El debate público abre espacio para el veredicto.", visibleConsequence: "El juez puede decidir sin unanimidad del público." }, failureOutcome: { kind: "social_pressure", summary: "El mercader interrumpe y acusa al grupo de ser cómplices.", visibleConsequence: "El tribunal pide que el grupo no hable hasta su turno oficial." }, narrationHints: { mustMention: ["gradas", "Pacto de Plata", "miedo"], mustNotMention: ["turba vaga", "aldea"] , style: "discurso moral ante gradas"}, exhausts: true })
        ]
      }
    ]  }),
  campaign({
    id: "buried-crown",
    title: "La Corona Enterrada",
    genre: "caza de tesoro maldito",
    description: "Un mapa antiguo guía hacia una corona que elige quién merece gobernar.",
    storyHook: "Llegar al tesoro antes de que lo reclame una traición.",
    difficulty: "normal",
    recommendedStats: ["creativity", "mind", "body", "luck"],
    recommendedSkills: ["trampas", "ruinas", "pacto"],
    npcs: [{ id: "ghost-mapmaker", name: "Cartógrafa Fantasma", description: "Dibuja mapas que mienten.", motive: "Evitar que la corona despierte." }],
    enemies: [{ id: "stone-guardian", name: "Guardián de Piedra", description: "Estatua real con ojos de oro.", vitality: 12, attackBonus: 4, defense: 14, dangerLevel: 3, weaknessStats: ["creativity", "body"], specialMove: "Pisada sísmica" }],
    clues: [{ id: "lying-map", text: "El mapa cambia ante quien desea demasiado poder." }],
    possibleEndings: [{ id: "crown-refused", title: "Corona rechazada", description: "El grupo salva el reino al no tomarla." }],
    legendaryPets: ["Polilla de Cripta", "Alma Dracónica"],
    rewards: [{ id: "crown-shard", name: "Esquirla de Corona", description: "+1 narrativo al resistir ambición." }],
    imagePrompt: "Ruinas, mapa luminoso, corona bajo piedra, trampas doradas.",
    ambientSoundPrompt: "Arena, mecanismos, gemas vibrando, viento en ruinas.",
    narratorGuidance: "Usa aventura, ambición y trampas claras.",
    // BORRADOR editable: opciones de crisis a nivel campaña.
    crisisOptions: [
      { id: "crisis-rechazar-corona", label: "Rechazar la corona frente al Guardián de Piedra", actionType: "tomar_decision_moral", riskLevel: "high", recommendedStats: ["courage", "mind"], consequenceHints: { onSuccess: "La corona pierde poder sobre quien la rechaza en voz alta.", onFailure: "La ambición de alguien del grupo queda expuesta." }, endingBias: { sacrifice: 1, truth: 1 } },
      { id: "crisis-romper-mapa", label: "Romper el mapa que miente antes de que elija por el grupo", actionType: "usar_objeto", riskLevel: "high", recommendedStats: ["creativity", "focus"], requiredClues: ["lying-map"], consequenceHints: { onSuccess: "Sin mapa no hay guía, pero tampoco hay engaño.", onFailure: "El mapa se defiende y redibuja la salida." }, endingBias: { chaos: 1 } },
      { id: "crisis-proteger-cartografa", label: "Proteger a la Cartógrafa Fantasma del derrumbe", actionType: "proteger_aliado", targetId: "ghost-mapmaker", targetKind: "npc", riskLevel: "high", recommendedStats: ["body", "courage"], requiredNpcs: ["ghost-mapmaker"], consequenceHints: { onSuccess: "La cartógrafa revela el trazo verdadero como agradecimiento.", onFailure: "Su último mapa queda incompleto." }, endingBias: { mercy: 1 } },
      { id: "crisis-frenar-guardian", label: "Detener la pisada sísmica del Guardián de Piedra", actionType: "combatir", targetId: "stone-guardian", targetKind: "creature", riskLevel: "high", recommendedStats: ["body", "creativity"], consequenceHints: { onSuccess: "El guardián se detiene con un ojo de oro apagado.", onFailure: "La ruina entera empieza a ceder." } }
    ],
    scenes: [
      { id: "lying-map", title: "El Mapa que Miente", description: "El pergamino cambia rutas según quien lo mira.", objective: "Leer el mapa sin obedecerlo.", allowedStats: ["mind", "creativity", "luck"], difficulty: 12, clueIds: ["lying-map"], npcIds: ["ghost-mapmaker"], imagePrompt: "mapa mágico en ruinas", ambientSoundPrompt: "papel y arena", multipleChoiceOptions: [option("read-map", "Leer entre mentiras", "investigate", "mind", "low", "Encontrar ruta real."), option("redraw-map", "Redibujar la ruta", "create", "creativity", "medium", "Engañar al mapa."), option("follow-instinct", "Seguir instinto", "escape", "luck", "medium", "Evitar una trampa.")] },
      { id: "ruined-gate", title: "La Puerta Derrumbada", description: "La entrada exige fuerza o ingenio.", objective: "Entrar sin despertar toda la ruina.", allowedStats: ["body", "creativity", "focus"], difficulty: 13, clueIds: ["lying-map"], npcIds: ["ghost-mapmaker"], enemyIds: ["stone-guardian"], hasCombat: true, imagePrompt: "puerta antigua con guardian", ambientSoundPrompt: "piedra y engranajes", multipleChoiceOptions: [option("lift-stone", "Levantar la losa", "fight", "body", "medium", "Abrir paso."), option("disable-runes", "Desactivar runas", "magic", "focus", "medium", "Silenciar la ruina."), option("pet-scout", "Enviar mascota", "pet", "luck", "low", "Encontrar hueco seguro.")] },
      { id: "crowns-trial", title: "El Juicio de la Corona", description: "El tesoro prueba a quien lo toca.", objective: "Decidir tomar, romper o sellar la corona.", allowedStats: ["mind", "charm", "courage"], difficulty: 15, clueIds: ["lying-map"], npcIds: ["ghost-mapmaker"], imagePrompt: "cripta con corona dorada", ambientSoundPrompt: "coro bajo y oro", multipleChoiceOptions: [option("refuse-crown", "Rechazar la corona", "defend", "courage", "medium", "Vencer tentación."), option("question-crown", "Interrogar la reliquia", "talk", "charm", "medium", "Saber qué quiere."), option("break-curse", "Romper la maldición", "magic", "mind", "high", "Liberar el tesoro.")] }
    ]
  })
];

const extraCampaigns: Campaign[] = [
  ["broken-oath-academy", "La Academia de los Juramentos Rotos", "academia encantada", "Un examen mágico se defiende solo y un profesor estatua acusa a un estudiante.", "El Examen que se Defiende Solo"],
  ["black-salt-pirates", "Los Piratas de Sal Negra", "piratas y tesoro maldito", "Un motín al amanecer revela un mapa dentro de una botella viva.", "El Motín del Amanecer"],
  ["house-that-remembers", "La Casa que Recuerda", "casa embrujada", "Una puerta conoce tu nombre y la familia muerta prepara la mesa.", "La Puerta que Sabía tu Nombre"],
  ["kitchen-moon", "La Cocina Lunar", "cozy fantasy surreal", "Una cocina imposible en la luna esconde un misterio breve y absurdo.", "La Sopa Ascendente"]
].map(([id, title, genre, description, first]) => campaign({
  id,
  title,
  genre,
  description,
  storyHook: {
    "broken-oath-academy": "Descubrir quién rompió el examen antes de que la escuela convierta a otro estudiante en estatua.",
    "black-salt-pirates": "Sostener el motín hasta saber quién escondió el mapa dentro de una botella viva.",
    "house-that-remembers": "Entrar en la casa familiar sin permitir que use recuerdos como cerraduras.",
    "kitchen-moon": "Resolver el misterio lunar antes de que la cocina cierre sus puertas imposibles."
  }[id] ?? "Resolver la verdad antes de que el peligro escale.",
  difficulty: "easy",
  recommendedStats: ["mind", "creativity", "charm", "luck"],
  recommendedSkills: ["investigación", "magia", "mascota"],
  npcs: [{
    id: `${id}-npc`,
    name: {
      "broken-oath-academy": "Iria del Tintero Sellado",
      "black-salt-pirates": "Capitana Mora Salnegra",
      "house-that-remembers": "Tía Elvira de la Puerta Norte",
      "kitchen-moon": "Maestre Cucharón de Plata"
    }[id] ?? "Vigía de la Escena",
    description: {
      "broken-oath-academy": "Archivista que conoce qué juramentos fueron alterados.",
      "black-salt-pirates": "Capitana depuesta que aún controla media tripulación.",
      "house-that-remembers": "Pariente muerta que recuerda secretos con demasiado detalle.",
      "kitchen-moon": "Cocinero astral que niega haber cambiado la receta."
    }[id] ?? "Persona ligada al centro del misterio.",
    motive: {
      "broken-oath-academy": "Evitar que el rectorado oculte una expulsión antigua.",
      "black-salt-pirates": "Recuperar el mando sin entregar el mapa.",
      "house-that-remembers": "Mantener un nombre familiar fuera de la mesa.",
      "kitchen-moon": "Proteger una receta que mantiene abierta la cocina lunar."
    }[id] ?? "Sobrevivir a la escena."
  }],
  enemies: [{
    id: `${id}-enemy`,
    name: {
      "broken-oath-academy": "Examinador de Piedra",
      "black-salt-pirates": "Contramaestre del Ancla Hueca",
      "house-that-remembers": "El Retrato Hambriento",
      "kitchen-moon": "Horno de Medianoche"
    }[id] ?? "Amenaza de Campaña",
    description: {
      "broken-oath-academy": "Estatua que corrige errores con castigos reales.",
      "black-salt-pirates": "Oficial amotinado que vende lealtad al mejor postor.",
      "house-that-remembers": "Cuadro familiar que borra nombres de quienes mienten.",
      "kitchen-moon": "Fuego vivo que cocina recuerdos si nadie lo apaga."
    }[id] ?? "Amenaza ligada al conflicto.",
    vitality: 8,
    attackBonus: 2,
    defense: 12,
    dangerLevel: 2,
    weaknessStats: ["mind", "creativity"],
    specialMove: {
      "broken-oath-academy": "Convertir error en estatua",
      "black-salt-pirates": "Orden de abordaje",
      "house-that-remembers": "Borrar un recuerdo",
      "kitchen-moon": "Encender el hervor lunar"
    }[id] ?? "Escalar peligro"
  }],
  clues: [{
    id: `${id}-clue`,
    text: {
      "broken-oath-academy": "El examen contiene una firma de profesor borrada del registro.",
      "black-salt-pirates": "El mapa dentro de la botella fue dibujado después del motín, no antes.",
      "house-that-remembers": "La puerta sabe nombres que la familia juró no pronunciar.",
      "kitchen-moon": "La receta lunar fue alterada para cerrar una salida antigua."
    }[id] ?? "Una prueba contradice la versión pública."
  }],
  possibleEndings: [{
    id: `${id}-ending`,
    title: {
      "broken-oath-academy": "El juramento reescrito",
      "black-salt-pirates": "La marea elige capitán",
      "house-that-remembers": "La mesa deja un lugar vacío",
      "kitchen-moon": "La receta abre la puerta"
    }[id] ?? "Verdad resuelta",
    description: {
      "broken-oath-academy": "La academia acepta la culpa o sacrifica su prestigio.",
      "black-salt-pirates": "El mapa queda en manos de quien pagó el precio correcto.",
      "house-that-remembers": "La casa devuelve un recuerdo y se queda con otro.",
      "kitchen-moon": "La cocina lunar permite salir, pero conserva un secreto."
    }[id] ?? "El misterio se cierra con una consecuencia clara."
  }],
  legendaryPets: ["Alma Dracónica", "Polilla de Cripta", "Sabueso del Umbral"],
  rewards: [{ id: `${id}-reward`, name: "Marca de Aventura", description: "+1 narrativo cuando el tema vuelva a aparecer." }],
  imagePrompt: `${genre}, fantasía narrativa, escena legible de tablero.`,
  ambientSoundPrompt: `${genre}, loop breve, misterio cálido, tensión ligera.`,
  narratorGuidance: "Mantén narración española breve, dinámica y fiel a esta campaña.",
  scenes: [
    { id: `${id}-scene-1`, title: first, description, objective: "Asegurar la primera pista.", allowedStats: ["mind", "creativity", "charm", "luck"], difficulty: 12, clueIds: [`${id}-clue`], npcIds: [`${id}-npc`], imagePrompt: `${first}, ${genre}`, ambientSoundPrompt: `${genre}, inicio`, multipleChoiceOptions: [option(`${id}-inspect`, "Investigar la pista", "investigate", "mind", "low", "Buscar contradicciones."), option(`${id}-talk`, "Hablar con el testigo", "talk", "charm", "medium", "Sacar motivo."), option(`${id}-pet`, "Usar mascota", "pet", "luck", "low", "Detectar lo invisible.")] },
    { id: `${id}-scene-2`, title: "La Verdad Torcida", description: "La pista abre una amenaza.", objective: "Evitar que el culpable cambie la historia.", allowedStats: ["focus", "mind", "courage"], difficulty: 13, clueIds: [`${id}-clue`], npcIds: [`${id}-npc`], enemyIds: [`${id}-enemy`], hasCombat: true, imagePrompt: `${genre}, tensión`, ambientSoundPrompt: `${genre}, peligro`, multipleChoiceOptions: [option(`${id}-defend`, "Defender la pista", "defend", "courage", "medium", "Bajar daño o peligro."), option(`${id}-fight`, "Enfrentar la amenaza", "fight", "body", "high", "Combate breve."), option(`${id}-magic`, "Usar magia o ingenio", "magic", "creativity", "medium", "Cambiar la escena.")] },
    { id: `${id}-scene-3`, title: "La Decisión Final", description: "La mesa decide qué hacer con la verdad.", objective: "Cerrar el misterio.", allowedStats: ["mind", "charm", "courage"], difficulty: 15, clueIds: [`${id}-clue`], npcIds: [`${id}-npc`], imagePrompt: `${genre}, final`, ambientSoundPrompt: `${genre}, final`, multipleChoiceOptions: [option(`${id}-reveal`, "Revelar la verdad", "investigate", "mind", "medium", "Final claro."), option(`${id}-negotiate`, "Negociar consecuencia", "talk", "charm", "medium", "Final compasivo."), option(`${id}-risk`, "Tomar un riesgo final", "defend", "courage", "high", "Final audaz.")] }
  ]
}));

campaigns.push(...extraCampaigns);

type NarrativeSeed = {
  id: string;
  title: string;
  genre: string;
  description: string;
  storyHook: string;
  themeSkill: string;
  scenes: string[];
};

const narrativeSeeds: NarrativeSeed[] = [
  { id: "luna-roja", title: "El Asesino de la Luna Roja", genre: "intriga urbana licántropa", description: "En Veldaran, la ciudad de los sellos, el Inspector Bran va a ejecutar a un licántropo inocente para enterrar su propio crimen. El grupo tiene horas para encontrar al testigo clandestino, robar el archivo y llegar al Tribunal antes del amanecer.", storyHook: "El sello de la sentencia todavía está húmedo cuando una huella imposible aparece junto al cadáver.", themeSkill: "investigación", scenes: ["El Cuartel del Umbral", "Los Muros Bajos", "El Archivo de Veldaran", "El Tribunal del Gran Sello"] },
  { id: "conde-vampiro", title: "La Cena del Conde Vacío", genre: "mansión gótica y sangre familiar", description: "Después de treinta inviernos a oscuras, la mansión del conde enciende una vela en cada ventana y sirve seis platos calientes en un comedor cubierto de polvo. El sexto lleva el nombre de alguien que todavía no ha llegado.", storyHook: "Entrar antes de que el último invitado ocupe la silla reservada y la casa cierre sus puertas.", themeSkill: "negociación peligrosa", scenes: ["El Portón de la Mansión", "El Salón de los Retratos", "La Cripta de Sangre", "La Cena del Conde Vacío"] },
  { id: "bosque-embrujado", title: "El Bosque que Recuerda tu Nombre", genre: "bosque embrujado y pacto roto", description: "Cada sendero devuelve a los viajeros al mismo fresno, donde sus nombres aparecen recién tallados en la corteza. Entre las raíces, una voz perdida ofrece la salida a cambio de que alguien recuerde el juramento que el valle decidió olvidar.", storyHook: "Encontrar el nombre que falta en el fresno antes de entregar un recuerdo propio al bosque.", themeSkill: "supervivencia", scenes: ["El Sendero que Cambia", "El Claro de los Nombres", "La Casa Bajo las Raíces", "El Corazón del Bosque"] },
  { id: "reliquias-alba-negra", title: "Las Siete Reliquias del Alba Negra", genre: "reliquias sagradas y orden rota", description: "Siete relicarios robados repican desde lugares distintos a la misma hora, y cada campanada apaga una lámpara del santuario. La orden encargada de recuperarlos es también la única que conoce el rito capaz de consagrarlos al revés.", storyHook: "Seguir el sonido de los relicarios y decidir cuál de sus guardianes todavía merece confianza.", themeSkill: "ritual", scenes: ["El Santuario Saqueado", "El Mercado de Reliquias Falsas", "La Cripta del Primer Portador", "El Altar del Alba Negra"] },
  { id: "escuela-no-amanece", title: "La Escuela que No Amanece", genre: "academia encantada y noche repetida", description: "La campana de medianoche suena por séptima vez y los pupitres de los alumnos desaparecidos vuelven a aparecer tibios, con tinta fresca en los cuadernos. Solo una maestra nota que cada repetición deja un nombre menos en el registro.", storyHook: "Romper la noche antes de que el registro borre al último alumno capaz de recordar la mañana.", themeSkill: "memoria", scenes: ["El Aula de las Velas", "El Pasillo que Repite", "La Biblioteca Cerrada", "El Examen de Medianoche"] },
  { id: "isla-devora-mapas", title: "La Isla que Devora Mapas", genre: "piratas y geografía imposible", description: "La tinta se desprende de las cartas náuticas apenas la isla toca el horizonte, y la costa cambia de forma con cada ola. En la bodega, un cofre sin cerradura respira al ritmo del capitán y espera que alguien trace una ruta usando algo más valioso que tinta.", storyHook: "Cartografiar una salida antes de que la isla borre también los recuerdos del camino de regreso.", themeSkill: "cartografía", scenes: ["La Costa sin Norte", "El Barco Encallado", "La Cueva de las Mareas", "El Tesoro que Respira"] },
  { id: "castillo-culpa", title: "El Castillo que Heredó la Culpa", genre: "castillo maldito y linaje culpable", description: "Cuando el último heredero cruza el puente, los escudos del gran salón giran para mirar el suelo y las puertas se sellan con barro del valle. Una campana bajo la torre exige que la familia nombre a quién sacrificó para conservar sus muros.", storyHook: "Abrir la torre y decidir si una confesión puede pagar una deuda heredada por inocentes.", themeSkill: "linajes", scenes: ["El Puente de los Juramentos", "El Salón de los Escudos Negros", "La Habitación sin Heredero", "La Torre que No Perdona"] },
  { id: "cripta-rey", title: "La Cripta del Rey sin Última Palabra", genre: "cripta real y orden falsificada", description: "Bajo el sudario del rey muerto aparece una orden cosida con hilo negro, distinta de la que leyó la corte durante el funeral. Cada vez que alguien pronuncia una de las dos versiones, las monedas sobre sus ojos cambian de rostro.", storyHook: "Demostrar cuál fue la última voluntad antes de que los vivos coronen una mentira irreversible.", themeSkill: "juramentos", scenes: ["La Puerta de las Monedas Frías", "El Corredor de los Nombres Borrados", "La Cámara del Juramento", "El Trono Bajo Tierra"] }
];

function narrativeCampaign(seed: NarrativeSeed): Campaign {
  const slug = seed.id;
  return campaign({
    id: seed.id,
    title: seed.title,
    genre: seed.genre,
    description: seed.description,
    storyHook: seed.storyHook,
    difficulty: "normal",
    recommendedStats: ["mind", "courage", "focus", "charm"],
    recommendedSkills: [seed.themeSkill, "investigacion", "objetos", "dialogo"],
    npcs: [
      { id: `${slug}-principal`, name: "Testigo de la verdad incomoda", description: "Sabe mas de lo que admite y cambia con el peligro.", motive: "Sobrevivir sin entregar su secreto.", role: "npc principal", secret: "Protege una ruta o una culpa antigua." },
      { id: `${slug}-secundario`, name: "Vigía de puerta cerrada", description: "Secundario interactivo: vende rumor, bloquea paso o abre ruta con coste.", motive: "No quedar marcado por la faccion dominante.", role: "secundario" }
    ],
    enemies: [{ id: `${slug}-amenaza`, name: "Amenaza encubierta", description: "No siempre debe combatirse; puede exponerse, calmarse o desviarse.", vitality: 10, attackBonus: 3, defense: 13, dangerLevel: 3, weaknessStats: ["mind", "charm", "courage"], specialMove: "Escalar peligro y bloquear una ruta" }],
    clues: [
      { id: `${slug}-clue-1`, text: "Una prueba fisica contradice la explicacion publica.", sceneId: `${slug}-scene-1`, unlocksFlags: [`${slug}_proof_seen`] },
      { id: `${slug}-clue-2`, text: "Un objeto marcado conecta a un NPC con la amenaza oculta.", sceneId: `${slug}-scene-2`, unlocksFlags: [`${slug}_object_linked`] },
      { id: `${slug}-clue-3`, text: "La ruta final exige decidir entre verdad, coste y misericordia.", sceneId: `${slug}-scene-4`, unlocksFlags: [`${slug}_ending_ready`] }
    ],
    possibleEndings: [
      { id: "good_truth_mercy", title: "Verdad con misericordia", description: "La culpa se prueba sin destruir a todos los inocentes." },
      { id: "heroic_cost", title: "Victoria con precio", description: "El grupo salva a otros y pierde algo persistente." },
      { id: "bittersweet_escape", title: "Salida amarga", description: "Sobreviven con una verdad incompleta." },
      { id: "tragic_collapse", title: "Derrumbe tragico", description: "El peligro critico decide por todos." },
      { id: "corrupt_victory", title: "Victoria corrupta", description: "Ganan usando un poder que deja marca." },
      { id: "false_resolution", title: "Resolucion falsa", description: "Una explicacion comoda tapa el secreto real." },
      { id: "secret_deep_truth", title: "La verdad bajo la verdad", description: "Se abre el secreto profundo y un desbloqueo futuro." }
    ],
    legendaryPets: ["Sabueso del Umbral", "Polilla de Cripta", "Alma Dragonica"],
    rewards: [{ id: `${slug}-story-mark`, name: "Marca Narrativa", description: "Persistente: altera dialogos, costes o visiones sin resolver automaticamente misterios." }],
    imagePrompt: `${seed.genre}, fantasia oscura, objetos tocables, decisiones tensas`,
    ambientSoundPrompt: `${seed.genre}, campanas bajas, lluvia, madera, respiracion contenida`,
    narratorGuidance: "Usa RAG de markdown si esta disponible. Evita frases genericas. Cada turno debe cambiar estado real y cerrar con presion concreta.",
    premise: seed.description,
    hiddenTruth: "La explicacion visible fue manipulada; el secreto real requiere cruzar pistas, objetos y relaciones.",
    mainConflict: "Resolver la verdad sin dejar que peligro, facciones o reliquias rompan la partida.",
    stakes: ["rutas pueden bloquearse", "NPCs pueden huir o traicionar", "objetos pueden danarse, corromperse o bendecirse"],
    endingConditions: Object.fromEntries(["good_truth_mercy", "heroic_cost", "bittersweet_escape", "tragic_collapse", "corrupt_victory", "false_resolution", "secret_deep_truth"].map((id) => [id, "Ver markdown endings.md y walkthrough.md de la campana."])),
    scenes: seed.scenes.map((title, index) => ({
      id: `${slug}-scene-${index + 1}`,
      title,
      description: `Escena de mini-libro con lugar fisico, NPCs activos, objetos relevantes, pistas, rutas y consecuencias. Ver content/campaigns/${slug}/scenes.`,
      objective: index === 3 ? "Elegir final mediante pruebas, costes y estados vivos." : "Abrir una ruta sin agotar las pistas ni contradecir la memoria.",
      allowedStats: ["mind", "charm", "courage", "focus"],
      difficulty: 12 + index,
      clueIds: [`${slug}-clue-${Math.min(index + 1, 3)}`],
      npcIds: [`${slug}-principal`, `${slug}-secundario`],
      enemyIds: index >= 1 ? [`${slug}-amenaza`] : undefined,
      hasCombat: index >= 1,
      imagePrompt: `${title}, ${seed.genre}, detalle gotico concreto`,
      ambientSoundPrompt: `${title}, tension ambiental`,
      multipleChoiceOptions: [
        option(`${slug}-${index + 1}-object`, `Examinar el objeto clave de ${title}`, "investigate", "mind", "low", "Confirmar o danar una pista concreta.", { unlocksClues: [`${slug}-clue-${Math.min(index + 1, 3)}`], memoryImpact: "El objeto examinado conserva una marca fisica que puede compararse con testigos, sellos o heridas." }),
        option(`${slug}-${index + 1}-npc`, `Presionar al testigo de ${title}`, "talk", "charm", "medium", "Obtener ayuda, mentira o traicion con coste.", { memoryImpact: "El NPC cambia actitud y una faccion toma nota." }),
        option(`${slug}-${index + 1}-route`, `Forzar una ruta peligrosa desde ${title}`, "defend", "courage", "high", "Abrir avance con peligro o perdida de objeto.", { dangerOnFailure: 2, progressOnSuccess: 1 })
      ]
    }))
  });
}

const redMoonVerticalSlice = campaigns.find((item) => item.id === "red-moon-killer");
campaigns.splice(0, campaigns.length, ...narrativeSeeds.map((seed) => {
  if (seed.id === "luna-roja" && redMoonVerticalSlice) {
    return { ...redMoonVerticalSlice, id: "luna-roja" };
  }
  return narrativeCampaign(seed);
}));


export const defaultCampaign = campaigns.find((item) => item.id === "luna-roja") ?? campaigns[0];

// ─── Historia improvisada (Fase A) ────────────────────────────────────────────
// El LLM entrega SOLO ficción (ImprovisedStoryContent); acá se ensambla sobre la
// misma estructura mecánica probada de narrativeCampaign: categorías de opción,
// stats, dificultad, enemigo, finales y flags quedan idénticos a la plantilla.

export const IMPROVISED_CAMPAIGN_ID = "historia-improvisada";

// Un NPC animal (gato, perro, cuervo…) no habla ni negocia: las opciones sociales
// ("presionar", "interrogar") sobre él rompen la ficción. Se detecta por perfil.
const animalProfileRegex = /(gat[oa]|perr[oa]|lob[oa]|caball[oa]|cuerv[oa]|zorr[oa]|halc[oó]n|serpiente|drag[oó]n|mascota|felin[oa]|canin[oa]|criatura|bestia)/i;
export function looksLikeAnimal(profile: string): boolean {
  return animalProfileRegex.test(profile);
}
export function npcAnimalProfile(npc: { name?: string; description?: string; appearance?: string }): boolean {
  return looksLikeAnimal(`${npc.appearance ?? ""} ${npc.description ?? ""}`);
}

function clampText(value: unknown, fallback: string, max = 400): string {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  const chosen = text || fallback;
  if (chosen.length <= max) return chosen;
  const cut = chosen.slice(0, max);
  // Cortar en el FIN DE ORACIÓN anterior: un texto que termina "…y una…" a mitad
  // de frase rompe la inmersión. Solo si no hay ningún punto razonable se cae al
  // corte por palabra (sin puntos suspensivos: frase corta antes que frase rota).
  const lastSentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastSentence > max * 0.45) return cut.slice(0, lastSentence + 1).trimEnd();
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}.`;
}

const visualTypePattern = /\b(mujer|hombre\s+afeminado|hombre|andr[óo]gin[oa]|intersex(?:ual)?|hermafrodita|mascota|criatura|h[íi]brid[oa]|fen[óo]meno\s+incorp[óo]reo)\b/i;
const hybridVisualPattern = /\b(h[íi]brid[oa]|centaur[oa]?|minotaur[oa]?|s[áa]tir[oa]?|faun[oa]?|sirena|trit[óo]n|lamia|harp[íi]a|mitad\s+(?:human[oa]|caballo|animal))\b/i;
const phenomenonVisualPattern = /\b(fen[óo]meno|incorp[óo]re[oa]|sin\s+cuerpo|tormenta|tempestad|vendaval|viento|corrientes?\s+de\s+aire|remolino|niebla\s+(?:viviente|con|que|voraz|devoradora)|nube\s+viviente|llama\s+viviente|grieta\s+dimensional|anomal[íi]a)\b/i;
const feminineVisualPattern = /\b(mujer|femenin[oa]|hembra|anciana|ni[ñn]a|muchacha|dama|reina|elfa|enana|bruja|sacerdotisa|guardiana)\b/i;
const masculineVisualPattern = /\b(hombre|masculin[oa]|macho|anciano|ni[ñn]o|muchacho|var[óo]n|rey|elfo|enano|brujo|sacerdote|guardi[áa]n)\b/i;

/** Completa una ficha visual incompleta sin inventarle una mujer humana a todo.
 * La categoría queda escrita en los datos de campaña, no solo escondida en el
 * prompt, y por eso la UI y el generador comparten una única realidad. */
export function canonicalVisualAppearance(appearance: unknown, description: unknown, name = ""): string {
  const exact = clampText(appearance, "", 280);
  const narrative = clampText(description, "figura enigmática con una silueta distintiva", 240);
  const source = exact || narrative;
  const profile = `${name} ${source} ${narrative}`;
  let type: string;
  const stated = profile.match(visualTypePattern)?.[1];
  if (stated) type = stated.toLowerCase();
  else if (phenomenonVisualPattern.test(profile)) type = "fenómeno incorpóreo";
  else if (hybridVisualPattern.test(profile)) type = "híbrido";
  else if (looksLikeAnimal(profile)) type = "mascota/criatura";
  else if (feminineVisualPattern.test(profile)) type = "mujer";
  else if (masculineVisualPattern.test(profile)) type = "hombre";
  else type = "andrógino/intersexual";
  return `${type}: ${source}`;
}

// "Examinar Un farol..." → "Examinar un farol...": baja solo artículos iniciales,
// sin tocar nombres propios.
function asFragment(text: string): string {
  return text.replace(/^(Un|Una|Unos|Unas|El|La|Los|Las)\s/, (article) => article.toLowerCase());
}

/** Devuelve únicamente fragmentos escritos por el jugador. Nunca usa las
 * paráfrasis del LLM porque podían inventar detalles y adelantar la trama en el
 * lobby. `undefined` conserva compatibilidad con contenido viejo; string vacío
 * significa explícitamente "no hubo ideas opcionales". */
export function requestedStoryIdeas(userPrompt: string): string[] {
  return userPrompt
    .replace(/\r/g, "\n")
    .split(/\n+|\s*[;,]\s*|(?<=[.!?])\s+/u)
    .map((idea) => idea.replace(/^[-*•\d.)\s]+/u, "").replace(/\s+/g, " ").trim())
    .filter((idea) => idea.length >= 2)
    .slice(0, 8);
}

export function buildImprovisedCampaign(content: ImprovisedStoryContent, userPrompt?: string): Campaign {
  const slug = IMPROVISED_CAMPAIGN_ID;
  const sceneContent = Array.from({ length: 4 }, (_, index) => ({
    title: clampText(content.scenes?.[index]?.title, `Escena ${index + 1}`, 80),
    objective: clampText(
      content.scenes?.[index]?.objective,
      index === 3 ? "Elegir final mediante pruebas, costes y estados vivos." : "Abrir una ruta sin agotar las pistas ni contradecir la memoria.",
      180
    ),
    keyObject: clampText(content.scenes?.[index]?.keyObject, "el objeto que no encaja", 70),
    escapeRoute: clampText(content.scenes?.[index]?.escapeRoute, "una ruta lateral peligrosa", 70)
  }));

  // Hasta 5 NPCs: el elenco lo define el input del jugador (cada persona, mascota
  // y enemigo nombrado es su propio NPC), no un tope fijo de 3.
  const npcSource = Array.isArray(content.npcs) ? content.npcs.slice(0, 5) : [];
  while (npcSource.length < 2) {
    npcSource.push(npcSource.length === 0
      ? { name: "Testigo de la verdad incómoda", role: "npc principal", description: "Sabe más de lo que admite y cambia con el peligro.", motive: "Sobrevivir sin entregar su secreto.", secret: "Protege una ruta o una culpa antigua." }
      : { name: "Vigía de puerta cerrada", role: "secundario", description: "Vende rumor, bloquea paso o abre ruta con coste.", motive: "No quedar marcado por la facción dominante.", secret: "Cobra deudas de la amenaza oculta." });
  }
  const npcs: Campaign["npcs"] = npcSource.map((npc, index) => ({
    id: `${slug}-npc-${index + 1}`,
    name: clampText(npc?.name, `Testigo ${index + 1}`, 48),
    description: clampText(npc?.description, "Sabe más de lo que admite.", 240),
    motive: clampText(npc?.motive, "Sobrevivir sin entregar su secreto.", 180),
    role: clampText(npc?.role, index === 0 ? "npc principal" : "secundario", 48),
    secret: clampText(npc?.secret, "Protege una culpa antigua.", 220),
    desire: npc?.desire ? clampText(npc.desire, "", 160) : undefined,
    fear: npc?.fear ? clampText(npc.fear, "", 160) : undefined,
    appearance: canonicalVisualAppearance(npc?.appearance, npc?.description, npc?.name),
    bond: npc?.bond ? clampText(npc.bond, "", 90) : undefined,
    whyMightLie: npc?.whyMightLie ? clampText(npc.whyMightLie, "", 160) : undefined
  }));

  // Relaciones SECRETAS entre NPCs (capa engine, jamás visibles al crear): el LLM
  // las manda por nombre; acá se resuelven a ids y viven en relationshipToOtherNPCs
  // del NPC de origen, de donde el prompt por turno las levanta como subtexto.
  const npcByLooseName = (name: string) => {
    const needle = String(name ?? "").trim().toLowerCase();
    if (needle.length < 3) return undefined;
    return npcs.find((npc) => npc.name.toLowerCase().includes(needle) || needle.includes(npc.name.toLowerCase()));
  };
  for (const relation of (content.npcRelations ?? []).slice(0, 4)) {
    const from = npcByLooseName(relation?.from);
    const to = npcByLooseName(relation?.to);
    if (!from || !to || from.id === to.id || !relation?.nature) continue;
    from.relationshipToOtherNPCs = { ...from.relationshipToOtherNPCs, [to.id]: clampText(relation.nature, "", 140) };
  }

  const clues = Array.from({ length: 3 }, (_, index) => {
    const clue = content.clues?.[index];
    const sceneIndex = Math.min(Math.max(Math.round(Number(clue?.sceneIndex) || index + 1), 1), 4);
    return {
      id: `${slug}-clue-${index + 1}`,
      text: clampText(clue?.text, "Una prueba física contradice la explicación pública.", 220),
      ...(clue?.isFalse ? { isFalse: true } : {}),
      sceneId: `${slug}-scene-${sceneIndex}`,
      unlocksFlags: [`${slug}_clue_${index + 1}`]
    };
  });
  const clueIdForScene = (index: number) =>
    clues.find((clue) => clue.sceneId === `${slug}-scene-${index + 1}`)?.id ?? clues[Math.min(index, clues.length - 1)].id;

  const threatName = clampText(content.threat?.name, "Amenaza encubierta", 60);

  return campaign({
    id: slug,
    title: clampText(content.title, "Historia improvisada", 80),
    genre: clampText(content.genre, "fantasía oscura improvisada", 80),
    description: clampText(content.premise, "Una historia forjada al momento por el equipo.", 320),
    storyHook: clampText(content.storyHook, clampText(content.premise, "Una historia única forjada por el grupo.", 240), 240),
    difficulty: "normal",
    recommendedStats: ["mind", "courage", "focus", "charm"],
    recommendedSkills: [clampText(content.themeSkill, "investigación", 40), "investigacion", "objetos", "dialogo"],
    npcs,
    enemies: [{
      id: `${slug}-amenaza`,
      name: threatName,
      description: clampText(content.threat?.description, "No siempre debe combatirse; puede exponerse, calmarse o desviarse.", 220),
      vitality: 10,
      attackBonus: 3,
      defense: 13,
      dangerLevel: 3,
      weaknessStats: ["mind", "charm", "courage"],
      specialMove: clampText(content.threat?.specialMove, "Escalar peligro y bloquear una ruta", 120),
      imagePrompt: canonicalVisualAppearance(content.threat?.appearance, content.threat?.description, threatName)
    }],
    clues,
    possibleEndings: [
      { id: "good_truth_mercy", title: "Verdad con misericordia", description: "La culpa se prueba sin destruir a todos los inocentes." },
      { id: "heroic_cost", title: "Victoria con precio", description: "El grupo salva a otros y pierde algo persistente." },
      { id: "bittersweet_escape", title: "Salida amarga", description: "Sobreviven con una verdad incompleta." },
      { id: "tragic_collapse", title: "Derrumbe trágico", description: "El peligro crítico decide por todos." },
      { id: "corrupt_victory", title: "Victoria corrupta", description: "Ganan usando un poder que deja marca." },
      { id: "false_resolution", title: "Resolución falsa", description: "Una explicación cómoda tapa el secreto real." },
      { id: "secret_deep_truth", title: "La verdad bajo la verdad", description: "Se abre el secreto profundo y un desbloqueo futuro." }
    ],
    legendaryPets: ["Sabueso del Umbral", "Polilla de Cripta", "Alma Dragonica"],
    rewards: [{ id: `${slug}-story-mark`, name: "Marca Narrativa", description: "Persistente: altera diálogos, costes o visiones sin resolver automáticamente misterios." }],
    imagePrompt: `${clampText(content.genre, "fantasía oscura", 80)}, fantasía oscura, objetos tocables, decisiones tensas`,
    ambientSoundPrompt: `${clampText(content.genre, "fantasía oscura", 80)}, campanas bajas, lluvia, madera, respiración contenida`,
    narratorGuidance: "Historia improvisada por el equipo: respetá su premisa y sus NPCs al pie de la letra. Cada turno debe cambiar estado real y cerrar con presión concreta.",
    premise: clampText(content.premise, "Una historia forjada al momento.", 400),
    // Notas visibles del lobby: resumen jugable, keywords usadas, vínculo y evidencia.
    forgeNotes: {
      summary: content.summary ? {
        objective: content.summary.objective ? clampText(content.summary.objective, "", 240) : undefined,
        risk: content.summary.risk ? clampText(content.summary.risk, "", 240) : undefined,
        firstMystery: content.summary.firstMystery ? clampText(content.summary.firstMystery, "", 160) : undefined,
        timeLimit: content.summary.timeLimit ? clampText(content.summary.timeLimit, "", 110) : undefined
      } : undefined,
      keywordsUsed: userPrompt !== undefined
        ? requestedStoryIdeas(userPrompt).map((idea) => ({ idea: clampText(idea, "", 180), how: "Incluida sin adelantar su desarrollo." }))
        : Array.isArray(content.keywordsUsed)
          ? content.keywordsUsed.slice(0, 8).map((item) => ({ idea: clampText(item?.idea, "", 180), how: clampText(item?.how, "", 260) })).filter((item) => item.idea && item.how)
          : undefined,
      heroBond: content.heroBond ? clampText(content.heroBond, "", 220) : undefined,
      evidence: Array.isArray(content.evidence) ? content.evidence.slice(0, 3).map((item) => clampText(item, "", 140)).filter(Boolean) : undefined
    },
    hiddenTruth: clampText(content.hiddenTruth, "La explicación visible fue manipulada; el secreto real requiere cruzar pistas, objetos y relaciones.", 300),
    mainConflict: "Resolver la verdad sin dejar que peligro, facciones o reliquias rompan la partida.",
    stakes: (Array.isArray(content.stakes) && content.stakes.length ? content.stakes : ["rutas pueden bloquearse", "NPCs pueden huir o traicionar"]).slice(0, 3).map((stake) => clampText(stake, "", 140)).filter(Boolean),
    // Giros: el principal + los ocultos que reinterpretan evidencia (capa ENGINE,
    // el lobby jamás los muestra; el DM los puede soltar en escenas avanzadas).
    twists: (() => {
      const twistList = [
        ...(content.twist ? [{ id: `${slug}-twist-1`, title: "Giro", trigger: "clímax o pista final", reveal: clampText(content.twist, "", 240) }] : []),
        ...(Array.isArray(content.hiddenTwists) ? content.hiddenTwists.slice(0, 3).map((twist, index) => ({
          id: `${slug}-twist-${index + 2}`,
          title: `Reinterpretación ${index + 1}`,
          trigger: index === 0 ? "mitad de la aventura" : index === 1 ? "escena 3 o pista fuerte" : "antes del clímax",
          reveal: clampText(twist, "", 240)
        })).filter((twist) => twist.reveal) : [])
      ];
      return twistList.length ? twistList : undefined;
    })(),
    endingConditions: Object.fromEntries(["good_truth_mercy", "heroic_cost", "bittersweet_escape", "tragic_collapse", "corrupt_victory", "false_resolution", "secret_deep_truth"].map((id) => [id, "Final compuesto por EndingPlan según pistas, peligro y decisiones."])),
    scenes: sceneContent.map((scene, index) => ({
      id: `${slug}-scene-${index + 1}`,
      title: scene.title,
      description: `${scene.objective} Lugar físico con NPCs activos, objetos relevantes y rutas con coste.`,
      objective: scene.objective,
      allowedStats: ["mind", "charm", "courage", "focus"],
      difficulty: 12 + index,
      clueIds: [clueIdForScene(index)],
      npcIds: npcs.map((npc) => npc.id),
      enemyIds: index >= 1 ? [`${slug}-amenaza`] : undefined,
      hasCombat: index >= 1,
      imagePrompt: `${scene.title}, ${clampText(content.genre, "fantasía oscura", 80)}, detalle concreto`,
      ambientSoundPrompt: `${scene.title}, tensión ambiental`,
      multipleChoiceOptions: [
        option(`${slug}-${index + 1}-object`, `Examinar ${asFragment(scene.keyObject)}`, "investigate", "mind", "low", "Confirmar o dañar una pista concreta.", { unlocksClues: [clueIdForScene(index)], memoryImpact: "El objeto examinado conserva una marca física comparable con testigos o heridas." }),
        // La opción social rota entre NPCs, pero un ANIMAL no se "presiona":
        // con criaturas la vía es leer su comportamiento y dejarse guiar.
        (() => {
          const candidate = npcs[index % npcs.length];
          const speaking = npcAnimalProfile(candidate) ? npcs.find((npc) => !npcAnimalProfile(npc)) : candidate;
          return speaking && speaking === candidate
            ? option(`${slug}-${index + 1}-npc`, `Presionar a ${candidate.name}`, "talk", "charm", "medium", "Obtener ayuda, mentira o traición con coste.", { memoryImpact: "El NPC cambia actitud y alguien toma nota." })
            : speaking
              ? option(`${slug}-${index + 1}-npc`, `Presionar a ${speaking.name}`, "talk", "charm", "medium", "Obtener ayuda, mentira o traición con coste.", { memoryImpact: "El NPC cambia actitud y alguien toma nota." })
              : option(`${slug}-${index + 1}-npc`, `Seguir a ${candidate.name} y leer sus señales`, "investigate", "mind", "medium", "La criatura no habla: sus gestos apuntan a algo concreto.", { memoryImpact: "La criatura reacciona y marca una dirección, un miedo o un rastro." });
        })(),
        option(`${slug}-${index + 1}-route`, `Forzar ${asFragment(scene.escapeRoute)}`, "defend", "courage", "high", "Abrir avance con peligro o pérdida de objeto.", { dangerOnFailure: 2, progressOnSuccess: 1 })
      ]
    }))
  });
}

export function campaignById(id: string): Campaign {
  return campaigns.find((item) => item.id === id) ?? defaultCampaign;
}

export function campaignBackgroundImages(campaignId: string) {
  return [campaignBgImages[campaignId] ?? "/assets/campaigns/red-moon-killer.webp"];
}

export function campaignToWorldTheme(campaign: Campaign): WorldTheme {
  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    toneTags: [campaign.genre, ...campaign.recommendedSkills].slice(0, 5),
    darknessLevel: campaign.difficulty === "hard" ? "high" : campaign.difficulty === "normal" ? "medium" : "low",
    romanceLevel: campaign.genre.includes("corte") ? "high" : "medium",
    mysteryLevel: "high",
    combatLevel: campaign.scenes.some((scene) => scene.hasCombat) ? "medium" : "low",
    difficulty: campaign.difficulty === "hard" ? "desafiante" : campaign.difficulty === "easy" ? "fácil" : "normal",
    visualStyle: campaign.imagePrompt,
    narratorGuidance: campaign.narratorGuidance,
    possibleNPCs: campaign.npcs.map((npc) => npc.name),
    possibleMysteries: campaign.clues.map((clue) => clue.text),
    possibleBetrayals: campaign.enemies.map((enemy) => enemy.specialMove ?? enemy.description),
    possibleRomances: ["vínculo peligroso", "promesa rota", "alianza incómoda"],
    possibleLegendaryPets: campaign.legendaryPets,
    exampleFirstScene: campaign.scenes[0].title,
    visualPrompt: campaign.imagePrompt,
    ambientSoundPrompt: campaign.ambientSoundPrompt
  };
}
