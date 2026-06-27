import { z } from "zod";
import { validateTurnContextCoherence, type DungeonNarrationOutput, type ResolutionPlan } from "@tiny-quest/game-engine";

const resultSchema = z.enum(["success", "partial", "failure"]);
const speakerKindSchema = z.enum(["player", "bot", "npc", "narrator"]);
const revealModeSchema = z.enum(["hint", "partial", "full"]);

export const dungeonNarrationOutputSchema = z.object({
  narration: z.string().min(10),
  dialogue: z.array(z.object({ speakerId: z.string(), speakerName: z.string(), speakerKind: speakerKindSchema, line: z.string(), intention: z.string() })).default([]),
  consequence: z.object({ summary: z.string(), physicalChange: z.string().optional(), socialChange: z.string().optional(), emotionalChange: z.string().optional() }),
  dangerChange: z.object({ before: z.number(), after: z.number(), manifestation: z.string() }),
  clueReveals: z.array(z.object({ clueId: z.string(), title: z.string(), mode: revealModeSchema, text: z.string() })).default([]),
  memoryPatch: z.object({ factsToRemember: z.array(z.string()), factsToUpdate: z.array(z.string()), factsToForget: z.array(z.string()).optional() }),
  continuityWarnings: z.array(z.string()).default([]),
  enrichedOptions: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  // Legacy optional fields
  immediateAction: z.object({ actorId: z.string(), actorName: z.string(), text: z.string().min(3) }).optional(),
  rollPresentation: z.object({ total: z.number(), dc: z.number(), result: resultSchema, label: z.string().min(3) }).optional(),
  companionMoments: z.array(z.object({ characterId: z.string(), characterName: z.string(), action: z.string(), emotion: z.string(), relevance: z.enum(["minor", "major"]), botIntent: z.enum(["protect", "doubt", "confront", "investigate", "distract", "retreat", "accuse", "comfort", "guard", "observe"]).optional(), botEmotion: z.enum(["afraid", "angry", "guilty", "loyal", "suspicious", "desperate", "calm", "focused"]).optional(), dialogue: z.string().optional() })).optional(),
  worldStateChange: z.object({ text: z.string(), changedNpcIds: z.array(z.string()), changedObjectIds: z.array(z.string()), changedClueIds: z.array(z.string()) }).optional(),
  uiFocus: z.object({ mainText: z.string(), highlight: z.enum(["roll", "clue", "danger", "dialogue", "consequence", "combat"]), cardType: z.enum(["discovery", "danger", "failure", "partial", "success", "combat", "social"]), priority: z.enum(["low", "medium", "high"]) }).optional(),
});

export type DungeonNarrationValidationIssue = { level: "warning" | "error"; code: string; message: string };

function planResultLabel(plan: ResolutionPlan) {
  if (plan.roll.result === "success") return "Éxito";
  if (plan.roll.result === "partial") return "Éxito parcial";
  return "Fallo";
}

function cardType(plan: ResolutionPlan): "discovery" | "danger" | "failure" | "partial" | "success" | "combat" | "social" {
  if (plan.uiFocus.showAs === "combat_hit") return "combat";
  if (plan.uiFocus.showAs === "danger_spike") return "danger";
  if (plan.roll.result === "failure") return "failure";
  if (plan.roll.result === "partial") return "partial";
  if (plan.uiFocus.highlight === "clue") return "discovery";
  if (plan.uiFocus.showAs === "social_pressure") return "social";
  return "success";
}

function allowedSpeakerIds(plan: ResolutionPlan) {
  return new Set([plan.actorId, "narrator", ...plan.validContext.presentNpcIds, ...plan.botDirectives.map((bot) => bot.botId)]);
}

function buildFallbackNarrationText(plan: ResolutionPlan): string {
  const actor = plan.actorName;
  const consequence = plan.consequence.physicalChange ?? plan.consequence.socialChange ?? plan.consequence.summary;
  const target = plan.validContext.targetId?.replace(/_/g, " ") ?? plan.scene.title;
  if (plan.roll.result === "success") {
    const variants = [
      `${actor} actúa antes de que la escena se cierre. El movimiento es preciso y el cambio, visible. ${consequence}`,
      `${actor} encuentra el ángulo correcto y lo aprovecha. ${consequence}`,
      `${actor} lee la situación y se mueve primero. ${consequence}`,
    ];
    return variants[Math.abs(plan.actorId.charCodeAt(0)) % variants.length];
  }
  if (plan.roll.result === "partial") {
    const variants = [
      `${actor} avanza sobre ${target}, pero no sin coste. ${consequence}`,
      `${actor} logra algo concreto, aunque la escena responde con presión. ${consequence}`,
    ];
    return variants[Math.abs(plan.actorId.charCodeAt(0)) % variants.length];
  }
  const variants = [
    `${actor} intenta mover la escena, pero algo falla antes de completarse. ${consequence}`,
    `${actor} presiona demasiado rápido. El momento se cierra antes de que pueda aprovecharlo. ${consequence}`,
  ];
  return variants[Math.abs(plan.actorId.charCodeAt(0)) % variants.length];
}

export function buildFallbackNarrationOutput(plan: ResolutionPlan): DungeonNarrationOutput {
  const companionMoments = plan.botDirectives.slice(0, 2).map((bot) => ({
    characterId: bot.botId,
    characterName: bot.name,
    action: bot.allowedActions[0] ?? `${bot.name} se mantiene cerca del grupo.`,
    emotion: bot.emotionalState,
    relevance: "minor" as const,
    botIntent: bot.botIntent,
    botEmotion: bot.botEmotion,
    dialogue: bot.speechStyle?.includes("firmes") ? "Atrás. Primero respira." : bot.speechStyle?.includes("seca") ? "No toquen eso." : undefined
  }));
  const clueReveals: DungeonNarrationOutput["clueReveals"] = plan.cluePolicy.canRevealNewClue
    ? plan.cluePolicy.allowedClueIds.map((clueId) => ({ clueId, title: clueId, mode: plan.cluePolicy.clueRevealMode === "full" ? "full" : plan.cluePolicy.clueRevealMode === "partial" ? "partial" : "hint", text: plan.consequence.clueEffect?.naturalDescription ?? plan.consequence.clueEffect?.clueTitle ?? clueId }))
    : [];
  return {
    narration: buildFallbackNarrationText(plan),
    immediateAction: { actorId: plan.actorId, actorName: plan.actorName, text: plan.actionText },
    rollPresentation: { total: plan.roll.total, dc: plan.roll.dc, result: plan.roll.result, label: `${planResultLabel(plan)}: ${plan.roll.total} vs ${plan.roll.dc}` },
    dialogue: [],
    companionMoments,
    consequence: {
      summary: plan.consequence.summary,
      physicalChange: plan.consequence.physicalChange,
      socialChange: plan.consequence.socialChange,
      emotionalChange: plan.consequence.emotionalChange
    },
    worldStateChange: {
      text: plan.consequence.summary,
      changedNpcIds: plan.npcDirectives.map((npc) => npc.npcId).filter((id) => plan.validContext.presentNpcIds.includes(id)),
      changedObjectIds: plan.validContext.usedObjectIds?.filter((id) => plan.validContext.presentObjectIds.includes(id)) ?? [],
      changedClueIds: clueReveals.map((clue) => clue.clueId)
    },
    dangerChange: { before: plan.scene.dangerBefore, after: plan.scene.dangerAfter, manifestation: plan.consequence.dangerManifestation ?? plan.consequence.dangerReason ?? "El peligro conserva su estado actual." },
    clueReveals,
    uiFocus: { mainText: plan.uiFocus.mainEvent, highlight: plan.uiFocus.highlight, cardType: cardType(plan), priority: plan.scene.dangerAfter >= 8 || plan.roll.result === "failure" ? "high" : plan.roll.result === "partial" ? "medium" : "low" },
    memoryPatch: plan.memoryPatch,
    continuityWarnings: [...plan.continuityWarnings]
  };
}

export function validateDungeonNarrationOutput(output: DungeonNarrationOutput, plan: ResolutionPlan): DungeonNarrationValidationIssue[] {
  const issues: DungeonNarrationValidationIssue[] = [];
  const speakers = allowedSpeakerIds(plan);
  for (const line of output.dialogue) {
    if (line.speakerKind !== "narrator" && !speakers.has(line.speakerId)) issues.push({ level: "error", code: "invalid-speaker", message: `Speaker ${line.speakerId} is not allowed.` });
  }
  const allowedClues = new Set(plan.cluePolicy.allowedClueIds);
  for (const clue of output.clueReveals) {
    if (!plan.cluePolicy.canRevealNewClue || !allowedClues.has(clue.clueId)) issues.push({ level: "error", code: "invalid-clue-reveal", message: `Clue ${clue.clueId} cannot be revealed.` });
  }
  if (output.consequence.summary !== plan.consequence.summary) issues.push({ level: "warning", code: "consequence-mismatch", message: "Consequence does not match ResolutionPlan." });
  if (output.dangerChange.before !== plan.scene.dangerBefore || output.dangerChange.after !== plan.scene.dangerAfter) issues.push({ level: "warning", code: "danger-mismatch", message: "Danger change does not match ResolutionPlan." });
  if (output.rollPresentation && (output.rollPresentation.total !== plan.roll.total || output.rollPresentation.dc !== plan.roll.dc || output.rollPresentation.result !== plan.roll.result)) issues.push({ level: "error", code: "roll-mismatch", message: "Roll presentation does not match ResolutionPlan." });
  issues.push(...validateTurnContextCoherence(plan, output).map((item) => ({ level: item.level, code: item.code, message: item.message })));
  return issues;
}

export function repairDungeonNarrationOutput(output: DungeonNarrationOutput, plan: ResolutionPlan): DungeonNarrationOutput {
  const fallback = buildFallbackNarrationOutput(plan);
  const speakers = allowedSpeakerIds(plan);
  const allowedClues = new Set(plan.cluePolicy.allowedClueIds);
  const continuityWarnings = [...output.continuityWarnings];
  const dialogue = output.dialogue.filter((line) => {
    const ok = line.speakerKind === "narrator" || speakers.has(line.speakerId);
    if (!ok) continuityWarnings.push(`Se eliminó diálogo de speaker no permitido: ${line.speakerId}.`);
    return ok;
  }).slice(0, 3);
  const clueReveals = plan.cluePolicy.canRevealNewClue
    ? output.clueReveals.filter((clue) => {
      const ok = allowedClues.has(clue.clueId);
      if (!ok) continuityWarnings.push(`Se eliminó clueReveal no permitido: ${clue.clueId}.`);
      return ok;
    })
    : [];
  if (!plan.cluePolicy.canRevealNewClue && output.clueReveals.length) continuityWarnings.push("Se eliminaron clueReveals porque cluePolicy.canRevealNewClue es false.");
  const companionMomentsRaw = output.companionMoments ?? [];
  return {
    ...fallback,
    ...output,
    immediateAction: fallback.immediateAction,
    rollPresentation: fallback.rollPresentation,
    dialogue,
    companionMoments: companionMomentsRaw.filter((moment) => speakers.has(moment.characterId)).slice(0, 3),
    consequence: fallback.consequence,
    worldStateChange: {
      text: plan.consequence.summary,
      changedNpcIds: (output.worldStateChange?.changedNpcIds ?? []).filter((id) => plan.validContext.presentNpcIds.includes(id)),
      changedObjectIds: (output.worldStateChange?.changedObjectIds ?? []).filter((id) => plan.validContext.presentObjectIds.includes(id)),
      changedClueIds: clueReveals.map((clue) => clue.clueId)
    },
    dangerChange: fallback.dangerChange,
    clueReveals,
    uiFocus: output.uiFocus ?? fallback.uiFocus,
    memoryPatch: { factsToRemember: output.memoryPatch?.factsToRemember ?? [], factsToUpdate: output.memoryPatch?.factsToUpdate ?? [], factsToForget: output.memoryPatch?.factsToForget },
    enrichedOptions: output.enrichedOptions,
    continuityWarnings: Array.from(new Set([...continuityWarnings, ...plan.continuityWarnings, ...validateTurnContextCoherence(plan, fallback).filter((item) => item.level === "warning").map((item) => item.message)]))
  };
}

export function parseDungeonNarrationOutput(raw: string | unknown, plan: ResolutionPlan): DungeonNarrationOutput {
  let value: unknown = raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    try { value = JSON.parse(cleaned); }
    catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start < 0 || end <= start) return buildFallbackNarrationOutput(plan);
      try { value = JSON.parse(cleaned.slice(start, end + 1)); } catch { return buildFallbackNarrationOutput(plan); }
    }
  }
  const parsed = dungeonNarrationOutputSchema.safeParse(value);
  if (!parsed.success) return buildFallbackNarrationOutput(plan);
  return repairDungeonNarrationOutput(parsed.data, plan);
}

export function toLegacyNarrationFields(output: DungeonNarrationOutput) {
  return {
    narration: output.narration,
    npcDialogue: output.dialogue.map((line) => `${line.speakerName}: ${line.line}`),
    consequence: output.consequence.summary
  };
}
