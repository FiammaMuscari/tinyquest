import type { SceneActionDefinition } from "../campaigns/campaign.types";
import type { LivingGameState, StatePatch } from "../memory/game-state.types";
import type { DmTurnJson } from "./dm.schema";

const emptyPatch: StatePatch = {
  dangerDelta: 0,
  clueUpdates: [],
  itemUpdates: [],
  nftUpdates: [],
  npcUpdates: [],
  secondaryNPCUpdates: [],
  factionUpdates: [],
  relationshipUpdates: [],
  locationUpdates: [],
  creatureUpdates: [],
  routeUpdates: [],
  endingScoreDelta: {},
  sceneClockDelta: null,
  nextSceneId: null
};

export function buildDeterministicDmFallback(input: {
  state: LivingGameState;
  characterName: string;
  sceneId: string;
  action: SceneActionDefinition;
  rollTotal: number;
  difficulty: number;
  result: "success" | "partial" | "failure";
  d6Cost?: number;
}): DmTurnJson {
  const dangerDelta = input.result === "success" ? 0 : input.result === "partial" ? 1 : 2;
  const resultText = input.result === "success" ? input.action.success : input.result === "partial" ? input.action.partial : input.action.failure;
  const exhausted = input.state.actionMemory[`${input.sceneId}:${input.action.id}`]?.exhausted;
  return {
    ok: true,
    turn: {
      characterName: input.characterName,
      sceneId: input.sceneId,
      actionId: input.action.id,
      actionLabel: input.action.label,
      stat: input.action.stat,
      rollTotal: input.rollTotal,
      difficulty: input.difficulty,
      result: input.result,
      d6Cost: input.d6Cost ?? 0
    },
    narration: `${input.characterName} intenta ${input.action.label}. ${resultText} ${exhausted ? input.action.exhaustionReplacementFailure : input.action.stakes}`,
    npcDialogue: "Alguien presente decide no hablar todavia; ese silencio tambien cambia la habitacion.",
    concreteChange: resultText,
    statePatch: {
      ...emptyPatch,
      dangerDelta,
      clueUpdates: input.action.revealsClue && input.result !== "failure" ? [{ id: input.action.revealsClue, discovered: true, confirmed: input.result === "success" }] : [],
      routeUpdates: input.action.opensRoute && input.result !== "failure" ? [{ id: input.action.opensRoute, open: true, discovered: true }] : [],
      sceneClockDelta: { sceneId: input.sceneId, amount: 1 }
    },
    nextOptions: [
      { label: input.action.exhaustionReplacementSuccess, type: input.action.type, stat: input.action.stat, risk: "medio", reason: "La accion anterior ya cambio la situacion." }
    ],
    control: {
      usedRag: false,
      respectedMemory: true,
      introducedConcreteChange: true,
      usedConcreteObjectOrNPC: true,
      repeatedGenericPhrase: false,
      repeatedKnownClue: false,
      jsonValid: true
    }
  };
}
