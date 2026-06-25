import type { ActionResolution, DungeonNarrationOutput, GameRoom } from "../../types";
import type { EmbeddedMemoryInput, EmbeddedMemoryType } from "./embedded-memory.types";

type BuildInput = {
  roomBefore: GameRoom;
  roomAfter: GameRoom;
  resolution: ActionResolution;
  narration?: DungeonNarrationOutput;
};

function importanceFor(type: EmbeddedMemoryType, resolution: ActionResolution): number {
  const outcome = resolution.check.outcome;
  switch (type) {
    case "clue": return outcome === "success" ? 0.9 : 0.6;
    case "moral_choice": return 0.85;
    case "npc_memory": return outcome === "success" ? 0.7 : 0.6;
    case "object_memory": return 0.55;
    case "failed_action": return outcome === "failure" ? 0.65 : 0.4;
    case "causal_link": return 0.75;
    case "combat": return 0.7;
    case "scene_transition": return 0.8;
    case "player_pattern": return 0.4;
    case "dialogue": return 0.5;
    case "fact": return 0.45;
    default: return 0.3;
  }
}

function base(room: GameRoom, resolution: ActionResolution, type: EmbeddedMemoryType): Omit<EmbeddedMemoryInput, "text" | "summaryLine"> {
  const scene = resolution.narrationRequest.currentScene;
  const actor = resolution.narrationRequest.activePlayer;
  return {
    campaignId: room.campaign.id,
    roomId: room.id,
    turn: room.turn,
    sceneId: scene.id,
    type,
    npcIds: [],
    objectIds: [],
    clueIds: [],
    playerIds: [actor.id],
    routeIds: [],
    tags: [resolution.check.outcome, scene.id],
    importance: importanceFor(type, resolution),
    resolved: false,
    createdAtTurn: room.turn,
    source: "resolution",
    truthStatus: "confirmed"
  };
}

function dedup(inputs: EmbeddedMemoryInput[], existing: string[]): EmbeddedMemoryInput[] {
  const existingSet = new Set(existing.map((t) => t.trim().toLowerCase()));
  return inputs.filter((m) => !existingSet.has(m.text.trim().toLowerCase()));
}

export function buildEmbeddedMemoriesFromTurn({ roomBefore, roomAfter, resolution, narration }: BuildInput): EmbeddedMemoryInput[] {
  const memories: EmbeddedMemoryInput[] = [];
  const actor = resolution.narrationRequest.activePlayer;
  const scene = resolution.narrationRequest.currentScene;
  const outcome = resolution.check.outcome;
  const plan = resolution.narrationRequest.resolutionPlan;
  const choice = scene.actionChoices.find((c) => c.id === (plan?.validContext.targetId ?? "")) ??
    scene.actionChoices.find((c) => resolution.narrationRequest.rawAction.includes(c.label));

  // 1. fact — always
  const factText = resolution.turnResolution.factualSummary || plan?.consequence.summary || `${actor.name} realizó: ${resolution.narrationRequest.rawAction}. Resultado: ${outcome}.`;
  if (factText.trim().length > 10) {
    memories.push({
      ...base(roomBefore, resolution, "fact"),
      text: factText.slice(0, 200),
      summaryLine: factText.slice(0, 80)
    });
  }

  // 2. clue — if clue revealed
  const revealedClueIds = resolution.turnResolution.revealedClueIds ?? [];
  for (const clueId of revealedClueIds.slice(0, 2)) {
    const clue = roomBefore.campaign.clues.find((c) => c.id === clueId);
    if (!clue) continue;
    const clueText = `${actor.name} descubrió: ${clue.text}`;
    memories.push({
      ...base(roomBefore, resolution, "clue"),
      text: clueText.slice(0, 200),
      summaryLine: clue.text.slice(0, 80),
      clueIds: [clueId],
      npcIds: scene.npcIds ?? [],
      importance: 0.9,
      truthStatus: "confirmed",
      source: "engine"
    });

    // 2b. causal_link for the clue
    const causalText = `${choice?.label ?? resolution.narrationRequest.rawAction} desbloqueó la pista: ${clue.text}`;
    memories.push({
      ...base(roomBefore, resolution, "causal_link"),
      text: causalText.slice(0, 200),
      summaryLine: causalText.slice(0, 80),
      clueIds: [clueId],
      tags: [...(base(roomBefore, resolution, "causal_link").tags), "clue_unlock"],
      importance: 0.75,
      source: "engine",
      truthStatus: "confirmed"
    });
  }

  // 3. npc_memory — for each NPC affected
  const npcUpdates = resolution.turnResolution.npcChanges ?? [];
  for (const npcUpdate of npcUpdates.slice(0, 2)) {
    if (!npcUpdate.id) continue;
    const npc = roomBefore.campaign.npcs.find((n) => n.id === npcUpdate.id);
    if (!npc) continue;
    const trustDir = (npcUpdate.trust ?? 0) > 0 ? "ganó confianza" : (npcUpdate.fear ?? 0) > 0 ? "mostró miedo" : "reaccionó";
    const npcText = `${npc.name} ${trustDir} tras la acción de ${actor.name}: ${choice?.label ?? resolution.narrationRequest.rawAction}.`;
    memories.push({
      ...base(roomBefore, resolution, "npc_memory"),
      text: npcText.slice(0, 200),
      summaryLine: npcText.slice(0, 80),
      npcIds: [npc.id],
      importance: 0.65
    });
  }

  // 4. object_memory — if object touched
  const objectChanges = resolution.turnResolution.objectChanges ?? [];
  for (const obj of objectChanges.slice(0, 1)) {
    if (!obj.id) continue;
    const storyObj = roomBefore.campaign.storyObjects?.find((o) => o.id === obj.id);
    const name = storyObj?.name ?? obj.id;
    const objText = `${name} quedó en estado "${obj.state}" tras la acción de ${actor.name}.`;
    memories.push({
      ...base(roomBefore, resolution, "object_memory"),
      text: objText.slice(0, 200),
      summaryLine: objText.slice(0, 80),
      objectIds: [obj.id],
      importance: 0.55
    });
  }

  // 5. moral_choice — if action type is moral or involves betrayal/sacrifice/expose
  const isMoral = choice?.actionType === "tomar_decision_moral" ||
    choice?.intent === "betray" || choice?.intent === "sacrifice" ||
    (choice?.label ?? "").toLowerCase().includes("exponer") ||
    (choice?.label ?? "").toLowerCase().includes("sacrific") ||
    (choice?.label ?? "").toLowerCase().includes("traicionar");
  if (isMoral && outcome !== "failure") {
    const moralText = `${actor.name} eligió: ${choice?.label ?? resolution.narrationRequest.rawAction}. Consecuencia moral: ${plan?.consequence.socialChange ?? plan?.consequence.emotionalChange ?? plan?.consequence.summary ?? "impacto social pendiente"}.`;
    memories.push({
      ...base(roomBefore, resolution, "moral_choice"),
      text: moralText.slice(0, 200),
      summaryLine: moralText.slice(0, 80),
      npcIds: scene.npcIds ?? [],
      tags: [...(base(roomBefore, resolution, "moral_choice").tags), "moral"],
      importance: 0.85,
      resolved: false
    });
  }

  // 6. failed_action
  if (outcome === "failure") {
    const failText = `${actor.name} falló al intentar: ${choice?.label ?? resolution.narrationRequest.rawAction}. ${plan?.consequence.summary ?? resolution.consequence?.text ?? "La acción dejó una complicación."}`;
    memories.push({
      ...base(roomBefore, resolution, "failed_action"),
      text: failText.slice(0, 200),
      summaryLine: failText.slice(0, 80),
      npcIds: scene.npcIds ?? [],
      objectIds: choice?.objectId ? [choice.objectId] : [],
      importance: 0.65
    });
  }

  // 7. dialogue — only if narration has revealing dialogue
  if (narration?.dialogue && narration.dialogue.length > 0) {
    const npcLines = narration.dialogue.filter((d) => d.speakerKind === "npc").slice(0, 1);
    for (const line of npcLines) {
      const lineText = `${line.speakerName}: "${line.line}" (intención: ${line.intention})`;
      if (lineText.length > 20) {
        memories.push({
          ...base(roomBefore, resolution, "dialogue"),
          text: lineText.slice(0, 200),
          summaryLine: lineText.slice(0, 80),
          npcIds: [line.speakerId],
          importance: 0.5,
          source: "narration",
          truthStatus: "suspected"
        });
      }
    }
  }

  // 8. scene_transition — if scene changed
  if (roomAfter.currentSceneIndex !== roomBefore.currentSceneIndex) {
    const nextScene = roomAfter.campaign.scenes[roomAfter.currentSceneIndex];
    const transText = `La investigación avanzó desde "${scene.title}" hacia "${nextScene?.title ?? "siguiente escena"}".`;
    memories.push({
      ...base(roomBefore, resolution, "scene_transition"),
      text: transText,
      summaryLine: transText.slice(0, 80),
      importance: 0.8,
      resolved: true,
      source: "engine"
    });
  }

  // cap at 8 and deduplicate against roomBefore sessionLog text
  const existingTexts = roomBefore.sessionLog.map((e) => e.narration ?? "");
  const deduped = dedup(memories, existingTexts);
  return deduped.slice(0, 8);
}
