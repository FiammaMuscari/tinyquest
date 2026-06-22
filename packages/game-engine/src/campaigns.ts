import type { Campaign, CampaignActionOption, StatName, WorldTheme } from "./types";

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
    scenes: [
      { id: "duke-ball", title: "El Baile de Máscaras", description: "El duque cae mientras todos aplauden.", objective: "Asegurar la primera pista.", allowedStats: ["mind", "charm", "focus", "courage"], difficulty: 12, clueIds: ["mask-clue"], npcIds: ["duchess"], imagePrompt: "salón dorado con máscaras", ambientSoundPrompt: "vals y susurros", multipleChoiceOptions: [option("inspect-mask", "Examinar la máscara", "investigate", "mind", "low", "Buscar veneno, magia o cambio de identidad."), option("question-duchess", "Interrogar a la duquesa", "talk", "charm", "medium", "Presionar sin causar escándalo."), option("challenge-duelist", "Aceptar el duelo", "fight", "courage", "high", "Forzar al asesino a moverse.")] },
      { id: "false-names", title: "El Salón de Nombres Falsos", description: "Los invitados intercambiaron identidades.", objective: "Separar coartadas reales de máscaras.", allowedStats: ["mind", "focus", "charm"], difficulty: 13, clueIds: ["mask-clue"], npcIds: ["duchess"], imagePrompt: "galería de retratos y espejos", ambientSoundPrompt: "pasos sobre mármol", multipleChoiceOptions: [option("compare-names", "Comparar nombres", "investigate", "focus", "medium", "Cruzar invitaciones con rostros."), option("dance-talk", "Bailar para obtener verdad", "talk", "charm", "medium", "Sacar una confesión entre pasos."), option("pet-scent", "Usar mascota", "pet", "luck", "low", "Seguir el rastro correcto.")] },
      { id: "last-dance", title: "El Último Baile", description: "El asesino intenta cerrar la noche.", objective: "Revelar culpable o pactar silencio.", allowedStats: ["mind", "charm", "courage"], difficulty: 15, clueIds: ["mask-clue"], npcIds: ["duchess"], enemyIds: ["swan-duelist"], hasCombat: true, imagePrompt: "duelo bajo arañas doradas", ambientSoundPrompt: "vals acelerado y acero", multipleChoiceOptions: [option("reveal-killer", "Revelar al culpable", "investigate", "mind", "medium", "Unir pistas ante todos."), option("final-duel", "Duelo final", "fight", "courage", "high", "Resolver con acero."), option("negotiate-truth", "Negociar la verdad", "talk", "charm", "medium", "Salvar a alguien sin mentir.")] }
    ]
  }),
  campaign({
    id: "red-moon-killer",
    title: "El Asesino de la Luna Roja",
    genre: "misterio licántropo",
    tone: "oscuro, urgente y social",
    theme: "verdad contra venganza pública",
    description: "Un molinero aparece muerto bajo el molino. La aldea culpa a Nicolás, un licántropo encadenado, pero las pruebas huelen a montaje.",
    storyHook: "Salvar al inocente antes de la ejecución sin liberar algo peor que la mentira.",
    durationMinutes: 25,
    energyMax: 6,
    difficulty: "normal",
    recommendedStats: ["mind", "courage", "charm", "focus"],
    recommendedSkills: ["rastreo", "coartadas", "contención", "decisiones morales"],
    factions: [
      { id: "mob", name: "Turba de la aldea", agenda: "Ejecutar rápido a Nicolás", pressure: "sogas, antorchas y gritos frente a cada escena" },
      { id: "mayor-house", name: "Casa del Alcalde", agenda: "Cerrar el caso antes de que aparezca el acta falsa", pressure: "guardias, archivos cerrados y favores comprados" },
      { id: "wolf-kin", name: "Linaje del Lobo", agenda: "Sobrevivir sin romper el viejo trato", pressure: "exilio, culpa heredada y miedo a la bestia real" }
    ],
    suspects: [
      { id: "tomas-apprentice", name: "Tomás, aprendiz del molino", motive: "Vio la escena preparada y teme que lo acusen", secret: "Reconoce la tinta azul del archivo", suspicion: 2 },
      { id: "bruno-miller", name: "Bruno, viejo molinero", motive: "Oculta una deuda con Roldán", secret: "Abrió el molino antes del amanecer", suspicion: 2 },
      { id: "elias-bailiff", name: "Elías, alguacil", motive: "Quiere evitar un motín aunque condene a un inocente", secret: "Movió testigos por orden del alcalde", suspicion: 3 },
      { id: "mayor-roldan", name: "Alcalde Roldán", motive: "Proteger el nombre familiar", secret: "Mandó fabricar pruebas", suspicion: 4 },
      { id: "nameless-heir", name: "El Heredero Sin Nombre", motive: "Usar magia lunar para reclamar sangre y tierra", secret: "La bestia responde a su sello", suspicion: 5 }
    ],
    npcs: [
      { id: "accused-wolf", name: "Nicolás, el lobo acusado", description: "Licántropo joven, encadenado con plata baja. Inocente del crimen, culpable de haber mentido para proteger a Mara.", motive: "Proteger a Mara y no romper el pacto del bosque.", role: "acusado", fear: "Que la turba ejecute a su familia", desire: "Que alguien pruebe que las garras son falsas", appearsInScenes: ["body-by-mill", "accused-wolf", "moon-bell", "rain-trial"], whatTheyKnow: ["No mató al molinero", "Vio plata vieja cerca del molino"], whatTheyHide: ["Mara le llevó una carta rota"], canDie: true },
      { id: "mara-sister", name: "Mara, hermana de Nicolás", description: "Mujer de mirada dura, capaz de mentir por amor y de odiar a quien la salve tarde.", motive: "Sacar a Nicolás vivo aunque deba quemar una prueba.", role: "aliada posible", fear: "Perder a su hermano frente a todos", desire: "Confiar en alguien sin entregar a su linaje", appearsInScenes: ["accused-wolf", "red-forest", "moon-bell", "rain-trial"], whatTheyKnow: ["Nicolás recibió una carta antes de ser arrestado"], whatTheyHide: ["Ella escondió media carta bajo la campana"], canBetray: true },
      { id: "tomas-apprentice", name: "Tomás, aprendiz del molino", description: "Muchacho flaco, manos con harina, siempre mirando la puerta antes de responder.", motive: "No quedar como cómplice del alcalde.", role: "testigo", fear: "Elías puede arrestarlo", desire: "Salir vivo del juicio", appearsInScenes: ["body-by-mill", "mayor-house", "rain-trial"], whatTheyKnow: ["La campana sonó después de que el cuerpo ya estaba ahí", "La cuerda fue cortada con calma"], whatTheyHide: ["Reconoce la tinta azul del archivo"] },
      { id: "bruno-miller", name: "Bruno, viejo molinero", description: "Viejo áspero que conoce cada tabla del molino y no cree en casualidades limpias.", motive: "Defender el molino aunque odie al acusado.", role: "molinero", fear: "Que quemen el molino", desire: "Que no ensucien el cuerpo con política", appearsInScenes: ["body-by-mill", "red-forest"], whatTheyKnow: ["Las marcas de garra son demasiado parejas"], whatTheyHide: ["Debe dinero a Roldán"] },
      { id: "irma-bellkeeper", name: "Doña Irma, campanera", description: "Mujer seca, voz baja, guarda llaves y silencios de la capilla.", motive: "Evitar una ejecución falsa sin desafiar de frente a la turba.", role: "campanera", fear: "Que la campana convoque una muerte", desire: "Que alguien lea la carta de deuda", appearsInScenes: ["accused-wolf", "moon-bell", "rain-trial"], whatTheyKnow: ["La carta de deuda pasó por la capilla"], whatTheyHide: ["Sabe quién pidió silencio"] },
      { id: "elias-bailiff", name: "Elías, alguacil de la aldea", description: "Alguacil cansado, sostén de una autoridad que se cae encima.", motive: "Mantener la aldea junta aunque tenga que mentir por orden del alcalde.", role: "alguacil", fear: "Que la turba lo pase por encima", desire: "Cerrar el caso rápido", appearsInScenes: ["body-by-mill", "accused-wolf", "mayor-house", "rain-trial"], whatTheyKnow: ["Alguien le ordenó mover gente lejos del molino"], whatTheyHide: ["Recibió instrucciones del archivo del alcalde"] },
      { id: "mayor-roldan", name: "Alcalde Roldán", description: "Habla bajo, sonríe tarde y siempre tiene a alguien dispuesto a cerrar una puerta.", motive: "Salvar el apellido Roldán de una deuda antigua.", role: "antagonista social", fear: "Que el acta falsa salga de su casa", desire: "Un culpable rápido", appearsInScenes: ["mayor-house", "moon-bell", "rain-trial"], whatTheyKnow: ["El sello lunar no pertenece al acusado"], whatTheyHide: ["Su heredero usó magia lunar para fabricar la bestia"], canBetray: true },
      { id: "nameless-heir", name: "El Heredero Sin Nombre", description: "Joven oculto por la familia Roldán, marcado por un sello que no cicatriza.", motive: "Cobrar una deuda de sangre usando miedo a los lobos.", role: "culpable oculto", fear: "Que rompan la campana sellada", desire: "Que Nicolás muera antes del juicio", appearsInScenes: ["mayor-house", "moon-bell", "rain-trial"], whatTheyKnow: ["La bestia obedece a la campana"], whatTheyHide: ["Él no controla del todo lo que invocó"], canDisappear: true }
    ],
    enemies: [{ id: "cursed-beast", name: "La Bestia Maldita", description: "Una sombra de garras falsas sostenida por sello lunar y pánico colectivo.", vitality: 10, attackBonus: 3, defense: 13, dangerLevel: 3, weaknessStats: ["mind", "courage", "focus"], specialMove: "Aullido de pánico" }],
    clues: [
      { id: "fake-claws", label: "Garras fabricadas", text: "Las heridas del cadáver repiten un patrón de herramienta, no de bestia.", description: "La mordida no coincide con la mandíbula de Nicolás.", source: "Cadáver bajo el molino", sceneId: "body-by-mill", unlocksFlags: ["fake_claws_seen"], unlocksActions: ["compare-bite", "question-tomas"], suspectsAffected: [{ suspectId: "accused-wolf", suspicionChange: -2 }, { suspectId: "mayor-roldan", suspicionChange: 1 }], endingImpact: ["saved-wolf-costly", "secret-deep-truth"] },
      { id: "bell-after-death", label: "La campana sonó tarde", text: "Tomás admite que la campana sonó después de que el cadáver ya estaba bajo el molino.", description: "El horario oficial se cae: primero estuvo el cuerpo, después la alarma.", source: "Tomás", sceneId: "body-by-mill", unlocksFlags: ["bell_after_death"], suspectsAffected: [{ suspectId: "elias-bailiff", suspicionChange: 1 }, { suspectId: "mayor-roldan", suspicionChange: 1 }] },
      { id: "cut-bell-rope", label: "Cuerda cortada antes", text: "La cuerda de la campana fue cortada con herramienta humana antes del hallazgo, no durante el pánico.", description: "Alguien preparó la alarma para que sonara tarde.", source: "Molino", sceneId: "body-by-mill", unlocksFlags: ["bell_rope_cut"], unlocksActions: ["question-irma", "follow-mud"], suspectsAffected: [{ suspectId: "tomas-apprentice", suspicionChange: -1 }, { suspectId: "elias-bailiff", suspicionChange: 1 }] },
      { id: "silver-burns", label: "Quemaduras de plata baja", text: "Los grilletes hirieron a Nicolás antes del arresto oficial.", description: "Alguien lo redujo antes de que Elías declarara haberlo encontrado.", source: "Capilla del acusado", sceneId: "accused-wolf", unlocksFlags: ["illegal_chains_seen"], suspectsAffected: [{ suspectId: "elias-bailiff", suspicionChange: 2 }] },
      { id: "mara-letter", label: "Media carta de Mara", text: "La carta de Mara pide a Nicolás no ir al molino; alguien la rompió para borrar la coartada.", description: "No lo limpia de todo, pero contradice el horario oficial.", source: "Capilla", sceneId: "accused-wolf", unlocksFlags: ["mara_letter_found"], unlocksActions: ["ally-mara"] },
      { id: "mud-to-mayor", label: "Barro del archivo", text: "El barro rojo lleva del molino al umbral trasero de la casa del alcalde.", description: "La ruta no apunta al bosque: apunta a una puerta con guardia.", source: "Bosque Rojo", sceneId: "red-forest", unlocksFlags: ["route_to_mayor_open"], unlocksActions: ["enter-mayor-house"] },
      { id: "ritual-tool", label: "Cuchilla de plata vieja", text: "La herramienta usada para imitar garras pertenece al archivo del alcalde.", description: "No caza bestias: fabrica culpables.", source: "Casa del alcalde", sceneId: "mayor-house", unlocksFlags: ["ritual_tool_found"], unlocksObjects: ["ritual-tool-object"], endingImpact: ["saved-wolf-costly", "false-victory"] },
      { id: "blue-ink-ledger", label: "Libro de tinta azul", text: "El acta de ejecución fue escrita antes de interrogar a Nicolás.", description: "Roldán ya tenía sentencia antes de tener prueba.", source: "Archivo de Roldán", sceneId: "mayor-house", unlocksFlags: ["blue_ledger_found"], suspectsAffected: [{ suspectId: "mayor-roldan", suspicionChange: 3 }] },
      { id: "moon-seal", label: "Sello lunar en la campana", text: "La campana no llama vecinos: alimenta a la Bestia Maldita cuando todos piden sangre.", description: "Romperlo salva el juicio, usarlo revela la deuda profunda.", source: "Campana de Luna", sceneId: "moon-bell", unlocksFlags: ["moon_seal_known", "secret_route_open"], unlocksActions: ["use-moon-seal", "break-moon-seal"], endingImpact: ["secret-deep-truth", "worse-thing-freed"] }
    ],
    possibleEndings: [
      { id: "saved-wolf-costly", type: "good", title: "El inocente vive, la aldea no perdona", description: "Nicolás sobrevive y Roldán cae, pero el pacto queda herido.", requires: { confirmedClues: ["fake-claws", "ritual-tool"], dangerMax: 8 } },
      { id: "partial-good-rain", type: "bittersweet", title: "Verdad suficiente bajo la lluvia", description: "El grupo salva a quien puede, pero deja una culpa sin tribunal.", requires: { confirmedClues: ["fake-claws"], dangerMax: 10 } },
      { id: "tragic-execution", type: "tragic", title: "La soga aprende otro nombre", description: "La turba se adelanta al juicio y una muerte tapa la verdad.", requires: { dangerMax: 10 } },
      { id: "false-victory", type: "false", title: "Un culpable cómodo", description: "La aldea se calma con una mentira útil y la casa Roldán respira.", requires: { dangerMax: 10 } },
      { id: "secret-deep-truth", type: "secret", title: "La campana no llamaba a los vivos", description: "La verdad revela al Heredero Sin Nombre y una deuda lunar más antigua.", requires: { confirmedClues: ["fake-claws", "ritual-tool", "moon-seal"], dangerMax: 9, objects: ["moon-bell-seal"] } },
      { id: "companion-loss", type: "heroic", title: "Uno cae para que el lobo respire", description: "Un compañero paga el paso entre la turba y el acusado.", requires: { dangerMax: 10 } },
      { id: "worse-thing-freed", type: "corrupt", title: "Salvar al lobo, soltar la Bestia", description: "Nicolás vive, pero el sello roto libera algo que ya no obedece a nadie.", requires: { confirmedClues: ["moon-seal"], dangerMax: 10 } },
      { id: "truth-rejected", type: "bittersweet", title: "La verdad que nadie quiso mirar", description: "Las pruebas son reales, pero la aldea elige miedo antes que vergüenza.", requires: { confirmedClues: ["blue-ink-ledger"], dangerMax: 10 } }
    ],
    threats: [
      { id: "mob-pressure", name: "Peligro social", pressure: "La turba acerca sogas y antorchas a cada ronda", escalatesWhen: "fallos, mentiras públicas o rutas bloqueadas" },
      { id: "lunar-corruption", name: "Corrupción lunar", pressure: "La campana alimenta a la Bestia con miedo colectivo", escalatesWhen: "usar reliquias sin protección o llegar tarde" }
    ],
    twists: [
      { id: "wrong-beast", title: "La bestia es coartada", trigger: "fake-claws", reveal: "Las heridas fueron fabricadas para culpar a Nicolás." },
      { id: "mayor-ledger", title: "Sentencia antes del juicio", trigger: "blue-ink-ledger", reveal: "Roldán preparó el acta antes de escuchar testigos." },
      { id: "nameless-heir", title: "El heredero oculto", trigger: "moon-seal", reveal: "La bestia responde a una deuda familiar, no a Nicolás." }
    ],
    graveConsequences: ["Un compañero puede morir cubriendo a Nicolás.", "Mara puede abandonar al grupo si rompen la carta.", "Tomás puede ser capturado por Elías.", "La Bestia puede quedar libre si rompen el sello sin contenerla.", "La aldea puede rechazar pruebas verdaderas por miedo."],
    legendaryPets: ["Sabueso del Umbral", "Alma Dracónica"],
    rewards: [{ id: "red-moon-charm", name: "Amuleto de Luna Roja", description: "+1 narrativo contra maldiciones lunares." }],
    imagePrompt: "Aldea medieval, molino viejo, lluvia fría, bosque rojo, misterio licántropo.",
    ambientSoundPrompt: "Molino crujiente, turba lejana, lluvia, campanas bajas.",
    narratorGuidance: "Español latino natural. Tensión social, decisiones morales, NPCs con voz propia. Evita logs técnicos y pistas repetidas.",
    premise: "Un molinero aparece muerto y la aldea quiere ejecutar a Nicolás antes de que el grupo junte pruebas.",
    hiddenTruth: "Roldán y su heredero fabricaron pruebas para romper una protección antigua y quedarse con una deuda heredada.",
    mainConflict: "Verdad contra venganza pública: si el grupo tarda, la turba crea su propia justicia.",
    stakes: ["Nicolás puede ser ejecutado.", "La aldea puede romper su tregua con el bosque.", "La Bestia Maldita puede quedar libre.", "Un compañero puede pagar el coste de una verdad pública."],
    timeline: ["Antes de la partida, roban una cuchilla de plata vieja del archivo.", "El molinero muere y la escena se prepara con garras falsas.", "Nicolás es encadenado antes de que exista orden oficial.", "La ejecución se anuncia para cuando la campana suene bajo lluvia."],
    backstory: "La familia Roldán vendió protección antigua a cambio de tierras y ahora necesita culpar a un lobo para esconder la deuda.",
    sceneFlow: ["El Cadáver Bajo el Molino", "El Lobo Acusado", "El Bosque Rojo", "La Casa del Alcalde", "La Campana de Luna", "Juicio Bajo la Lluvia"],
    possibleReveals: ["Las garras son fabricadas.", "Nicolás fue encadenado antes del arresto oficial.", "El rastro lleva a la casa del alcalde.", "El acta fue escrita antes del juicio.", "La campana alimenta a la Bestia."],
    moralDilemmas: ["Salvar a Nicolás puede liberar una deuda peor.", "Romper una prueba puede salvar una vida y destruir un caso.", "Entregar un culpable falso puede evitar una masacre inmediata."],
    failureStates: ["La turba ejecuta a Nicolás.", "Tomás desaparece bajo custodia de Elías.", "Mara traiciona al grupo por miedo.", "La Bestia sale del sello."],
    endingConditions: {
      "saved-wolf-costly": "Garras falsas + herramienta ritual + peligro no crítico.",
      "secret-deep-truth": "Tres pistas decisivas + sello lunar + ruta secreta abierta.",
      "tragic-execution": "Peligro crítico o fallos graves en escena final.",
      "false-victory": "Elegir calmar a la turba con culpable cómodo.",
      "worse-thing-freed": "Romper sello sin contención suficiente."
    },
    storyObjects: [
      { id: "ritual-tool-object", name: "Cuchilla de plata vieja", type: "prueba", description: "Cuchilla dentada usada para copiar garras.", location: "archivo del alcalde", status: "hidden", relatedClues: ["ritual-tool"], relatedNPCs: ["mayor-roldan", "nameless-heir"], unlocksActions: ["show-ritual-tool"], unlocksEndings: ["saved-wolf-costly", "secret-deep-truth"], history: "Robada antes del crimen para fabricar una culpa creíble." },
      { id: "mara-letter-object", name: "Carta rota de Mara", type: "documento", description: "Media carta que contradice el horario oficial.", location: "capilla", status: "hidden", relatedClues: ["mara-letter"], relatedNPCs: ["mara-sister", "accused-wolf"], unlocksActions: ["ally-mara"], unlocksEndings: ["partial-good-rain"], history: "Mara la rompió cuando escuchó a Elías en la puerta." },
      { id: "blue-ledger-object", name: "Libro de tinta azul", type: "documento", description: "Acta preparada antes del interrogatorio.", location: "casa del alcalde", status: "hidden", relatedClues: ["blue-ink-ledger"], relatedNPCs: ["mayor-roldan", "elias-bailiff"], unlocksActions: ["confront-roldan"], unlocksEndings: ["truth-rejected", "saved-wolf-costly"], history: "Roldán lo guardó junto a órdenes ya firmadas." },
      { id: "cadaver-bite-evidence", name: "Mordida del cadáver", type: "evidencia", description: "Marca sobre la herida que debe compararse con una mandíbula real.", location: "molino", status: "found", relatedClues: ["fake-claws"], relatedNPCs: ["accused-wolf", "bruno-miller"], unlocksActions: ["inspect-claw-pattern"], unlocksEndings: ["saved-wolf-costly"], history: "Fue marcada después de la muerte para fabricar monstruo." },
      { id: "object-bell-rope", name: "Cuerda cortada de la campana", type: "evidencia", description: "Cuerda de cáñamo con cortes limpios.", location: "molino", status: "found", relatedClues: ["cut-bell-rope"], relatedNPCs: ["tomas-apprentice", "elias-bailiff"], unlocksActions: ["inspect-bell-rope"], unlocksEndings: ["partial-good-rain"], history: "Fue cortada antes de que la turba llegara." },
      { id: "moon-bell-seal", name: "Sello lunar de la campana", type: "reliquia", description: "Marca fría que bebe miedo cuando la campana suena.", location: "campanario", status: "hidden", relatedClues: ["moon-seal"], relatedNPCs: ["nameless-heir", "irma-bellkeeper"], unlocksActions: ["use-moon-seal", "break-moon-seal"], unlocksEndings: ["secret-deep-truth", "worse-thing-freed"], history: "Fue puesto para convertir un juicio en alimento para la Bestia." }
    ],
    causalLinks: [
      { cause: "fake-claws", effect: "accused-wolf", relation: "cleared", description: "Las garras fabricadas limpian parcialmente a Nicolás." },
      { cause: "mud-to-mayor", effect: "mayor-house", relation: "unlocked", description: "El barro abre ruta concreta hacia la casa del alcalde." },
      { cause: "blue-ink-ledger", effect: "mayor-roldan", relation: "implicated", description: "El acta temprana implica a Roldán." },
      { cause: "moon-seal", effect: "secret-deep-truth", relation: "unlocked", description: "El sello abre el final secreto y el riesgo de liberar algo peor." }
    ],
    scenes: [
      { id: "body-by-mill", title: "El Cadáver Bajo el Molino", description: "El cuerpo yace entre harina húmeda y tablas viejas. Elías quiere moverlo; Bruno no deja tocar el molino; Tomás mira la puerta.", objective: "Impedir que destruyan la escena y hallar la primera contradicción.", dramaticObjective: "Convertir una ejecución segura en una duda pública.", mainConflict: "Turba contra prueba física.", location: "rueda baja del molino", timePressure: "Elías moverá el cuerpo al final de la cuarta ronda.", initialDanger: 2, maxDanger: 8, requiredProgress: 3, allowedStats: ["mind", "courage", "body", "charm"], difficulty: 12, clueIds: ["fake-claws", "bell-after-death", "cut-bell-rope"], npcIds: ["tomas-apprentice", "bruno-miller", "elias-bailiff", "accused-wolf"], imagePrompt: "molino bajo lluvia y antorchas", ambientSoundPrompt: "madera, agua y turba", multipleChoiceOptions: [
        option("question-tomas-bell", "Interrogar a Tomás sobre la campana", "talk", "charm", "medium", "Presionar a Tomás por el horario sin convertirlo en espectáculo.", { actionType: "interrogar_npc", energyCost: 0, targetId: "tomas-apprentice", targetKind: "npc", npcId: "tomas-apprentice", unlocksClues: ["bell-after-death"], unlocksFlags: ["tomas_spoke", "bell_after_death"], progressOnSuccess: 1, dangerOnPartial: 1, dangerOnFailure: 2, successOutcome: { kind: "npc_confession", clueId: "bell-after-death", summary: "Tomás admite que la campana sonó después de que el cadáver ya estaba en el molino.", visibleConsequence: "Tomás queda asustado pero dispuesto a ayudar si la turba no lo ve hablando." }, partialOutcome: { kind: "npc_evasion", summary: "Tomás mira hacia la cuerda cortada, pero no se anima a decirlo en voz alta.", visibleConsequence: "La duda queda instalada, aunque Elías exige una prueba material." }, failureOutcome: { kind: "npc_closes_off", summary: "Tomás se asusta y niega todo cuando Elías se acerca.", visibleConsequence: "Elías nota la presión y acerca a la turba al molino." }, narrationHints: { mustMention: ["Tomás", "campana", "turba afuera"], mustNotMention: ["compuerta", "bestia retrocede", "objeto marcado genérico", "barro removido", "ruta abierta"], style: "diálogo tenso" }, memoryImpact: "Tomás habló o se cerró sobre el horario de la campana.", exhausts: true }),
        option("compare-bite-wound", "Comparar la mordida con la herida del cadáver", "investigate", "mind", "low", "Comparar mandíbula, borde de herida y marca falsa sin mover el cuerpo.", { actionType: "comparar_evidencia", energyCost: 0, targetId: "cadaver-bite-evidence", targetKind: "object", objectId: "cadaver-bite-evidence", unlocksClues: ["fake-claws"], unlocksFlags: ["fake_claws_seen"], progressOnSuccess: 1, dangerOnFailure: 1, successOutcome: { kind: "evidence_confirmed", clueId: "fake-claws", summary: "La mordida fue marcada después de la muerte; no coincide con una mandíbula real.", visibleConsequence: "La acusación contra Nicolás pierde fuerza frente a quien vea la herida." }, partialOutcome: { kind: "evidence_partial", summary: "La herida es rara, pero falta una prueba para sostenerlo frente a la turba.", visibleConsequence: "Bruno duda, pero Elías todavía puede desacreditar la observación." }, failureOutcome: { kind: "evidence_contaminated", summary: "La manipulación embarró el borde de la herida y Elías usa eso contra el grupo.", visibleConsequence: "El peligro social sube porque la prueba queda discutible." }, narrationHints: { mustMention: ["cadáver", "mordida", "herida"], mustNotMention: ["interrogar testigos", "compuerta", "ruta", "bestia retrocede"], style: "detalle físico y contradicción" }, memoryImpact: "La herida del cadáver fue comparada con una mordida real.", exhausts: true }),
        option("confront-elias-mob", "Enfrentar a Elías frente a la turba", "talk", "courage", "medium", "Desafiar su autoridad y obligarlo a explicar por qué quiere mover el cuerpo.", { actionType: "confrontar_npc", energyCost: 1, targetId: "elias-bailiff", targetKind: "npc", npcId: "elias-bailiff", unlocksFlags: ["elias_publicly_challenged"], progressOnSuccess: 1, dangerOnPartial: 1, dangerOnFailure: 2, successOutcome: { kind: "npc_exposed", summary: "Elías pierde control un segundo y revela que ya tenía preparada el acta de ejecución antes del informe.", visibleConsequence: "La turba escucha una contradicción de autoridad y baja la certeza de ejecución inmediata." }, partialOutcome: { kind: "social_pressure", summary: "La turba duda, pero Elías exige una prueba concreta antes de ceder.", visibleConsequence: "El grupo gana un respiro mínimo y queda obligado a mostrar evidencia." }, failureOutcome: { kind: "npc_closes_off", summary: "Elías acusa al grupo de proteger a una bestia.", visibleConsequence: "El peligro social sube y Nicolás queda más cerca de la primera pedrada." }, narrationHints: { mustMention: ["Elías", "turba", "autoridad"], mustNotMention: ["bestia retrocede", "compuerta", "barro removido", "objeto marcado genérico"], style: "choque social" }, memoryImpact: "Elías fue desafiado públicamente ante la turba.", exhausts: true }),
        option("inspect-bell-rope", "Revisar la cuerda cortada de la campana", "investigate", "mind", "low", "Mirar fibras, corte y altura sin convertirlo en interrogatorio.", { actionType: "investigar_objeto", energyCost: 0, targetId: "object-bell-rope", targetKind: "object", objectId: "object-bell-rope", unlocksClues: ["cut-bell-rope"], unlocksFlags: ["bell_rope_cut"], progressOnSuccess: 1, dangerOnFailure: 1, successOutcome: { kind: "evidence_confirmed", clueId: "cut-bell-rope", summary: "Los cortes son de herramienta humana, no de garra.", visibleConsequence: "La campana queda como prueba física de preparación previa." }, partialOutcome: { kind: "evidence_partial", summary: "La cuerda parece cortada, pero no alcanza para acusar a nadie.", visibleConsequence: "La prueba sirve para dudar, no para cerrar el caso." }, failureOutcome: { kind: "evidence_contaminated", summary: "La cuerda se contamina o desaparece en el caos.", visibleConsequence: "El grupo pierde una prueba limpia y Elías aprovecha la confusión." }, narrationHints: { mustMention: ["cuerda", "campana", "corte"], mustNotMention: ["confesión", "compuerta", "bestia retrocede", "barro removido"], style: "observación física" }, memoryImpact: "La cuerda de la campana fue revisada como evidencia física.", exhausts: true }),
        option("protect-nicolas-stone", "Proteger a Nicolás de la primera pedrada", "defend", "body", "medium", "Interponerse cuando la turba prueba hasta dónde puede llegar.", { actionType: "proteger_aliado", energyCost: 1, targetId: "accused-wolf", targetKind: "npc", npcId: "accused-wolf", unlocksFlags: ["nicolas_first_stone_blocked"], progressOnSuccess: 0.75, dangerOnPartial: 1, dangerOnFailure: 2, successOutcome: { kind: "ally_protected", summary: "Nicolás sobrevive a la primera pedrada y empieza a confiar en el grupo.", visibleConsequence: "Nicolás mira al grupo como aliados, no como curiosos." }, partialOutcome: { kind: "ally_protected", summary: "Lo protegen, pero alguien del grupo recibe el golpe o pierde fuerza.", visibleConsequence: "La turba entiende que el grupo pagará físicamente por defenderlo." }, failureOutcome: { kind: "ally_harmed", summary: "Nicolás queda herido y su transformación se acelera.", visibleConsequence: "El miedo sube porque la sangre de Nicolás parece confirmar lo que la turba quiere creer." }, narrationHints: { mustMention: ["Nicolás", "pedrada", "turba"], mustNotMention: ["compuerta", "barro removido", "confesión de Tomás", "bestia retrocede"], style: "urgencia corporal" }, memoryImpact: "Nicolás fue protegido o herido durante la primera violencia pública.", exhausts: true })
      ] },
      { id: "accused-wolf", title: "El Lobo Acusado", description: "Nicolás espera encadenado en una capilla lateral. Mara no se sienta: mide ventanas. Doña Irma guarda las llaves.", objective: "Decidir si confiar en Nicolás y revisar heridas, grilletes y coartada.", dramaticObjective: "Elegir entre tratar al acusado como monstruo o como testigo peligroso.", mainConflict: "Confianza contra miedo heredado.", location: "capilla lateral", timePressure: "La turba pide que lo saquen antes de la lluvia fuerte.", initialDanger: 3, maxDanger: 8, requiredProgress: 3, allowedStats: ["mind", "charm", "courage", "focus"], difficulty: 13, clueIds: ["silver-burns", "mara-letter"], npcIds: ["accused-wolf", "mara-sister", "irma-bellkeeper", "elias-bailiff"], imagePrompt: "capilla pequeña, cadenas de plata", ambientSoundPrompt: "lluvia en vitral y respiración", multipleChoiceOptions: [
        option("check-silver-chains", "Revisar los grilletes de Nicolás", "investigate", "mind", "low", "Comparar quemaduras con el arresto declarado.", { actionType: "investigar_objeto", energyCost: 0, targetId: "nicolas-silver-chains", targetKind: "object", npcId: "accused-wolf", unlocksClues: ["silver-burns"], unlocksFlags: ["illegal_chains_seen"], possibleOutcomeHint: "Los grilletes prueban que lo redujeron antes de la orden oficial.", exhausts: true }),
        option("earn-mara-trust", "Pedir a Mara la verdad de la carta", "talk", "charm", "medium", "Prometer protección a cambio de la media carta.", { actionType: "negociar", energyCost: 1, targetId: "mara-sister", targetKind: "npc", npcId: "mara-sister", objectId: "mara-letter-object", objectStateOnSuccess: "intacto", unlocksClues: ["mara-letter"], unlocksFlags: ["mara_trusts_party"], progressOnSuccess: 1, possibleOutcomeHint: "Mara entrega una coartada incompleta y queda ligada al grupo.", exhausts: true }),
        option("hide-nicolas", "Esconder a Nicolás antes de la ejecución", "defend", "courage", "high", "Moverlo sin que Elías o la turba lo vean.", { actionType: "proteger_aliado", energyCost: 2, targetId: "accused-wolf", targetKind: "npc", npcId: "accused-wolf", routeId: "chapel-hidden-door", routeStatusOnSuccess: "open", unlocksFlags: ["nicolas_hidden"], dangerOnPartial: 1, dangerOnFailure: 3, possibleOutcomeHint: "Nicolás queda vivo, pero esconderlo puede parecer confesión.", exhausts: true })
      ] },
      { id: "red-forest", title: "El Bosque Rojo", description: "El rastro sale del molino pero no corre hacia guarida: cruza barro pesado, ramas bajas y marcas viejas de frontera.", objective: "Seguir el rastro real sin atraer a los cazadores.", dramaticObjective: "Cambiar la pregunta de quién tiene garras a quién preparó el camino.", mainConflict: "Rastreo contra emboscada.", location: "sendero trasero hacia el bosque", timePressure: "Los cazadores barren el bosque al cierre de ronda.", initialDanger: 4, maxDanger: 9, requiredProgress: 3, allowedStats: ["mind", "luck", "courage", "focus"], difficulty: 13, clueIds: ["mud-to-mayor"], npcIds: ["mara-sister", "bruno-miller"], enemyIds: ["cursed-beast"], hasCombat: true, imagePrompt: "bosque rojo, barro y antorchas lejanas", ambientSoundPrompt: "ramas, lluvia y aullido", multipleChoiceOptions: [
        option("follow-mud-to-mayor", "Seguir el rastro de barro hasta la casa del alcalde", "investigate", "mind", "medium", "Avanzar sin pisar las marcas útiles.", { actionType: "abrir_ruta", energyCost: 1, targetId: "mayor-back-door", targetKind: "route", routeId: "route-mayor-house", routeStatusOnSuccess: "open", requiredClues: ["cut-bell-rope"], unlocksClues: ["mud-to-mayor"], unlocksFlags: ["route_to_mayor_open"], possibleOutcomeHint: "El rastro no lleva a lobos: lleva a la puerta trasera de Roldán.", exhausts: true }),
        option("distract-hunters", "Despistar a los cazadores con una falsa pista", "create", "luck", "medium", "Ganar tiempo sin incriminar a Nicolás.", { actionType: "mentir", energyCost: 1, targetId: "mob", targetKind: "faction", unlocksFlags: ["hunters_delayed"], dangerOnFailure: 2, possibleOutcomeHint: "Los cazadores pierden una ronda, pero sospechan del grupo.", exhausts: true }),
        option("drive-off-beast", "Hacer retroceder a la Bestia Maldita", "fight", "courage", "high", "Cubrir la retirada cuando la sombra cruza el sendero.", { actionType: "combatir", energyCost: 2, targetId: "cursed-beast", targetKind: "creature", unlocksFlags: ["beast_wounded"], dangerOnPartial: 1, dangerOnFailure: 3, possibleOutcomeHint: "La Bestia retrocede o marca a alguien con luna fría.", combatEffect: "La Bestia queda herida si el golpe supera su defensa.", exhausts: false })
      ] },
      { id: "mayor-house", title: "La Casa del Alcalde", description: "La casa de Roldán huele a cera cara y papel mojado. Elías vigila la puerta; Tomás reconoce el pasillo y se arrepiente de inmediato.", objective: "Descubrir quién fabricó las pruebas.", dramaticObjective: "Convertir autoridad en sospecha pública.", mainConflict: "Archivo cerrado contra pruebas robadas.", location: "archivo trasero de Roldán", timePressure: "Roldán quema papeles si oye la campana.", initialDanger: 5, maxDanger: 9, requiredProgress: 3, allowedStats: ["mind", "charm", "focus", "courage"], difficulty: 14, clueIds: ["ritual-tool", "blue-ink-ledger"], npcIds: ["mayor-roldan", "elias-bailiff", "tomas-apprentice", "nameless-heir"], imagePrompt: "archivo oscuro, cera azul y ventana abierta", ambientSoundPrompt: "papel, pasos y lluvia", multipleChoiceOptions: [
        option("search-roldan-archive", "Abrir el armario de plata vieja", "investigate", "mind", "medium", "Buscar la herramienta sin romper toda la habitación.", { actionType: "investigar_objeto", energyCost: 1, targetId: "ritual-tool-object", targetKind: "object", objectId: "ritual-tool-object", objectStateOnSuccess: "intacto", requiredFlags: ["route_to_mayor_open"], unlocksClues: ["ritual-tool"], unlocksFlags: ["ritual_tool_found"], possibleOutcomeHint: "La cuchilla de plata aparece con harina vieja en los dientes.", exhausts: true }),
        option("read-blue-ledger", "Leer el acta escrita con tinta azul", "investigate", "focus", "medium", "Comparar fecha, firma y orden de ejecución.", { actionType: "investigar_objeto", energyCost: 1, targetId: "blue-ledger-object", targetKind: "object", objectId: "blue-ledger-object", objectStateOnSuccess: "intacto", unlocksClues: ["blue-ink-ledger"], unlocksFlags: ["blue_ledger_found"], possibleOutcomeHint: "El acta condena a Nicolás antes de que nadie lo interrogue.", exhausts: true }),
        option("confront-roldan", "Confrontar a Roldán con Tomás presente", "talk", "charm", "high", "Forzar una contradicción sin dejar solo al testigo.", { actionType: "confrontar_npc", energyCost: 2, targetId: "mayor-roldan", targetKind: "npc", npcId: "mayor-roldan", requiredClues: ["blue-ink-ledger"], unlocksFlags: ["roldan_exposed"], dangerOnPartial: 1, dangerOnFailure: 3, possibleOutcomeHint: "Roldán pierde calma o Tomás queda en riesgo.", exhausts: true })
      ] },
      { id: "moon-bell", title: "La Campana de Luna", description: "La torre tiembla con cada grito de abajo. Doña Irma tiene la llave; Mara mira la soga cortada; el sello frío espera bajo el bronce.", objective: "Romper o usar el sello lunar antes de la ejecución.", dramaticObjective: "Elegir entre verdad profunda y seguridad inmediata.", mainConflict: "Reliquia contra vida presente.", location: "campanario de la capilla", timePressure: "Si la campana suena completa, la Bestia se alimenta.", initialDanger: 6, maxDanger: 10, requiredProgress: 3, allowedStats: ["focus", "courage", "mind", "charm"], difficulty: 15, clueIds: ["moon-seal"], npcIds: ["irma-bellkeeper", "mara-sister", "mayor-roldan", "nameless-heir", "accused-wolf"], enemyIds: ["cursed-beast"], hasCombat: true, imagePrompt: "campanario mojado, sello lunar", ambientSoundPrompt: "campana grave y lluvia", multipleChoiceOptions: [
        option("question-irma-key", "Pedirle a Doña Irma la llave de la campana", "talk", "charm", "medium", "Convencerla de arriesgar su puesto por Nicolás.", { actionType: "negociar", energyCost: 1, targetId: "irma-bellkeeper", targetKind: "npc", npcId: "irma-bellkeeper", unlocksFlags: ["irma_gives_key"], possibleOutcomeHint: "Irma entrega la llave y exige que nadie use la campana por venganza.", exhausts: true }),
        option("study-moon-seal", "Leer el sello lunar bajo el bronce", "magic", "focus", "medium", "Entender qué alimenta a la Bestia.", { actionType: "usar_objeto", energyCost: 1, targetId: "moon-bell-seal", targetKind: "object", objectId: "moon-bell-seal", objectStateOnSuccess: "vinculado", requiredFlags: ["irma_gives_key"], unlocksClues: ["moon-seal"], unlocksFlags: ["moon_seal_known", "secret_route_open"], possibleOutcomeHint: "El sello revela que la campana convierte miedo colectivo en bestia.", exhausts: true }),
        option("break-moon-seal", "Romper el sello lunar para salvar a Nicolás", "defend", "courage", "high", "Destruir la marca antes de que suene completa.", { actionType: "sacrificar_recurso", energyCost: 3, targetId: "moon-bell-seal", targetKind: "object", objectId: "moon-bell-seal", objectStateOnSuccess: "danado", requiredClues: ["moon-seal"], unlocksFlags: ["moon_seal_broken"], dangerOnPartial: 1, dangerOnFailure: 3, possibleOutcomeHint: "Nicolás gana tiempo, pero algo del sello puede soltarse.", exhausts: true })
      ] },
      { id: "rain-trial", title: "Juicio Bajo la Lluvia", description: "La plaza está llena. Nicolás tiene barro en las rodillas. Roldán sostiene el acta. La campana espera una orden que nadie quiere asumir.", objective: "Revelar la verdad, salvar a quien se pueda y pagar el coste.", dramaticObjective: "Cerrar la historia con una decisión pública irreversible.", mainConflict: "Pruebas contra miedo colectivo.", location: "plaza frente a la capilla", timePressure: "La cuarta ronda fuerza sentencia.", initialDanger: 7, maxDanger: 10, requiredProgress: 4, isFinal: true, allowedStats: ["mind", "charm", "courage", "focus"], difficulty: 15, clueIds: ["fake-claws", "ritual-tool", "blue-ink-ledger", "moon-seal"], npcIds: ["accused-wolf", "mara-sister", "tomas-apprentice", "irma-bellkeeper", "elias-bailiff", "mayor-roldan", "nameless-heir"], enemyIds: ["cursed-beast"], imagePrompt: "juicio en plaza bajo lluvia", ambientSoundPrompt: "turba, lluvia y campana", multipleChoiceOptions: [
        option("accuse-with-proof", "Acusar a Roldán con las pruebas reunidas", "investigate", "mind", "medium", "Ordenar las pruebas sin darle a la turba una excusa para atacar.", { actionType: "revelar_prueba", energyCost: 1, targetId: "mayor-roldan", targetKind: "npc", requiredClues: ["fake-claws", "blue-ink-ledger"], unlocksFlags: ["truth_final_route"], progressOnSuccess: 2.5, possibleOutcomeHint: "La acusación pública abre un final de verdad con coste.", exhausts: true }),
        option("mercy-for-confession", "Ofrecer misericordia a cambio de confesión", "talk", "charm", "medium", "Salvar vidas a cambio de una verdad incompleta.", { actionType: "tomar_decision_moral", energyCost: 1, targetId: "mayor-roldan", targetKind: "npc", unlocksFlags: ["mercy_final_route"], progressOnSuccess: 2.5, possibleOutcomeHint: "La misericordia puede obtener confesión y dividir a la aldea.", exhausts: true }),
        option("use-seal-secret", "Usar el sello para revelar la verdad profunda", "magic", "focus", "high", "Mostrar al Heredero y la deuda lunar ante todos.", { actionType: "revelar_prueba", energyCost: 2, targetId: "moon-bell-seal", targetKind: "object", requiredClues: ["moon-seal"], unlocksFlags: ["secret_deep_truth", "secret_route_open"], progressOnSuccess: 2.5, dangerOnFailure: 2, possibleOutcomeHint: "El final secreto queda disponible, pero la Bestia escucha.", exhausts: true }),
        option("name-false-culprit", "Entregar un culpable falso para calmar a la turba", "talk", "charm", "high", "Mentir para que no haya ejecución inmediata.", { actionType: "mentir", energyCost: 1, targetId: "mob", targetKind: "faction", unlocksFlags: ["false_victory_route"], progressOnSuccess: 2.5, dangerOnPartial: 1, dangerOnFailure: 2, possibleOutcomeHint: "La plaza se calma con una mentira que volverá a cobrar precio.", exhausts: true }),
        option("destroy-proof-save-wolf", "Romper la prueba para salvar al inocente", "defend", "courage", "high", "Destruir la evidencia decisiva y sacar a Nicolás vivo.", { actionType: "sacrificar_recurso", energyCost: 3, targetId: "blue-ledger-object", targetKind: "object", objectId: "blue-ledger-object", objectStateOnSuccess: "danado", unlocksFlags: ["heroic_sacrifice_route"], progressOnSuccess: 2.5, dangerOnFailure: 2, possibleOutcomeHint: "Nicolás vive ahora, pero la verdad queda herida.", exhausts: true })
      ] }
    ]
  }),
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
  themeSkill: string;
  scenes: string[];
};

const narrativeSeeds: NarrativeSeed[] = [
  { id: "luna-roja", title: "El Asesino de la Luna Roja", genre: "hombre lobo e intriga de aldea", description: "Una aldea quiere ejecutar a un licantropo acusado, pero las pruebas fueron fabricadas con magia lunar y mano humana.", themeSkill: "coartadas", scenes: ["El Cadaver Bajo el Molino", "El Bosque Rojo", "El Lobo Acusado", "El Juicio Bajo la Luna"] },
  { id: "conde-vampiro", title: "La Cena del Conde Vacio", genre: "mansion gotica y sangre familiar", description: "Una mansion abandonada vuelve a encender sus luces; quiza no desperto el conde, sino una mentira sostenida con su sangre.", themeSkill: "negociacion peligrosa", scenes: ["El Porton de la Mansion", "El Salon de los Retratos", "La Cripta de Sangre", "La Cena del Conde Vacio"] },
  { id: "bosque-embrujado", title: "El Bosque que Recuerda tu Nombre", genre: "bosque embrujado y pacto roto", description: "Los senderos cambian y repiten voces de personas perdidas; los arboles quieren que alguien recuerde un pacto roto.", themeSkill: "supervivencia", scenes: ["El Sendero que Cambia", "El Claro de los Nombres", "La Casa Bajo las Raices", "El Corazon del Bosque"] },
  { id: "reliquias-alba-negra", title: "Las Siete Reliquias del Alba Negra", genre: "reliquias sagradas y orden rota", description: "El grupo debe recuperar objetos sagrados antes de que una orden quebrada los consagre al reves.", themeSkill: "ritual", scenes: ["El Santuario Saqueado", "El Mercado de Reliquias Falsas", "La Cripta del Primer Portador", "El Altar del Alba Negra"] },
  { id: "escuela-no-amanece", title: "La Escuela que No Amanece", genre: "academia encantada y noche repetida", description: "Una academia queda atrapada en una noche repetida; alumnos desaparecidos siguen asistiendo sin que nadie recuerde sus nombres.", themeSkill: "memoria", scenes: ["El Aula de las Velas", "El Pasillo que Repite", "La Biblioteca Cerrada", "El Examen de Medianoche"] },
  { id: "isla-devora-mapas", title: "La Isla que Devora Mapas", genre: "piratas y geografia imposible", description: "Una tripulacion llega a una isla que borra mapas y cambia la costa; el tesoro no esta enterrado, espera dueno.", themeSkill: "cartografia", scenes: ["La Costa sin Norte", "El Barco Encallado", "La Cueva de las Mareas", "El Tesoro que Respira"] },
  { id: "castillo-culpa", title: "El Castillo que Heredo la Culpa", genre: "castillo maldito y linaje culpable", description: "Un castillo encierra a descendientes de una familia que juro proteger el valle y termino sacrificandolo.", themeSkill: "linajes", scenes: ["El Puente de los Juramentos", "El Salon de los Escudos Negros", "La Habitacion sin Heredero", "La Torre que No Perdona"] },
  { id: "cripta-rey", title: "La Cripta del Rey sin Ultima Palabra", genre: "cripta real y orden falsificada", description: "Un rey muerto se niega a descansar porque su ultima orden fue cambiada por alguien vivo.", themeSkill: "juramentos", scenes: ["La Puerta de las Monedas Frias", "El Corredor de los Nombres Borrados", "La Camara del Juramento", "El Trono Bajo Tierra"] }
];

function narrativeCampaign(seed: NarrativeSeed): Campaign {
  const slug = seed.id;
  return campaign({
    id: seed.id,
    title: seed.title,
    genre: seed.genre,
    description: seed.description,
    storyHook: "Jugar una campana de cuatro escenas como mini-libro interactivo, con RAG narrativo, memoria viva, objetos persistentes, facciones y finales multiples.",
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
