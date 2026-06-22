import { z } from "zod";
import { dungeonNarrationOutputSchema } from "./narration-contract";

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
  structuredNarration: dungeonNarrationOutputSchema.optional()
});
