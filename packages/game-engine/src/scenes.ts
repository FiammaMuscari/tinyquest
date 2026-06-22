import { campaignBackgroundImages, defaultCampaign } from "./campaigns";
import type { Campaign, CampaignActionOption, Scene, SessionConfig } from "./types";

function audioForScene(index: number) {
  return "/assets/audio/song-of-the-north.mp3";
}

function normalizeCategory(category: CampaignActionOption["category"]): CampaignActionOption["category"] {
  if (category === "create" || category === "magic" || category === "escape") return "investigate";
  return category;
}

export function createScenesForCampaign(campaign: Campaign = defaultCampaign): Scene[] {
  return campaign.scenes.map((campaignScene, index) => {
    const clue = campaign.clues.find((item) => campaignScene.clueIds.includes(item.id)) ?? campaign.clues[0];
    const image = campaignBackgroundImages(campaign.id)[0];
    const audio = audioForScene(index);

    return {
      id: campaignScene.id,
      title: campaignScene.title,
      objective: campaignScene.objective,
      difficulty: campaignScene.difficulty,
      allowedStats: Array.from(new Set([
        ...campaignScene.allowedStats,
        ...campaignScene.multipleChoiceOptions.map((option) => option.recommendedStat),
        campaign.recommendedStats[0]
      ])),
      mysteryClue: clue?.text ?? campaign.storyHook,
      clueIds: campaignScene.clueIds,
      danger: campaignScene.hasCombat ? "La escena puede entrar en combate breve." : "La presión social o mágica aumenta.",
      maxRounds: 4,
      atmosphere: {
        visualPrompt: `${campaign.imagePrompt} Escena: ${campaignScene.imagePrompt}.`,
        ambientSoundPrompt: `${campaign.ambientSoundPrompt} Escena: ${campaignScene.ambientSoundPrompt}.`,
        backgroundImages: [image],
        imageAssetUrl: image,
        audioAssetUrl: audio,
        atmosphereTags: [campaign.genre, campaign.difficulty, ...campaign.recommendedSkills].slice(0, 6),
        fallbackImage: image,
        fallbackAudio: audio
      },
      actionChoices: campaignScene.multipleChoiceOptions.map((option) => ({
        id: option.id,
        label: option.label,
        action: option.description,
        actionType: option.actionType,
        recommendedStats: [option.recommendedStat],
        allowedStats: option.allowedStats,
        skillTag: normalizeCategory(option.category),
        category: normalizeCategory(option.category),
        riskLevel: option.riskLevel,
        energyCost: option.energyCost,
        targetId: option.targetId,
        targetKind: option.targetKind,
        objectId: option.objectId,
        npcId: option.npcId,
        routeId: option.routeId,
        exhausts: option.exhausts,
        mutatesTo: option.mutatesTo,
        possibleOutcomeHint: option.possibleOutcomeHint,
        intent: option.intent,
        progressOnSuccess: option.progressOnSuccess,
        dangerOnPartial: option.dangerOnPartial,
        dangerOnFailure: option.dangerOnFailure,
        requiredClues: option.requiredClues,
        unlocksClues: option.unlocksClues,
        requiredFlags: option.requiredFlags,
        blockedByFlags: option.blockedByFlags,
        unlocksFlags: option.unlocksFlags,
        memoryImpact: option.memoryImpact,
        npcReaction: option.npcReaction,
        combatEffect: option.combatEffect,
        objectStateOnSuccess: option.objectStateOnSuccess,
        npcAttitudeOnSuccess: option.npcAttitudeOnSuccess,
        routeStatusOnSuccess: option.routeStatusOnSuccess,
        successOutcome: option.successOutcome,
        partialOutcome: option.partialOutcome,
        failureOutcome: option.failureOutcome,
        successPatch: option.successPatch,
        partialPatch: option.partialPatch,
        failurePatch: option.failurePatch,
        narrationHints: option.narrationHints
      })),      npcIds: campaignScene.npcIds,
      enemyIds: campaignScene.enemyIds,
      hasCombat: campaignScene.hasCombat
    };
  });
}

export function createSessionForCampaign(campaign: Campaign = defaultCampaign): SessionConfig {
  return {
    id: `session-${campaign.id}`,
    title: campaign.title,
    maxMinutes: campaign.durationMinutes,
    maxScenes: campaign.scenes.length,
    maxRoundsPerScene: 4,
    selectedCampaign: campaign,
    selectedCampaignId: campaign.id,
    initialSceneId: campaign.scenes[0].id
  };
}
