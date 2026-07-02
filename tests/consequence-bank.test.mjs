import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpile(src, out, replacements = {}) {
  let source = await readFile(new URL(src, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(out, outputText);
}

const dir = join(tmpdir(), `tinyquest-consequences-${process.pid}`);
await mkdir(dir, { recursive: true });
await transpile("../packages/game-engine/src/dice.ts", join(dir, "dice.mjs"));
await transpile("../packages/game-engine/src/consequences.ts", join(dir, "consequences.mjs"), {
  'from "./dice"': 'from "./dice.mjs"'
});
await transpile("../packages/game-engine/src/campaigns.ts", join(dir, "campaigns.mjs"));

const { rollConsequence, DEFAULT_CONSEQUENCE_BANK } = await import(`file://${join(dir, "consequences.mjs")}`);
const { campaigns } = await import(`file://${join(dir, "campaigns.mjs")}`);

const socialCtx = { actionType: "interrogar_npc", outcome: "failure", dangerBand: "low" };
const combatCtx = { actionType: "combatir", outcome: "failure", dangerBand: "low" };

function sampleTexts(ctx, runs = 60) {
  const texts = new Set();
  for (let index = 0; index < runs; index += 1) texts.add(rollConsequence(ctx).text);
  return texts;
}

test("el resultado siempre tiene dado visible y texto", () => {
  const result = rollConsequence(socialCtx);
  assert.ok(result.roll.value >= 1);
  assert.ok(["d6", "d8"].includes(result.roll.die ?? result.roll.type ?? "d6") || result.roll.value <= 8);
  assert.ok(result.text.length > 10);
  assert.ok(result.entryId, "expone qué entry salió");
});

test("mismo peligro, distinto actionType → bancos distintos", () => {
  const social = sampleTexts(socialCtx);
  const combat = sampleTexts(combatCtx);
  const socialOnly = [...social].filter((text) => !combat.has(text));
  const combatOnly = [...combat].filter((text) => !social.has(text));
  assert.ok(socialOnly.length > 0, "hay consecuencias exclusivas de acciones sociales");
  assert.ok(combatOnly.length > 0, "hay consecuencias exclusivas de combate");
  assert.ok([...combat].some((text) => text.includes("golpe") || text.includes("choque") || text.includes("rival")), "el combate suena a combate");
});

test("banda crítica habilita consecuencias que en banda baja no salen", () => {
  const low = sampleTexts({ actionType: "combatir", outcome: "failure", dangerBand: "low" }, 80);
  const critical = sampleTexts({ actionType: "combatir", outcome: "failure", dangerBand: "critical" }, 80);
  const criticalEntry = DEFAULT_CONSEQUENCE_BANK.find((entry) => entry.id === "danger-forced-choice");
  assert.ok(!low.has(criticalEntry.text), "la consecuencia crítica no sale en banda baja");
  assert.ok(critical.has(criticalEntry.text), "la consecuencia crítica sale en banda crítica");
});

test("cascada: el banco de campaña tiene prioridad sobre el default", () => {
  const bank = [{ id: "camp-1", text: "Consecuencia exclusiva de la campaña de prueba." }];
  const seen = new Set();
  for (let index = 0; index < 30; index += 1) seen.add(rollConsequence({ campaignBank: bank }).source);
  assert.ok(seen.has("campaign"), "salen entradas de campaña");
  const first = rollConsequence({ campaignBank: bank });
  assert.equal(first.source, "campaign", "con banco de campaña sin usar, sale campaña primero");
});

test("no repite la misma consecuencia dentro de la escena (usedTexts)", () => {
  const first = rollConsequence(socialCtx);
  const used = [first.text];
  for (let index = 0; index < 40; index += 1) {
    const next = rollConsequence({ ...socialCtx, usedTexts: used });
    assert.notEqual(next.text, first.text, "una consecuencia ya narrada no vuelve a salir");
  }
});

test("con todo usado, sigue devolviendo resultado (nunca se queda sin consecuencia)", () => {
  const everything = DEFAULT_CONSEQUENCE_BANK.map((entry) => entry.text);
  const result = rollConsequence({ ...socialCtx, usedTexts: everything });
  assert.ok(result.text.length > 0);
});

test("luna-roja tiene banco propio y sus textos usan entidades de la campaña", () => {
  const lunaRoja = campaigns.find((item) => item.id === "luna-roja");
  assert.ok(lunaRoja.consequenceBank?.length >= 6, "banco de campaña presente");
  const joined = lunaRoja.consequenceBank.map((entry) => entry.text).join(" ");
  assert.match(joined, /Bran|Guardia del Umbral|Mano de Bronce|Cora|Senado/);
  const result = rollConsequence({ actionType: "combatir", outcome: "failure", dangerBand: "medium", campaignBank: lunaRoja.consequenceBank });
  assert.equal(result.source, "campaign");
});

test("los deltas mecánicos de la entry llegan al resultado", () => {
  const bank = [{ id: "x", text: "Prueba de deltas.", effects: { dangerDelta: 1, energyDelta: -1, vitalityDelta: -1, clue: "pista extra" } }];
  const result = rollConsequence({ campaignBank: bank, usedTexts: DEFAULT_CONSEQUENCE_BANK.map((entry) => entry.text) });
  assert.equal(result.dangerDelta, 1);
  assert.equal(result.energyDelta, -1);
  assert.equal(result.vitalityDelta, -1);
  assert.equal(result.clue, "pista extra");
});
