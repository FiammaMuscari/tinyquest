import type { ImprovisedStoryContent, ImprovisedStoryRequest } from "@tiny-quest/game-engine";

// Revisión de coherencia determinista sobre la salida de la forja (sin LLM, gratis):
// devuelve la lista de problemas; vacía = salida aceptable. Cubre los fallos que
// reportó el playtest: nombres del pedido perdidos, compañero del héroe fusionado
// con la mascota pedida, reloj inicial confundido con la duración total, héroe suelto.
export function storyCoherenceIssues(content: ImprovisedStoryContent, input: ImprovisedStoryRequest): string[] {
  const issues: string[] = [];
  const serialized = JSON.stringify(content).toLowerCase();
  const wish = input.userPrompt ?? "";
  const skipWords = new Set(["llamado", "llamada", "nombre", "negro", "negra", "oscuro", "oscura", "blanco", "blanca", "gigante", "pequeño", "pequeña"]);
  const nameMatches = [
    ...wish.matchAll(/llamad[oa]s?\s+([\p{L}]{3,})/giu),
    ...wish.matchAll(/(?:de\s+nombre|se\s+llama)\s+([\p{L}]{3,})/giu),
    ...wish.matchAll(/(?:perro|gato|lobo|caballo|mascota|dragón|dragon|cuervo)\s+([\p{L}]{3,})/giu)
  ];
  // Los nombres pedidos deben vivir en los campos JUGABLES (premisa, NPCs, escenas,
  // pistas) — una mención decorativa en heroBond o keywordsUsed no cuenta.
  const playable = JSON.stringify({ premise: content.premise, npcs: content.npcs, scenes: content.scenes, clues: content.clues, threat: content.threat }).toLowerCase();
  for (const match of nameMatches) {
    const name = match[1].toLowerCase();
    if (skipWords.has(name)) continue;
    if (!serialized.includes(name)) issues.push(`nombre-perdido:${name}`);
    else if (!playable.includes(name)) issues.push(`nombre-sin-rol-jugable:${name}`);
  }
  const petName = input.hero?.petName?.toLowerCase();
  if (petName) {
    const escaped = petName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fusion = new RegExp(`(?:perro|gato|lobo|caballo|mascota)[^.!?"]{0,26}${escaped}`, "i");
    if (nameMatches.length > 0 && fusion.test(serialized)) issues.push("compañero-fusionado-con-mascota");
    // Un NPC no puede SER el compañero del héroe: si su bond lo nombra, hubo fusión.
    for (const npc of content.npcs ?? []) {
      if (npc?.bond?.toLowerCase().includes(petName)) issues.push(`npc-fusionado-con-compañero:${npc.name}`);
    }
  }
  const longDuration = /(\d+|un|dos|tres|cuatro|seis)\s*(mes|meses|año|años)/i.test(wish);
  if (longDuration && /(mes|meses|año|años)/i.test(content.summary?.timeLimit ?? "")) issues.push("reloj-inicial-es-duracion-total");
  if (input.hero && !content.heroBond) issues.push("hero-sin-vinculo");
  return issues;
}
