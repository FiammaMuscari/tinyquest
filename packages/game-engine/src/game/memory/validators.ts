import type { DmRetrievedContext, NarrationResponse } from "../../types";

export function validateLLMOutputAgainstFacts(output: NarrationResponse, context: DmRetrievedContext): string[] {
  const text = [
    output.narration,
    output.consequence,
    output.sections?.narration,
    output.sections?.consequence,
    output.nextOptions.join(" ")
  ].filter(Boolean).join(" ").toLowerCase();

  return context.forbiddenContradictions.filter((rule) => {
    const target = rule.split(" ")[0]?.toLowerCase();
    return target ? text.includes(target) && rule.includes("no debe") : false;
  });
}
