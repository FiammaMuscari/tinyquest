import type { CampaignBlueprint, SceneNode, StoryGraph, StoryNodeKind } from "./story-graph.types";

function nodeKindForLocation(fn: string, isFirst: boolean): StoryNodeKind {
  if (isFirst) return "setup";
  if (fn === "crime_scene") return "investigation";
  if (fn === "social_hub") return "social_pressure";
  if (fn === "danger_zone") return "danger_encounter";
  if (fn === "hidden_room") return "revelation";
  if (fn === "final_stage") return "final_confrontation";
  if (fn === "transition") return "route_choice";
  return "npc_interaction";
}

export function compileCampaignBlueprint(blueprint: CampaignBlueprint): StoryGraph {
  const orderedLocations = blueprint.locations.slice(0, Math.max(1, blueprint.targetSceneCount));
  const startLocation = orderedLocations[0] ?? blueprint.locations[0];
  const nodes: Record<string, SceneNode> = {};

  orderedLocations.forEach((location, index) => {
    const nodeId = `node:${location.id}`;
    const next = orderedLocations[index + 1];
    const threat = blueprint.threats[index % Math.max(1, blueprint.threats.length)];
    const clock = blueprint.clocks[index % Math.max(1, blueprint.clocks.length)];
    nodes[nodeId] = {
      nodeId,
      sceneId: nodeId,
      kind: nodeKindForLocation(location.function, index === 0),
      title: location.name,
      locationId: location.id,
      dramaticQuestion: index === orderedLocations.length - 1 ? blueprint.dramaticQuestion : `¿Qué cambia en ${location.name} antes de que avance ${blueprint.failurePressure}?`,
      objective: index === orderedLocations.length - 1 ? blueprint.playerGoal : `Usar ${location.name} para abrir una rama sin perder control.`,
      pressure: threat?.pressure ?? clock?.meaning ?? blueprint.failurePressure,
      entryCondition: index === 0 ? [] : [{ kind: "route", id: `${orderedLocations[index - 1].id}->${location.id}`, op: "eq", value: "available" }],
      exitConditions: next ? [{ kind: "score", id: "progress", op: "gte", value: 1 }] : [{ kind: "score", id: "ending", op: "gte", value: 1 }],
      defaultNextSceneId: next ? `node:${next.id}` : undefined,
      possibleNextSceneIds: location.connectedLocationIds.map((id) => `node:${id}`).filter((id) => Boolean(orderedLocations.find((loc) => `node:${loc.id}` === id))),
      actionPool: [],
      escalationTable: threat ? [{ eventId: `escalate:${threat.id}:${location.id}`, trigger: [{ kind: "clock", id: clock?.id ?? threat.id, op: "gte", value: clock?.max ?? 3 }], patch: { flags: { [`threat:${threat.id}:escalated`]: true } }, visibleConsequence: threat.escalationSteps[0] ?? threat.pressure }] : []
    };
  });

  return { campaignId: blueprint.id, title: blueprint.title, startNodeId: `node:${startLocation.id}`, nodes, blueprint };
}
