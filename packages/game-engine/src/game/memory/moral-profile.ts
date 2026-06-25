import type { ActionResolution } from "../../types";

export type MoralProfile = {
  mercy: number;
  truth: number;
  pragmatism: number;
  corruption: number;
  loyalty: number;
  violence: number;
  deception: number;
  sacrifice: number;

  lastMoralChoice?: string;
  rememberedByNpcIds: string[];
};

export function initialMoralProfile(): MoralProfile {
  return { mercy: 0, truth: 0, pragmatism: 0, corruption: 0, loyalty: 0, violence: 0, deception: 0, sacrifice: 0, rememberedByNpcIds: [] };
}

const labelRules: Array<{ pattern: RegExp; key: keyof Omit<MoralProfile, "lastMoralChoice" | "rememberedByNpcIds">; delta: number }> = [
  { pattern: /misericordia|perdonar|salvar|proteger/i, key: "mercy", delta: 1 },
  { pattern: /revelar|verdad|exponer|acusar|prueba/i, key: "truth", delta: 1 },
  { pattern: /sacrific|perder|coste|romper/i, key: "sacrifice", delta: 1 },
  { pattern: /mentir|fingir|engañar|falso/i, key: "deception", delta: 1 },
  { pattern: /traicionar|abandonar|delatar/i, key: "corruption", delta: 1 },
  { pattern: /atacar|golpear|combatir|herir/i, key: "violence", delta: 1 },
  { pattern: /lealtad|defender|proteger aliado/i, key: "loyalty", delta: 1 },
  { pattern: /negociar|trato|acuerdo|precio/i, key: "pragmatism", delta: 1 },
];

export function updateMoralProfileFromResolution(profile: MoralProfile, resolution: ActionResolution): MoralProfile {
  const outcome = resolution.check.outcome;
  if (outcome === "failure") return profile;

  const label = (resolution.narrationRequest.rawAction + " " + (resolution.narrationRequest.resolutionPlan?.actionText ?? "")).toLowerCase();
  const affectedNpcIds = resolution.turnResolution.npcChanges.map((n) => n.id).filter((id): id is string => Boolean(id));

  let next = { ...profile };

  for (const rule of labelRules) {
    if (rule.pattern.test(label)) {
      next = { ...next, [rule.key]: next[rule.key] + rule.delta };
    }
  }

  if (affectedNpcIds.length > 0) {
    next.rememberedByNpcIds = Array.from(new Set([...next.rememberedByNpcIds, ...affectedNpcIds])).slice(-8);
  }

  const plan = resolution.narrationRequest.resolutionPlan;
  if (plan?.consequence.socialChange && (plan.consequence.socialChange.includes("moral") || plan.consequence.emotionalChange)) {
    next.lastMoralChoice = resolution.narrationRequest.rawAction.slice(0, 80);
  }

  return next;
}

export function summarizeMoralProfileForPrompt(profile: MoralProfile, actorName: string): string {
  const traits: string[] = [];

  if (profile.truth >= 2) traits.push("favors truth over mercy");
  if (profile.mercy >= 2) traits.push("shows mercy under pressure");
  if (profile.deception >= 2) traits.push("has used deception multiple times");
  if (profile.violence >= 2) traits.push("resorts to violence when cornered");
  if (profile.sacrifice >= 2) traits.push("has paid costly prices for progress");
  if (profile.loyalty >= 2) traits.push("protects allies actively");
  if (profile.corruption >= 1) traits.push("has betrayed trust");
  if (profile.pragmatism >= 2) traits.push("negotiates pragmatically over principles");

  if (traits.length === 0) return "";

  const npcWarning = profile.rememberedByNpcIds.length > 0
    ? ` NPCs who witnessed choices (${profile.rememberedByNpcIds.slice(0, 3).join(", ")}) should react accordingly.`
    : "";

  return `${actorName} has ${traits.join("; ")}.${npcWarning}`;
}
