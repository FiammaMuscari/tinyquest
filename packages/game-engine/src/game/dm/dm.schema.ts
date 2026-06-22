import { z } from "zod";

export const DmNextOptionSchema = z.object({
  label: z.string().min(3),
  type: z.enum(["investigate", "confront", "protect", "magic", "stealth", "combat", "negotiate", "ritual", "escape", "social", "craft", "survival", "sacrifice"]),
  stat: z.enum(["cuerpo", "mente", "alma", "sombra"]),
  risk: z.enum(["bajo", "medio", "alto"]),
  reason: z.string().min(3)
});

export const DmStatePatchSchema = z.object({
  dangerDelta: z.number().int(),
  clueUpdates: z.array(z.unknown()),
  itemUpdates: z.array(z.unknown()),
  nftUpdates: z.array(z.unknown()),
  npcUpdates: z.array(z.unknown()),
  secondaryNPCUpdates: z.array(z.unknown()),
  factionUpdates: z.array(z.unknown()),
  relationshipUpdates: z.array(z.unknown()),
  locationUpdates: z.array(z.unknown()),
  creatureUpdates: z.array(z.unknown()),
  routeUpdates: z.array(z.unknown()),
  endingScoreDelta: z.record(z.string(), z.number()),
  sceneClockDelta: z.object({ sceneId: z.string(), amount: z.number().int() }).nullable(),
  nextSceneId: z.string().nullable()
});

export const DmTurnJsonSchema = z.object({
  ok: z.literal(true),
  turn: z.object({
    characterName: z.string(),
    sceneId: z.string(),
    actionId: z.string(),
    actionLabel: z.string(),
    stat: z.enum(["cuerpo", "mente", "alma", "sombra"]),
    rollTotal: z.number(),
    difficulty: z.number(),
    result: z.enum(["success", "partial", "failure"]),
    d6Cost: z.number().int().min(0).max(6)
  }),
  narration: z.string().min(40).max(1400),
  npcDialogue: z.string(),
  concreteChange: z.string().min(5),
  statePatch: DmStatePatchSchema,
  nextOptions: z.array(DmNextOptionSchema).min(1).max(4),
  control: z.object({
    usedRag: z.boolean(),
    respectedMemory: z.boolean(),
    introducedConcreteChange: z.boolean(),
    usedConcreteObjectOrNPC: z.boolean(),
    repeatedGenericPhrase: z.boolean(),
    repeatedKnownClue: z.boolean(),
    jsonValid: z.boolean()
  })
});

export type DmTurnJson = z.infer<typeof DmTurnJsonSchema>;
