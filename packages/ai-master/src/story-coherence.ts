import type { ImprovisedStoryContent, ImprovisedStoryRequest } from "@tiny-quest/game-engine";

const genericTitlePattern = /^(?:el|la|los|las)\s+(?:eco|sombra|susurro|secreto|misterio|destino|amenaza|maldici[oó]n|despertar|profec[ií]a)\s+(?:de|del|en)\b/i;
const genericVisibleProsePattern = /\b(?:nada es lo que parece|antes de que sea demasiado tarde|una carrera contra el tiempo|la [uú]nica esperanza|la [uú]nica forma|deber[aá] descubrir|se ver[aá] obligado|un oscuro secreto|una antigua amenaza)\b/i;
const genericSceneTitlePattern = /^(?:la verdad(?: torcida| oculta)?|la decisi[oó]n final|el enfrentamiento final|el cl[ií]max|la revelaci[oó]n|el desenlace)$/i;
const sensoryLanguagePattern = /\b(?:huele|olor|perfume|hedor|sabor|amargo|salado|cruje|chirria|rechina|susurra|zumba|silba|vibra|tiembla|chisporrotea|[aá]spero|viscoso|fr[ií]o|calor|humo|polvo|ceniza|sangre|metal|barro|sal|cera|aceite)\b/i;

function words(text: string): string[] {
  return text.trim().split(/\s+/u).filter(Boolean);
}

function meaningfulTokens(text: string): Set<string> {
  const stop = new Set(["para", "como", "este", "esta", "estos", "estas", "desde", "hasta", "entre", "donde", "cuando", "quien", "tiene", "tienen", "pero", "porque", "sobre", "tras", "bajo", "mundo", "héroe", "heroe", "grupo"]);
  return new Set((text.toLocaleLowerCase("es").match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 3 && !stop.has(token)));
}

function entryOverlap(premise: string, entryLine: string): number {
  const entry = meaningfulTokens(entryLine);
  if (entry.size === 0) return 0;
  const premiseTokens = meaningfulTokens(premise);
  let common = 0;
  for (const token of entry) if (premiseTokens.has(token)) common += 1;
  return common >= 4 ? common / entry.size : 0;
}

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
  // Escala temporal: si el jugador pidió una duración LARGA (meses/años), la
  // historia NO debe arrancar como si todo pasara en una noche/día — antes se
  // penalizaba lo contrario (regla vieja). Ahora el reloj debe respetar la escala.
  const longDuration = /(\d+|un|dos|tres|cuatro|seis)\s*(mes|meses|año|años)/i.test(wish);
  const shortClock = /(anochecer|amanecer|medianoche|esta noche|antes del alba|en horas|una noche|hoy mismo)/i.test(content.summary?.timeLimit ?? "");
  if (longDuration && shortClock) issues.push("reloj-ignora-escala-larga");
  if (input.hero && !content.heroBond) issues.push("hero-sin-vinculo");
  // Nota: las opciones de escena las arma el MOTOR (campaigns/room-state), que ya
  // evita "presionar" a NPCs animales; acá no hay opciones que validar.
  // Apellidos que se leen mal: epíteto-guion descriptivo ('Ojos-de-Humo',
  // 'Susurro-Gris') o el nombre del mundo pegado como apellido ('de Ceniza').
  const requested = new Set(nameMatches.map((m) => m[1].toLowerCase()));
  const worldWords = (input.worldContext?.worldName ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  for (const npc of content.npcs ?? []) {
    const name = npc?.name ?? "";
    if (requested.has(name.toLowerCase())) continue; // nombre del jugador: intacto
    if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]+-[A-Za-zÁÉÍÓÚÑáéíóúñ]+/.test(name)) issues.push(`apellido-epiteto-guion:${name}`);
    else if (worldWords.some((w) => name.toLowerCase().includes(w))) issues.push(`apellido-nombre-del-mundo:${name}`);
  }

  // Control editorial solo para la forja de mundos (producción siempre trae
  // worldContext). Evita títulos atmosféricos intercambiables y sinopsis que se
  // limitan a repetir la línea de entrada o a apilar información del mundo.
  if (input.worldContext) {
    const title = content.title?.trim() ?? "";
    const premise = content.premise?.trim() ?? "";
    const titleWords = words(title).length;
    const premiseWords = words(premise).length;
    const sentenceCount = premise.split(/[.!?]+/u).map((part) => part.trim()).filter(Boolean).length;
    if (titleWords < 3 || titleWords > 8) issues.push("titulo-sin-pulso:debe-tener-3-a-8-palabras");
    if (genericTitlePattern.test(title)) issues.push(`titulo-generico:${title}`);
    if (premiseWords < 45 || premiseWords > 120) issues.push(`premisa-sin-ritmo:${premiseWords}-palabras`);
    if (sentenceCount < 2 || sentenceCount > 3) issues.push(`premisa-estructura:${sentenceCount}-oraciones`);
    if (genericVisibleProsePattern.test(premise)) issues.push("premisa-cliche");
    if (!sensoryLanguagePattern.test(premise)) issues.push("premisa-sin-detalle-sensorial");
    if (entryOverlap(premise, input.worldContext.entryLine) >= 0.42) issues.push("premisa-repite-la-entrada");
    for (const scene of content.scenes ?? []) {
      if (genericSceneTitlePattern.test(scene?.title?.trim() ?? "")) issues.push(`escena-titulo-generico:${scene?.title}`);
    }
  }
  return issues;
}
