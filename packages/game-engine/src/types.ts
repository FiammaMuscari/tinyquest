export type DiceType = "d4" | "d6" | "d8" | "d10" | "d20";
export type StatKey = "body" | "mind" | "charm" | "creativity" | "courage" | "focus" | "luck";
export type CheckOutcome = "success" | "partial_success" | "failure";
export type ScenePhase = "intro" | "investigation" | "pressure" | "combat" | "climax" | "ending";
export type ResolutionType = CheckOutcome | "hit" | "strong_hit" | "miss" | "defended" | "enemy_action";
export type PlayerType = "human" | "bot";
export type ThemeLevel = "low" | "medium" | "high";
export type StatName = StatKey;

export type RollResult = {
  die: DiceType;
  value: number;
};

export type Stats = Record<StatKey, number>;

export type Species = {
  id: string;
  name: string;
  description: string;
  statBonus: Partial<Stats>;
  passiveTrait: string;
  visualFlavor: string;
  quirk: string;
};

export type Role = {
  id: string;
  name: string;
  description: string;
  mainStat: StatKey;
  secondaryStat: StatKey;
  specialAbility: string;
  limitation: string;
  playstyle: string;
};

export type LegendaryPet = {
  id: string;
  name: string;
  species: string;
  description: string;
  passiveAbility: string;
  activeAbility: string;
  preferredStat: StatKey;
  cooldownTurns: number;
};

export type AbilityProgression = {
  id: string;
  name: string;
  currentSkill: string;
  nextUpgrade: string;
  scaling: string;
  unlockCondition: string;
  level: number;
  progress: number;
  progressTarget: number;
};

// Rasgos visibles elegidos por el jugador; alimentan el prompt del retrato
// generado. Todos opcionales: sin elección, la IA decide libremente.
export type CharacterLook = {
  gender?: string;
  skinTone?: string;
  eyeColor?: string;
};

export type Character = {
  name: string;
  species: string;
  role: string;
  concept: string;
  visualStyle: string;
  personalityTraits: string[];
  specialAbility: string;
  weakness: string;
  groupRole: string;
  avatarUrl: string;
  look?: CharacterLook;
  stats: Stats;
  vitality: number;
  energy: number;
  spark: number;
  defense: number;
  resolve: number;
  pet: LegendaryPet;
  abilityProgression: AbilityProgression;
};

export type Player = {
  id: string;
  name: string;
  type: PlayerType;
  character: Character;
  temporaryItems: string[];
  status?: "active" | "dead";
  deathCause?: string;
};

export type BotPlayer = Player & {
  type: "bot";
};

export type Scene = {
  id: string;
  title: string;
  objective: string;
  difficulty: number;
  allowedStats: StatKey[];
  mysteryClue: string;
  clueIds?: string[];
  danger: string;
  maxRounds: number;
  actionChoices: SceneActionChoice[];
  atmosphere: SceneAtmosphere;
  npcIds?: string[];
  enemyIds?: string[];
  hasCombat?: boolean;
};

export type SceneAtmosphere = {
  visualPrompt: string;
  ambientSoundPrompt: string;
  backgroundImages: string[];
  imageAssetUrl?: string;
  audioAssetUrl?: string;
  atmosphereTags: string[];
  fallbackImage: string;
  fallbackAudio: string;
};

export type SceneActionChoice = {
  id: string;
  label: string;
  action: string;
  actionType?: CampaignActionType;
  recommendedStats: StatKey[];
  allowedStats?: StatKey[];
  skillTag: string;
  category?: CampaignActionOption["category"];
  riskLevel?: CampaignActionOption["riskLevel"];
  energyCost?: number;
  targetId?: string;
  targetKind?: "npc" | "object" | "route" | "faction" | "creature" | "scene";
  objectId?: string;
  npcId?: string;
  routeId?: string;
  exhausts?: boolean;
  mutatesTo?: string;
  possibleOutcomeHint?: string;
  intent?: CampaignActionOption["intent"];
  progressOnSuccess?: number;
  dangerOnPartial?: number;
  dangerOnFailure?: number;
  requiredClues?: string[];
  unlocksClues?: string[];
  requiredFlags?: string[];
  blockedByFlags?: string[];
  unlocksFlags?: string[];
  // Economía y ciclo de vida de la opción:
  energyRestoreOnSuccess?: number;   // ahorrar: éxito devuelve energía (p.ej. descansar)
  expiresAfterRound?: number;        // deja de estar disponible desde esta ronda de escena
  permanent?: boolean;               // nunca se agota ni se auto-retira por usos
  requiredTrust?: number;            // exige npcStates[npcId].trust >= N
  memoryImpact?: string;
  npcReaction?: string;
  combatEffect?: string;
  objectStateOnSuccess?: "intacto" | "danado" | "corrupto" | "perdido" | "consagrado" | "bendecido" | "vinculado";
  npcAttitudeOnSuccess?: string;
  routeStatusOnSuccess?: "open" | "blocked" | "dangerous" | "watched" | "used";
  successOutcome?: CampaignActionOutcome;
  partialOutcome?: CampaignActionOutcome;
  failureOutcome?: CampaignActionOutcome;
  successPatch?: Partial<import("./game/memory/game-state.types").StatePatch>;
  partialPatch?: Partial<import("./game/memory/game-state.types").StatePatch>;
  failurePatch?: Partial<import("./game/memory/game-state.types").StatePatch>;
  narrationHints?: CampaignNarrationHints;
};

export type StructuredNextOption = {
  id: string;
  label: string;
  intent: string;
  suggestedStat: StatKey;
  risk: "low" | "medium" | "high" | "critical";
  requiresClue?: string;
  requiresObject?: string;
  availableInPhase: ScenePhase[];
};

export type CampaignActionType =
  | "investigar_objeto"
  | "comparar_evidencia"
  | "interrogar_npc"
  | "confrontar_npc"
  | "proteger_aliado"
  | "abrir_ruta"
  | "cerrar_ruta"
  | "mentir"
  | "negociar"
  | "combatir"
  | "huir"
  | "sacrificar_recurso"
  | "usar_objeto"
  | "revelar_prueba"
  | "tomar_decision_moral";

export type CampaignOutcomeKind =
  | "npc_confession"
  | "npc_evasion"
  | "npc_closes_off"
  | "npc_exposed"
  | "social_pressure"
  | "evidence_confirmed"
  | "evidence_partial"
  | "evidence_contaminated"
  | "route_opened"
  | "route_blocked"
  | "ally_protected"
  | "ally_harmed"
  | "object_changed"
  | "moral_choice"
  | "combat_shift"
  | "escape_shift";

export type CampaignNarrationHints = {
  mustMention: string[];
  mustNotMention: string[];
  style: string;
};

export type CampaignActionOutcome = {
  kind: CampaignOutcomeKind;
  clueId?: string;
  summary: string;
  visibleConsequence: string;
  narrationHints?: Partial<CampaignNarrationHints>;
};

export type CrisisOption = {
  id: string;
  label: string;
  actionType: CampaignActionType;
  targetId?: string;
  targetKind?: "npc" | "object" | "route" | "faction" | "creature" | "scene";
  riskLevel: "low" | "medium" | "high";
  recommendedStats: StatKey[];
  requiredFlags?: string[];
  requiredClues?: string[];
  requiredNpcs?: string[];
  blockedByFlags?: string[];
  consequenceHints?: { onSuccess?: string; onFailure?: string };
  energyCost?: number;
  progressOnSuccess?: number;
  endingBias?: Partial<Record<"truth" | "mercy" | "sacrifice" | "corruption" | "chaos", number>>;
};

export type CampaignGraph = {
  campaignId: string;
  title: string;
  pitch: string;
  tone: string;
  themes: string[];
  estimatedMinutes: number;
  startSceneId: string;
  scenes: Record<string, SceneNode>;
  npcs: Record<string, CampaignNPC>;
  objects: Record<string, StoryObject>;
  clues: Record<string, CampaignClue>;
  routes: Record<string, NarrativeRouteDefinition>;
  factions: Record<string, { id: string; name: string; agenda: string; pressure?: string }>;
  endings: Record<string, CampaignEnding>;
};

export type Condition = {
  kind: "flag" | "clue" | "npc_attitude" | "object_status" | "route_status" | "score";
  id: string;
  value?: string | number | boolean;
  op?: "eq" | "neq" | "gte" | "lte";
};

export type NarrativeRouteDefinition = {
  routeId: string;
  fromSceneId: string;
  toSceneId: string;
  risk: number;
  requiredClueIds?: string[];
};

export type EscalationEvent = {
  eventId: string;
  trigger: Condition[];
  patch: Partial<import("./game/memory/game-state.types").StatePatch>;
  visibleConsequence: string;
};

export type SceneNode = {
  sceneId: string;
  title: string;
  locationId: string;
  dramaticQuestion: string;
  objective: string;
  pressure: string;
  entryCondition?: Condition[];
  exitConditions: Condition[];
  defaultNextSceneId?: string;
  possibleNextSceneIds: string[];
  actionPool: CampaignActionOption[];
  escalationTable: EscalationEvent[];
};

export type NarrationOutput = {
  playerNarration: string;
  visibleConsequence: string;
  newOptionsTeaser?: string;
  debugSummary?: string;
  memoryUpdate?: string;
};

export type CampaignActionOption = {
  id: string;
  label: string;
  description: string;
  category: "investigate" | "talk" | "fight" | "defend" | "create" | "magic" | "pet" | "escape";
  intent?: "investigate" | "fight" | "talk" | "flee" | "magic" | "item" | "pet" | "protect" | "betray" | "trick" | "sacrifice";
  actionType?: CampaignActionType;
  recommendedStat: StatName;
  allowedStats?: StatName[];
  riskLevel: "low" | "medium" | "high";
  energyCost?: number;
  targetId?: string;
  targetKind?: "npc" | "object" | "route" | "faction" | "creature" | "scene";
  objectId?: string;
  npcId?: string;
  routeId?: string;
  exhausts?: boolean;
  mutatesTo?: string;
  possibleOutcomeHint: string;
  progressOnSuccess?: number;
  dangerOnPartial?: number;
  dangerOnFailure?: number;
  requiredClues?: string[];
  unlocksClues?: string[];
  requiredFlags?: string[];
  blockedByFlags?: string[];
  unlocksFlags?: string[];
  energyRestoreOnSuccess?: number;
  expiresAfterRound?: number;
  permanent?: boolean;
  requiredTrust?: number;
  memoryImpact?: string;
  npcReaction?: string;
  combatEffect?: string;
  objectStateOnSuccess?: "intacto" | "danado" | "corrupto" | "perdido" | "consagrado" | "bendecido" | "vinculado";
  npcAttitudeOnSuccess?: string;
  routeStatusOnSuccess?: "open" | "blocked" | "dangerous" | "watched" | "used";
  successOutcome?: CampaignActionOutcome;
  partialOutcome?: CampaignActionOutcome;
  failureOutcome?: CampaignActionOutcome;
  successPatch?: Partial<import("./game/memory/game-state.types").StatePatch>;
  partialPatch?: Partial<import("./game/memory/game-state.types").StatePatch>;
  failurePatch?: Partial<import("./game/memory/game-state.types").StatePatch>;
  narrationHints?: CampaignNarrationHints;
};

export type Enemy = {
  id: string;
  name: string;
  description: string;
  vitality: number;
  attackBonus: number;
  defense: number;
  dangerLevel: number;
  weaknessStats: StatName[];
  resistStats?: StatName[];
  specialMove?: string;
  imagePrompt?: string;
};

export type CampaignScene = {
  id: string;
  title: string;
  description: string;
  objective: string;
  dramaticObjective?: string;
  mainConflict?: string;
  location?: string;
  timePressure?: string;
  initialDanger?: number;
  maxDanger?: number;
  requiredProgress?: number;
  isFinal?: boolean;
  allowedStats: StatName[];
  difficulty: number;
  clueIds: string[];
  npcIds: string[];
  enemyIds?: string[];
  hasCombat?: boolean;
  imagePrompt: string;
  ambientSoundPrompt: string;
  multipleChoiceOptions: CampaignActionOption[];
  crisisOptions?: CrisisOption[];
};

export type CampaignNPC = {
  id: string;
  name: string;
  description: string;
  motive: string;
  role?: string;
  /** Retrato generado (IA o asset). Sin esto, la UI dibuja un medallón procedural. */
  portraitUrl?: string;
  /** Aspecto físico dibujable (para prompts de retrato). */
  appearance?: string;
  secret?: string;
  alibi?: string;
  fear?: string;
  desire?: string;
  relationshipToVictim?: string;
  relationshipToOtherNPCs?: Record<string, string>;
  appearsInScenes?: string[];
  canDisappear?: boolean;
  canDie?: boolean;
  canBetray?: boolean;
  trustThresholds?: Record<string, number>;
  whatTheyKnow?: string[];
  whatTheyHide?: string[];
  reactionByOutcome?: Partial<Record<CheckOutcome, string>>;
};

export type CampaignClue = {
  id: string;
  label?: string;
  text: string;
  description?: string;
  source?: string;
  sceneId?: string;
  discoveredBy?: string[];
  unlocksFlags?: string[];
  unlocksActions?: string[];
  suspectsAffected?: Array<{ suspectId: string; suspicionChange: number }>;
  endingImpact?: string[];
  reveals?: string[];
  contradicts?: string[];
  requiredPreviousClues?: string[];
  unlocksObjects?: string[];
  changesSuspicion?: Record<string, number>;
};

export type StoryObject = {
  id: string;
  name: string;
  type: string;
  description: string;
  location: string;
  holder?: string;
  status: "hidden" | "found" | "broken" | "used" | "lost" | "destroyed";
  relatedClues: string[];
  relatedNPCs: string[];
  unlocksActions: string[];
  unlocksEndings: string[];
  history: string;
};

export type CampaignCausalLink = {
  cause: string;
  effect: string;
  relation: "revealed" | "contradicted" | "unlocked" | "blocked" | "escalated" | "cleared" | "implicated";
  description: string;
};

export type CampaignEnding = {
  id: string;
  title: string;
  description: string;
  type?: "good" | "heroic" | "bittersweet" | "tragic" | "corrupt" | "false" | "secret";
  requires?: {
    confirmedClues?: string[];
    dangerMax?: number;
    objects?: string[];
    flags?: string[];
  };
};

export type CampaignReward = {
  id: string;
  name: string;
  description: string;
};

export type NarratorVoice = {
  genre: string;
  tone: string;
  rhythm: string;
  diction: string;
  forbiddenStyle: string[];
  examples: {
    success: string;
    partial: string;
    failure: string;
    npcDialogue: string;
  };
};

export type Campaign = {
  id: string;
  title: string;
  genre: string;
  tone?: string;
  theme?: string;
  description: string;
  storyHook: string;
  durationMinutes: number;
  maxPlayers: 4;
  recommendedPlayers: number;
  supportsSoloBots: boolean;
  difficulty: "easy" | "normal" | "hard";
  recommendedStats: StatName[];
  recommendedSkills: string[];
  scenes: CampaignScene[];
  crisisOptions?: CrisisOption[];
  unlockableOptions?: CampaignActionOption[];  // pool de opciones que las pistas desbloquean vía unlocksActions
  energyRegenPerRound?: number;                // regen fija por ronda (default 1); gastar > regenerar exige ahorro
  consequenceBank?: ConsequenceEntry[];        // consecuencias propias; cascada: campaña → banco default
  factions?: Array<{ id: string; name: string; agenda: string; pressure?: string }>;
  suspects?: Array<{ id: string; name: string; motive: string; secret?: string; suspicion?: number }>;
  npcs: CampaignNPC[];
  enemies: Enemy[];
  clues: CampaignClue[];
  possibleEndings: CampaignEnding[];
  threats?: Array<{ id: string; name: string; pressure: string; escalatesWhen?: string }>;
  twists?: Array<{ id: string; title: string; trigger: string; reveal: string }>;
  graveConsequences?: string[];
  energyMax?: number;
  legendaryPets: string[];
  rewards: CampaignReward[];
  imagePrompt: string;
  ambientSoundPrompt: string;
  narratorGuidance: string;
  premise?: string;
  hiddenTruth?: string;
  mainConflict?: string;
  stakes?: string[];
  timeline?: string[];
  backstory?: string;
  sceneFlow?: string[];
  possibleReveals?: string[];
  moralDilemmas?: string[];
  failureStates?: string[];
  endingConditions?: Record<string, string>;
  storyObjects?: StoryObject[];
  causalLinks?: CampaignCausalLink[];
  narratorVoice?: NarratorVoice;
};

export type GameEvent = {
  id: string;
  turn: number;
  turnNumber?: number;
  roundNumber?: number;
  playerId?: string;
  playerName: string;
  isBot?: boolean;
  sceneId?: string;
  sceneTitle: string;
  actionId?: string;
  actionLabel?: string;
  action: string;
  stat: StatKey;
  chosenStat?: StatKey;
  skillUsed?: string;
  petUsed?: string;
  dice?: CheckResult;
  result?: CheckOutcome;
  engineOutcome?: string;
  combatNote?: string;
  source?: "human" | "bot-auto";
  outcome: CheckOutcome;
  total: number;
  narration: string;
  consequenceText?: string;
  dangerDelta?: number;
  progressDelta?: number;
  unlockedFlags?: string[];
  unlockedClues?: string[];
  memoryImpact?: string;
};

export type CheckResult = {
  outcome: CheckOutcome;
  total: number;
  difficulty: number;
  d20: RollResult;
  creativeBonus?: RollResult;
  /** Natural high roll (widened by luck): spectacular success regardless of difficulty. */
  critical?: boolean;
  /** Natural 1: disaster regardless of total. */
  fumble?: boolean;
  /** How many pips luck widened the crit range (0-3). For UI/narration. */
  luckBonus?: number;
  rollBreakdown: {
    d20: number;
    statModifier: number;
    d4Bonus: number;
    flatBonus: number;
    penalties: number;
    total: number;
  };
};

export type ConsequenceResult = {
  roll: RollResult;
  text: string;
  dangerDelta: number;
  energyDelta: number;
  vitalityDelta?: number;
  clue?: string;
  entryId?: string;          // entry del banco que salió (para no repetir en la escena)
  source?: "campaign" | "default";
};

// Entrada de banco de consecuencias. Los campos de `match` ausentes son comodín.
export type ConsequenceEntry = {
  id: string;
  text: string;
  match?: {
    actionTypes?: CampaignActionType[];
    outcomes?: CheckOutcome[];
    dangerBands?: Array<"low" | "medium" | "high" | "critical">;
    targetKinds?: string[];
  };
  effects?: {
    dangerDelta?: number;
    energyDelta?: number;
    vitalityDelta?: number;
    clue?: string;
  };
};

export type SessionConfig = {
  id: string;
  title: string;
  maxMinutes: number;
  maxScenes: number;
  maxRoundsPerScene: number;
  selectedTheme?: WorldTheme;
  selectedCampaign?: Campaign;
  selectedCampaignId?: string;
  initialSceneId: string;
};

export type WorldTheme = {
  id: string;
  title: string;
  description: string;
  toneTags: string[];
  darknessLevel: ThemeLevel;
  romanceLevel: ThemeLevel;
  mysteryLevel: ThemeLevel;
  combatLevel: ThemeLevel;
  difficulty: "fácil" | "normal" | "desafiante";
  visualStyle: string;
  narratorGuidance: string;
  possibleNPCs: string[];
  possibleMysteries: string[];
  possibleBetrayals: string[];
  possibleRomances: string[];
  possibleLegendaryPets: string[];
  exampleFirstScene: string;
  visualPrompt: string;
  ambientSoundPrompt: string;
};

export type WorldConfig = {
  id: string;
  name: string;
  aesthetic: string;
  tone: string[];
};

export type MemorySummary = {
  clues: string[];
  unresolvedThreads: string[];
  lastBeat: string;
  suspects: string[];
  betrayals: string[];
  bonds: string[];
  stakes: string[];
  currentTwist: string;
  facts: string[];
  objects: string[];
  npcs: string[];
  locations: string[];
  dangers: string[];
  forbiddenContradictions: string[];
  confirmedFacts: string[];
  suspicions: string[];
  damagedClues: string[];
  npcStates: string[];
  objectStates: string[];
  openQuestions: string[];
};

export type CampaignMemoryUpdate = {
  summary?: string;
  facts: string[];
  clues: string[];
  objects: string[];
  npcs: string[];
  locations: string[];
  dangers: string[];
  forbiddenContradictions: string[];
  confirmedFacts?: string[];
  suspicions?: string[];
  damagedClues?: string[];
  npcStates?: string[];
  objectStates?: string[];
  openQuestions?: string[];
};

export type NarrativeFact = {
  id: string;
  campaignId: string;
  sceneId: string;
  turnNumber: number;
  playerId: string;
  type: "clue" | "object" | "npc" | "combat" | "event" | "suspicion" | "ending";
  text: string;
  confirmed: boolean;
  relatedCharacters: string[];
  relatedObjects: string[];
  relatedClues: string[];
  tags: string[];
};

export type CharacterMemory = {
  id: string;
  name: string;
  role: string;
  status: "active" | "missing" | "dead" | "escaped" | "hidden" | "injured";
  knows: string[];
  hides: string[];
  appearedInScenes: string[];
  lastSeenSceneId?: string;
  suspicion: number;
  trust: number;
};

export type StoryObjectMemory = {
  id: string;
  name: string;
  status: StoryObject["status"];
  location: string;
  holder?: string;
  relatedClues: string[];
  unlocksActions: string[];
  unlocksEndings: string[];
};

export type CombatMemory = {
  id: string;
  sceneId: string;
  enemies: string[];
  participants: string[];
  status: "active" | "won" | "lost" | "escaped";
  damageEvents: string[];
  injuries: string[];
  consequences: string[];
};

export type CausalLink = {
  cause: string;
  effect: string;
  relation: "revealed" | "unlocked" | "blocked" | "implicated" | "cleared" | "escalated" | "reduced";
  description: string;
};

export type StoryConclusions = {
  currentTheory: string;
  likelySuspects: string[];
  clearedSuspects: string[];
  openQuestions: string[];
  missingClues: string[];
  usefulNextActions: string[];
  possibleEndings: string[];
  blockedEndings: string[];
};

export type NarrativeMemory = {
  facts: NarrativeFact[];
  characters: CharacterMemory[];
  objects: StoryObjectMemory[];
  combats: CombatMemory[];
  causalLinks: CausalLink[];
  conclusions: StoryConclusions;
  recentMotifs: string[];
  cachedKeys: string[];
  storyThreads?: import("./game/memory/story-threads").StoryThread[];
  pendingConsequences?: import("./game/memory/pending-consequences").PendingConsequence[];
  moralProfile?: import("./game/memory/moral-profile").MoralProfile;
};

export type DmRetrievedContext = {
  relevantFacts: NarrativeFact[];
  relevantClues: CampaignClue[];
  relevantObjects: StoryObjectMemory[];
  relevantCharacters: CharacterMemory[];
  recentTurns: GameEvent[];
  causalLinks: CausalLink[];
  currentTheory: string;
  openQuestions: string[];
  possibleEndings: string[];
  blockedEndings: string[];
  forbiddenContradictions: string[];
  recentMotifsToAvoid: string[];
  sceneTurnCount: number;
  repeatedActions: Array<{ label: string; count: number; latestOutcome: CheckOutcome }>;
};

export type StateSuggestion =
  | { type: "addTemporaryItem"; item: string }
  | { type: "removeTemporaryItem"; item: string }
  | { type: "introduceNPC"; npcName: string }
  | { type: "increaseSceneProgress"; amount: number }
  | { type: "revealClueId"; clueId: string }
  | { type: "markObjectiveCompleted" }
  | { type: "adjustDangerClock"; amount: number };

export type GameRoom = {
  id: string;
  mode: "solo_test" | "multiplayer";
  sessionConfig: SessionConfig;
  initialSceneId: string;
  players: Player[];
  activePlayerIndex: number;
  currentSceneIndex: number;
  roundInScene: number;
  turn: number;
  dangerClock: number;
  mysteryClues: string[];
  sceneProgress: number;
  sessionStartedAt: number;
  sessionComplete: boolean;
  phase: ScenePhase;
  finalRecap?: string;
  finalEnding?: CampaignEnding;
  endingResolution?: import("./ending-resolution").EndingResolution;
  memorySummary: MemorySummary;
  sessionLog: GameEvent[];
  storyFlags: string[];
  narrativeMemory: NarrativeMemory;
  selectedTheme: WorldTheme;
  campaign: Campaign;
  selectedCampaignId: string;
  livingState: import("./game/memory/game-state.types").LivingGameState;
};

export type TurnResolution = {
  check: CheckResult;
  dice: CheckResult;
  consequence?: ConsequenceResult;
  statePatch: import("./game/memory/game-state.types").StatePatch;
  revealedClueIds: string[];
  objectChanges: import("./game/memory/game-state.types").StatePatch["itemUpdates"];
  npcChanges: import("./game/memory/game-state.types").StatePatch["npcUpdates"];
  dangerDelta: number;
  progressDelta: number;
  endingProgress: import("./game/memory/game-state.types").EndingScore;
  nextAllowedActions: SceneActionChoice[];
  actionType: import("./narrative-contract").NarrativeActionType;
  campaignActionType?: CampaignActionType;
  actor: { id: string; name: string };
  target: { id: string; label: string; kind?: SceneActionChoice["targetKind"] } | null;
  result: CheckOutcome;
  outcomeKind: CampaignOutcomeKind;
  factualSummary: string;
  visibleConsequence: string;
  narrationHints: CampaignNarrationHints;
  debugSummary?: string;
};

export type ActionResolution = {
  room: GameRoom;
  check: CheckResult;
  consequence?: ConsequenceResult;
  combatNote?: string;
  turnResolution: TurnResolution;
  narrationRequest: NarrationRequest;
};

export type NarrationRequest = {
  sessionConfig: SessionConfig;
  world: WorldConfig;
  selectedTheme: WorldTheme;
  selectedCampaign?: Campaign;
  currentScene: Scene;
  activePlayer: Player;
  party: Player[];
  character: Character;
  rawAction: string;
  selectedStat: StatKey;
  skillUsed?: string;
  petUsed?: string;
  visualPrompt: string;
  ambientSoundPrompt: string;
  atmosphereTags: string[];
  currentImageDescription: string;
  currentSoundMood: string;
  diceResults: CheckResult;
  consequence?: ConsequenceResult;
  combatNote?: string;
  resolvedOutcome: CheckOutcome;
  dangerClock: number;
  mysteryCluesFound: string[];
  memorySummary: MemorySummary;
  storyFlags: string[];
  recentSessionLog: GameEvent[];
  retrievedContext?: DmRetrievedContext;
  visibleOptions?: SceneActionChoice[];
  structuredOptions?: StructuredNextOption[];
  resolutionPlan?: import("./resolution-plan").ResolutionPlan;
  narrativeContext?: {
    retrievedMemories?: import("./game/rag/embedded-memory.types").RetrievedMemory[];
    moralProfileSummary?: string;
  };
  narrativeContract?: {
    actionType: import("./narrative-contract").NarrativeActionType;
    campaignActionType?: CampaignActionType;
    target: string | null;
    targetId?: string;
    outcomeKind?: CampaignOutcomeKind;
    factualSummary?: string;
    visibleConsequence?: string;
    narrationHints?: CampaignNarrationHints;
    must: string[];
    avoid: string[];
  };
};


export interface DungeonNarrationOutput {
  narration: string;
  dialogue: Array<{ speakerId: string; speakerName: string; speakerKind: "player" | "bot" | "npc" | "narrator"; line: string; intention: string }>;
  consequence: { summary: string; physicalChange?: string; socialChange?: string; emotionalChange?: string };
  dangerChange: { before: number; after: number; manifestation: string };
  clueReveals: Array<{ clueId: string; title: string; mode: "hint" | "partial" | "full"; text: string }>;
  memoryPatch: { factsToRemember: string[]; factsToUpdate: string[]; factsToForget?: string[] };
  continuityWarnings: string[];
  enrichedOptions?: Array<{ id: string; label: string }>;
  // Legacy optional fields kept for backwards compat
  immediateAction?: { actorId: string; actorName: string; text: string };
  rollPresentation?: { total: number; dc: number; result: "success" | "partial" | "failure"; label: string };
  companionMoments?: Array<{ characterId: string; characterName: string; action: string; emotion: string; relevance: "minor" | "major"; botIntent?: import("./bot-personality").BotIntent; botEmotion?: import("./bot-personality").BotEmotion; dialogue?: string }>;
  worldStateChange?: { text: string; changedNpcIds: string[]; changedObjectIds: string[]; changedClueIds: string[] };
  uiFocus?: { mainText: string; highlight: "roll" | "clue" | "danger" | "dialogue" | "consequence" | "combat"; cardType: "discovery" | "danger" | "failure" | "partial" | "success" | "combat" | "social"; priority: "low" | "medium" | "high" };
}

export type NarrationResponse = {
  narration: string;
  npcDialogue: string[];
  consequence?: string;
  nextOptions: string[];
  nextOptionsText?: string[];
  statePatch?: {
    factsAdded: string[];
    cluesAdded: string[];
    cluesDamaged: string[];
    npcUpdates: string[];
    objectUpdates: string[];
    dangerDelta: number;
    phaseSuggestion: string;
  };
  plotBeat?: {
    title: string;
    hook: string;
    twist: string;
    characterFocus: string;
    threat: string;
    continuity: string;
  };
  sections?: {
    narration: string;
    dialogue: string;
    consequence: string;
    options: string[];
  };
  playerNarration?: string;
  consequenceText?: string;
  engineSummary?: string;
  debugText?: string;
  memoryUpdate: CampaignMemoryUpdate;
  stateSuggestions: StateSuggestion[];
  pacingHint: "continue" | "next_scene" | "finale";
  structuredNarration?: DungeonNarrationOutput;
  enrichedOptions?: Array<{ id: string; label: string }>;
};

export type FinalRecapRequest = {
  room: GameRoom;
  sessionConfig: SessionConfig;
  world: WorldConfig;
};

export type FinalRecapResponse = {
  recap: string;
};

// Opening scene narrated by the LLM at session start. Only public NPC data crosses
// this boundary: secrets/alibis/whatTheyHide must never reach the opening prompt.
export type OpeningSceneRequest = {
  campaignTitle: string;
  narratorVoice?: NarratorVoice;
  premise: string;
  storyHook?: string;
  stakes?: string[];
  scene: { title: string; objective: string };
  npcs: Array<{ name: string; role?: string; description?: string; desire?: string; fear?: string }>;
  optionLabels: string[];
  playerNames: string[];
  /** Cómo entran los héroes a la historia según la perspectiva elegida (exterior/interior). */
  perspectiveEntry?: string;
};

export type OpeningSceneResponse = {
  narration: string;
  dialogue?: string;
};

// Improvised story mode (Fase A): the LLM authors the fiction; the engine keeps the
// proven template mechanics (options, stats, dice, endings). Only narrative content
// crosses this boundary — no outcome kinds, no difficulty numbers, no rules.
export type ImprovisedSceneContent = {
  title: string;
  objective: string;
  /** Physical object the players can examine in this scene (feeds the option label). */
  keyObject: string;
  /** Risky route out of / deeper into the scene (feeds the option label). */
  escapeRoute: string;
};

export type ImprovisedNpcContent = {
  name: string;
  role: string;
  description: string;
  motive: string;
  secret: string;
  desire?: string;
  fear?: string;
  /** Aspecto físico dibujable, imaginado por el LLM — alimenta el retrato generado. */
  appearance?: string;
};

export type ImprovisedStoryContent = {
  title: string;
  genre: string;
  premise: string;
  storyHook: string;
  hiddenTruth: string;
  themeSkill: string;
  twist: string;
  stakes: string[];
  threat: { name: string; description: string; specialMove: string };
  scenes: ImprovisedSceneContent[];
  npcs: ImprovisedNpcContent[];
  clues: Array<{ title: string; text: string; sceneIndex: number }>;
};

// Mundo sellado: ambiente central + reglas inmutables que el narrador respeta
// pero que el jugador descubre poco a poco (nunca se muestran de entrada).
export type WorldEra = {
  id: string;
  name: string;
  era: string;
  /** Única línea visible al elegir mundo: intriga sin spoiler. */
  tagline: string;
  ambience: string;
  worldRules: string[];
  /** Instrucciones de tono/elementos para la Forja de historias de este mundo. */
  forgeSeasoning: string;
  /** Historia madre escrita a mano (ej: luna-roja para Veldaran); sin esto, se forja. */
  authoredCampaignId?: string;
  entry: { exterior: string; interior: string };
};

export type StoryPerspective = "exterior" | "interior";

export type ImprovisedWorldContext = {
  worldName: string;
  era: string;
  ambience: string;
  rules: string[];
  seasoning: string;
  perspective: StoryPerspective;
  entryLine: string;
};

export type ImprovisedStoryRequest = {
  userPrompt: string;
  playerNames?: string[];
  worldContext?: ImprovisedWorldContext;
};

export interface DungeonMasterProvider {
  generateNarration(input: NarrationRequest): Promise<NarrationResponse>;
  generateFinalRecap(input: FinalRecapRequest): Promise<FinalRecapResponse>;
  generateOpeningScene?(input: OpeningSceneRequest): Promise<OpeningSceneResponse>;
  generateImprovisedStory?(input: ImprovisedStoryRequest): Promise<ImprovisedStoryContent>;
}
