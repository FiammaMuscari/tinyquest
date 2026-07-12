import { z } from "zod";
import { dungeonNarrationOutputSchema } from "./narration-contract";

// Historia improvisada: el LLM entrega SOLO ficción; los huecos los rellena
// buildImprovisedCampaign con la plantilla probada, así que casi todo es laxo.
export const improvisedStorySchema = z.object({
  title: z.string().min(3),
  genre: z.string().catch("fantasía oscura"),
  premise: z.string().min(20),
  storyHook: z.string().catch(""),
  hiddenTruth: z.string().catch(""),
  themeSkill: z.string().catch("investigación"),
  twist: z.string().catch(""),
  stakes: z.array(z.string()).catch([]),
  threat: z.object({
    name: z.string().catch("Amenaza encubierta"),
    description: z.string().catch(""),
    specialMove: z.string().catch(""),
    appearance: z.string().optional().catch(undefined)
  }).catch({ name: "Amenaza encubierta", description: "", specialMove: "", appearance: undefined }),
  // buildImprovisedCampaign rellena títulos/nombres vacíos y usa solo las primeras
  // 4 escenas / 3 NPCs / 3 pistas: una entrada extra o incompleta no invalida la historia.
  scenes: z.array(z.object({
    title: z.string().catch(""),
    objective: z.string().catch(""),
    keyObject: z.string().catch(""),
    escapeRoute: z.string().catch("")
  })).min(3),
  npcs: z.array(z.object({
    name: z.string().catch(""),
    role: z.string().catch("secundario"),
    description: z.string().catch(""),
    motive: z.string().catch(""),
    secret: z.string().catch(""),
    desire: z.string().optional().catch(undefined),
    fear: z.string().optional().catch(undefined),
    appearance: z.string().optional().catch(undefined),
    bond: z.string().optional().catch(undefined),
    whyMightLie: z.string().optional().catch(undefined)
  })).min(1),
  clues: z.array(z.object({
    title: z.string().catch(""),
    text: z.string().catch(""),
    sceneIndex: z.number().catch(1),
    isFalse: z.boolean().optional().catch(undefined)
  })).min(1),
  // Bloques nuevos, todos opcionales: si el LLM los omite o los rompe, la historia sigue válida.
  summary: z.object({
    objective: z.string().optional().catch(undefined),
    risk: z.string().optional().catch(undefined),
    firstMystery: z.string().optional().catch(undefined),
    timeLimit: z.string().optional().catch(undefined)
  }).optional().catch(undefined),
  keywordsUsed: z.array(z.object({
    idea: z.string().catch(""),
    how: z.string().catch("")
  })).optional().catch(undefined),
  heroBond: z.string().optional().catch(undefined),
  evidence: z.array(z.string()).optional().catch(undefined),
  hiddenTwists: z.array(z.string()).optional().catch(undefined),
  npcRelations: z.array(z.object({
    from: z.string().catch(""),
    to: z.string().catch(""),
    nature: z.string().catch("")
  })).optional().catch(undefined)
});

export const memorySummarySchema = z.object({
  clues: z.array(z.string()),
  unresolvedThreads: z.array(z.string()),
  lastBeat: z.string(),
  suspects: z.array(z.string()).default([]),
  betrayals: z.array(z.string()).default([]),
  bonds: z.array(z.string()).default([]),
  stakes: z.array(z.string()).default([]),
  currentTwist: z.string().default(""),
  facts: z.array(z.string()).default([]),
  objects: z.array(z.string()).default([]),
  npcs: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  dangers: z.array(z.string()).default([]),
  forbiddenContradictions: z.array(z.string()).default([]),
  confirmedFacts: z.array(z.string()).default([]),
  suspicions: z.array(z.string()).default([]),
  damagedClues: z.array(z.string()).default([]),
  npcStates: z.array(z.string()).default([]),
  objectStates: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([])
});

export const dmMemoryUpdateSchema = z.object({
  summary: z.string().optional(),
  facts: z.array(z.string()).default([]),
  clues: z.array(z.string()).default([]),
  objects: z.array(z.string()).default([]),
  npcs: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  dangers: z.array(z.string()).default([]),
  forbiddenContradictions: z.array(z.string()).default([]),
  confirmedFacts: z.array(z.string()).default([]),
  suspicions: z.array(z.string()).default([]),
  damagedClues: z.array(z.string()).default([]),
  npcStates: z.array(z.string()).default([]),
  objectStates: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([])
});

export const dmNarrativeStatePatchSchema = z.object({
  factsAdded: z.array(z.string()).default([]),
  cluesAdded: z.array(z.string()).default([]),
  cluesDamaged: z.array(z.string()).default([]),
  npcUpdates: z.array(z.string()).default([]),
  objectUpdates: z.array(z.string()).default([]),
  dangerDelta: z.number().default(0),
  phaseSuggestion: z.string().default("")
}).default({ factsAdded: [], cluesAdded: [], cluesDamaged: [], npcUpdates: [], objectUpdates: [], dangerDelta: 0, phaseSuggestion: "" });

export const stateSuggestionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addTemporaryItem"), item: z.string() }),
  z.object({ type: z.literal("removeTemporaryItem"), item: z.string() }),
  z.object({ type: z.literal("introduceNPC"), npcName: z.string() }),
  z.object({ type: z.literal("increaseSceneProgress"), amount: z.number() }),
  z.object({ type: z.literal("revealClueId"), clueId: z.string() }),
  z.object({ type: z.literal("markObjectiveCompleted") }),
  z.object({ type: z.literal("adjustDangerClock"), amount: z.number() })
]);

export const narrationResponseSchema = z.object({
  narration: z.string().min(10),
  npcDialogue: z.array(z.string()).max(2),
  consequence: z.string().min(4),
  nextOptions: z.array(z.string()).min(2).max(3),
  nextOptionsText: z.array(z.string()).min(2).max(3).optional(),
  statePatch: dmNarrativeStatePatchSchema,
  plotBeat: z.object({
    title: z.string(),
    hook: z.string(),
    twist: z.string(),
    characterFocus: z.string(),
    threat: z.string(),
    continuity: z.string()
  }),
  sections: z.object({
    narration: z.string(),
    dialogue: z.string(),
    consequence: z.string(),
    options: z.array(z.string()).min(2).max(3)
  }).optional(),
  playerNarration: z.string().optional(),
  consequenceText: z.string().optional(),
  engineSummary: z.string().optional(),
  debugText: z.string().optional(),
  memoryUpdate: dmMemoryUpdateSchema,
  stateSuggestions: z.array(stateSuggestionSchema).default([]),
  pacingHint: z.enum(["continue", "next_scene", "finale"]).default("continue"),
  structuredNarration: dungeonNarrationOutputSchema.optional(),
  enrichedOptions: z.array(z.object({ id: z.string(), label: z.string() })).optional()
});
