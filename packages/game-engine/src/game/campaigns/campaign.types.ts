export type CampaignTheme =
  | "castillo_maldito"
  | "bosque_embrujado"
  | "hombre_lobo"
  | "conde_vampiro"
  | "objetos_sagrados"
  | "cripta"
  | "escuela_encantada"
  | "piratas"
  | "pueblo_niebla"
  | "torre_mago";

export type LiteraryStatKey = "cuerpo" | "mente" | "alma" | "sombra";
export type ActionType =
  | "investigate" | "confront" | "protect" | "magic" | "stealth" | "combat"
  | "negotiate" | "ritual" | "escape" | "social" | "craft" | "survival" | "sacrifice";
export type DifficultyTier = "facil" | "normal" | "dificil";
export type DangerBand = "low" | "medium" | "high" | "critical";
export type ObjectKind =
  | "weapon" | "relic" | "key" | "charm" | "pet" | "curse" | "consumable"
  | "proof" | "tool" | "book" | "map" | "contract" | "ritual_component";
export type ObjectState = "intacto" | "danado" | "corrupto" | "perdido" | "consagrado" | "bendecido" | "vinculado";
export type NPCRelation = "protege" | "odia" | "teme" | "sirve" | "engana" | "debe" | "ama" | "culpa" | "vigila";
export type NPCStatus = "vivo" | "muerto" | "ausente" | "aliado" | "hostil" | "asustado" | "acorralado";

export type CastDefinition = {
  recommendedPartySize: { min: number; max: number };
  botRoles: string[];
  classHooks: { className: string; narrativeHook: string; preferredActions: ActionType[] }[];
};

export type NPCDefinition = {
  id: string;
  name: string;
  role: string;
  presence: string;
  appearance: string;
  voice: string;
  initialAttitude: NPCStatus;
  seems: string;
  hides: string;
  wants: string;
  fears: string;
  knows: string[];
  lies: string[];
  truths: string[];
  helpsWhen: string;
  betraysWhen: string;
  fleesWhen: string;
  dangerBehavior: Record<DangerBand, string>;
  actionReactions: Partial<Record<ActionType, string>>;
  relations: Record<string, NPCRelation>;
};

export type SecondaryNPCDefinition = {
  id: string;
  name: string;
  function: "rumor" | "witness" | "merchant" | "guard" | "victim" | "liar" | "guide" | "obstacle";
  usualLocation: string;
  saw: string;
  believes: string;
  misreads: string;
  needsToSpeak: string;
  convincedBy: ActionType[];
  scaredBy: ActionType[];
  connectsClue: string | null;
  opensRoute: string | null;
  dialogueExample: string;
  initialState: NPCStatus;
};

export type FactionDefinition = {
  id: string;
  name: string;
  visibleAgenda: string;
  hiddenAgenda: string;
  leaderNPCId?: string;
  resources: string[];
  fear: string;
  acceptsAsProof: string[];
  considersOffense: string[];
  hostilityRules: string[];
  supportsEndings: string[];
  blocksEndings: string[];
};

export type LocationDefinition = {
  id: string;
  name: string;
  sensoryDescription: string;
  gameplayFunction: string;
  objectsPresent: string[];
  possibleNPCs: string[];
  possibleClues: string[];
  connectedRoutes: string[];
  environmentalDanger: string;
  dangerChanges: Record<DangerBand, string>;
  magicChanges: string;
  combatChanges: string;
  secrets: string[];
  signatureImage: string;
};

export type ItemDefinition = {
  id: string;
  name: string;
  description: string;
  lore: string;
  creator: string;
  wantedBy: string[];
  appearsAt: string;
  uses: string[];
  risks: string[];
  states: ObjectState[];
  connectsClues: string[];
  recognizedBy: string[];
  opensRoutes: string[];
  affectsEndings: string[];
  canBecomeNFT: boolean;
};

export type ObjectStatsDefinition = {
  id: string;
  kind: ObjectKind;
  rarity: "common" | "rare" | "epic" | "legendary";
  statBonus?: Partial<Record<LiteraryStatKey, number>>;
  usableWith: LiteraryStatKey[];
  d4BonusAllowed: boolean;
  maxCharges?: number;
  cooldown?: number;
  passiveEffect?: string;
  activeEffect?: string;
  costOnD6_1_2: string;
  costOnD6_3_4: string;
  costOnD6_5_6: string;
  breakCondition: string;
  corruptCondition: string;
  repairCondition: string;
  narrativeTags: string[];
  compatibleActions: ActionType[];
  incompatibleActions: ActionType[];
};

export type RelicNFTDefinition = {
  tokenTemplateId: string;
  objectId: string;
  name: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  kind: ObjectKind;
  shortLore: string;
  longLore: string;
  passiveAbility: string;
  activeAbility: string;
  narrativeTags: string[];
  narrationRule: string;
  storyMarkRules: string[];
  damageRule: string;
  corruptionRule: string;
  blessingRule: string;
  bindingRule: string;
  altersEndings: string[];
  canPersistAcrossCampaigns: boolean;
  balanceRule: string;
};

export type CreatureDefinition = {
  id: string;
  name: string;
  type: "beast" | "undead" | "spirit" | "human" | "curse" | "construct" | "fae" | "sea_horror";
  appearance: string;
  behavior: string;
  objective: string;
  fearOrWeakness: string;
  narrativeAttacks: string[];
  warningSigns: string[];
  dangerScaling: Record<DangerBand, string>;
  combatApproach: string;
  nonCombatApproach: string;
  negotiationApproach: string;
  leavesClues: string[];
  affectedByObjects: string[];
  relatedEndings: string[];
  stats: { threatLevel: number; cuerpo: number; mente: number; alma: number; sombra: number; resistance: string; weakness: string; specialMove: string };
};

export type ClueDefinition = {
  id: string;
  visibleText: string;
  revealsTruth: string;
  falseExplanation: string;
  firstSceneId: string;
  confirmation: string;
  damagedBy: string;
  lostBy: string;
  recognizedBy: string[];
  validatedByObject: string | null;
  opensRoute: string | null;
  enablesEnding: string[];
  falseEndingIfMisread?: string;
};

export type ClueGraph = {
  nodes: { id: string; kind: "clue" | "npc" | "object" | "place" | "secret" | "ending" }[];
  edges: { from: string; to: string; relation: "points_to" | "contradicts" | "confirms" | "corrupts" | "protects" | "unlocks" | "misleads_to"; description: string }[];
};

export type RouteDefinition = {
  id: string;
  name: string;
  type: "main" | "optional" | "risky" | "secret" | "failure";
  opensWhen: string;
  blocksWhen: string;
  destinationSceneId: string;
  risk: string;
  cost: string;
  reward: string;
  affectedNPCs: string[];
  requiredObjects: string[];
  requiredClues: string[];
  relatedEndings: string[];
  fallbackIfBlocked: string;
};

export type EndingDefinition = {
  id: "good_truth_mercy" | "heroic_cost" | "bittersweet_escape" | "tragic_collapse" | "corrupt_victory" | "false_resolution" | "secret_deep_truth" | string;
  title: string;
  type: string;
  mechanicalCondition: string;
  narrativeCondition: string;
  requiredClues: string[];
  requiredObjects: string[];
  requiredNPCStates: string[];
  endingScoreRequired: number;
  dangerMin?: number;
  dangerMax?: number;
  result: string;
  cost: string;
  survives: string[];
  falls: string[];
  unresolved: string[];
  finalImage: string;
  persistentGainOrLoss: string;
  objectMarks: string[];
  futureUnlocks: string[];
};

export type SceneActionDefinition = {
  id: string;
  label: string;
  type: ActionType;
  stat: LiteraryStatKey;
  difficulty: number;
  stakes: string;
  success: string;
  partial: string;
  failure: string;
  d6CostUse: string;
  revealsClue?: string;
  opensRoute?: string;
  blocksRoute?: string;
  affectsNPC?: string;
  affectsObject?: string;
  dangerDeltaOnSuccess: number;
  dangerDeltaOnPartial: number;
  dangerDeltaOnFailure: number;
  exhaustionReplacementSuccess: string;
  exhaustionReplacementFailure: string;
};

export type SceneDefinition = {
  id: string;
  title: string;
  dramaticPurpose: string;
  summary: string;
  locationId: string;
  mainTension: string;
  visibleThreat: string;
  hiddenThreat: string;
  activeNPCs: string[];
  secondaryNPCs: string[];
  factions: string[];
  relevantObjects: string[];
  possibleClues: string[];
  routes: string[];
  recommendedActions: SceneActionDefinition[];
  dangerConsequences: Record<DangerBand, string>;
  transitions: Record<string, string>;
  endingsReachable: string[];
  antiRepetitionRules: string[];
};

export type CampaignWalkthrough = {
  criticalPath: string[];
  optionalPaths: string[];
  failurePath: string[];
  secretRoutes: string[];
  transitions: string[];
  antiSoftlock: string[];
  repeatedActionRules: string[];
};

export type ConsequenceTable = {
  id: string;
  scope: string;
  entries: { trigger: string; result: string; statePatchHint: string }[];
};

export type SceneEventDefinition = {
  id: string;
  sceneId: string;
  trigger: string;
  dangerBand: DangerBand;
  description: string;
  mechanicalEffect: string;
  narrativeUse: string;
  opensRoute: string | null;
  blocksRoute: string | null;
  affectsNPC: string | null;
  affectsObject: string | null;
};

export type CampaignMechanics = {
  specialRules: string[];
  recommendedDCs: { easy: number; normal: number; hard: number; desperate: number };
  dangerModifiers: Record<DangerBand, string>;
  d6CostRules: { low: string; medium: string; high: string };
  sceneClockRules: string[];
  endingScoreRules: string[];
  antiSoftlockRules: string[];
};

export type DMRules = {
  forbiddenPhrases: string[];
  antiRepetitionRules: string[];
  jsonOnly: boolean;
  maxNarrationWords: number;
};

export type TinyQuestCampaign = {
  id: string;
  title: string;
  theme: CampaignTheme;
  difficulty: DifficultyTier;
  durationMinutes: number;
  tone: string[];
  premise: string;
  centralConflict: string;
  visibleThreat: string;
  hiddenThreat: string;
  falseExplanation: string;
  realSecret: string;
  startingDanger: number;
  maxRounds: number;
  cast: CastDefinition;
  npcs: NPCDefinition[];
  secondaryNPCs: SecondaryNPCDefinition[];
  factions: FactionDefinition[];
  locations: LocationDefinition[];
  keyObjects: ItemDefinition[];
  objectStats: ObjectStatsDefinition[];
  relicsAndNFTs: RelicNFTDefinition[];
  creatures: CreatureDefinition[];
  clues: ClueDefinition[];
  scenes: SceneDefinition[];
  routes: RouteDefinition[];
  clueGraph: ClueGraph;
  walkthrough: CampaignWalkthrough;
  endings: EndingDefinition[];
  consequenceTables: ConsequenceTable[];
  sceneEvents: SceneEventDefinition[];
  campaignMechanics: CampaignMechanics;
  dmRules: DMRules;
};
