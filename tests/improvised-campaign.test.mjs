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

const dir = join(tmpdir(), `tinyquest-improvised-${process.pid}`);
await mkdir(dir, { recursive: true });
await transpile("../packages/game-engine/src/campaigns.ts", join(dir, "campaigns.mjs"));

const { buildImprovisedCampaign, IMPROVISED_CAMPAIGN_ID } = await import(`file://${join(dir, "campaigns.mjs")}`);

const fullContent = {
  title: "El Faro que Come Nombres",
  genre: "costa maldita y memoria robada",
  premise: "El farero de Cabo Ceniza desapareció y el faro sigue encendido solo. Cada noche que pasa, alguien del pueblo olvida su propio nombre. El grupo tiene tres noches antes de que el pueblo entero quede vacío de memoria.",
  storyHook: "Descubrir quién alimenta al faro antes de la tercera noche.",
  hiddenTruth: "La farera original sigue viva bajo el faro y roba nombres para pagar una deuda antigua.",
  themeSkill: "memoria",
  twist: "El farero desaparecido fue quien inició el trato: los nombres pagan su propia inmortalidad.",
  stakes: ["cada ronda alguien puede olvidar algo clave", "el faro puede apagarse y dejar entrar la niebla"],
  threat: { name: "La Niebla con Dientes", description: "Una niebla que muerde recuerdos en la costa.", specialMove: "Borra el nombre de un aliado y sube el peligro" },
  scenes: [
    { title: "El Muelle de los Olvidados", objective: "Confirmar que los olvidos empezaron con el faro.", keyObject: "el cuaderno de amarres sin nombres", escapeRoute: "el paso de las rocas bajas" },
    { title: "La Taberna del Ancla Rota", objective: "Hacer hablar a quien vio la última noche del farero.", keyObject: "la jarra marcada con iniciales raspadas", escapeRoute: "la puerta del sótano de contrabando" },
    { title: "La Escalera del Faro", objective: "Llegar a la sala de la luz sin perder la memoria propia.", keyObject: "el espejo de señales rayado", escapeRoute: "la cornisa exterior contra el viento" },
    { title: "La Cámara Bajo la Luz", objective: "Elegir final mediante pruebas, costes y estados vivos.", keyObject: "el libro de nombres a medio quemar", escapeRoute: "el túnel de la marea baja" }
  ],
  npcs: [
    { name: "Brisa Salobre", role: "npc principal", description: "Tabernera que anota lo que el pueblo olvida.", motive: "Recuperar el nombre de su hermano.", secret: "Le vendió al faro el primer nombre.", desire: "Que nadie más olvide.", fear: "Olvidarse a sí misma." },
    { name: "El Práctico Mudo", role: "secundario", description: "Guía de barcos que dejó de hablar hace un año.", motive: "Que nadie suba al faro.", secret: "Vio a la farera bajo la luz y ella le comió la voz." }
  ],
  clues: [
    { title: "Amarres sin dueño", text: "El cuaderno del muelle tiene barcos anotados por manos que ya no recuerdan haber escrito.", sceneIndex: 1 },
    { title: "Iniciales raspadas", text: "La jarra del farero tiene otras iniciales debajo: alguien vivió su vida antes que él.", sceneIndex: 2 },
    { title: "El libro a medio quemar", text: "Los nombres quemados coinciden con los vecinos que aún recuerdan todo.", sceneIndex: 4 }
  ]
};

test("buildImprovisedCampaign produce una campaña jugable con la ficción del LLM", () => {
  const campaign = buildImprovisedCampaign(fullContent);
  assert.equal(campaign.id, IMPROVISED_CAMPAIGN_ID);
  assert.equal(campaign.title, "El Faro que Come Nombres");
  assert.equal(campaign.scenes.length, 4);
  assert.equal(campaign.npcs.length, 2);
  assert.equal(campaign.clues.length, 3);
  // Cada escena referencia ids reales de pistas y NPCs.
  const clueIds = new Set(campaign.clues.map((clue) => clue.id));
  const npcIds = new Set(campaign.npcs.map((npc) => npc.id));
  for (const scene of campaign.scenes) {
    for (const clueId of scene.clueIds ?? []) assert.ok(clueIds.has(clueId), `clue ${clueId} inexistente`);
    for (const npcId of scene.npcIds ?? []) assert.ok(npcIds.has(npcId), `npc ${npcId} inexistente`);
    assert.equal(scene.multipleChoiceOptions.length, 3);
  }
  // Las etiquetas de opción usan la ficción del LLM, no placeholders.
  const labels = campaign.scenes.flatMap((scene) => scene.multipleChoiceOptions.map((option) => option.label));
  assert.ok(labels.some((label) => label.includes("cuaderno de amarres")), "keyObject no llegó a la opción");
  assert.ok(labels.some((label) => label.includes("Brisa Salobre")), "npc no llegó a la opción");
  assert.ok(labels.some((label) => label.includes("cornisa exterior")), "escapeRoute no llegó a la opción");
  // La estructura mecánica es la de la plantilla (misma forma que las campañas seed).
  assert.equal(campaign.possibleEndings.length, 7);
  assert.ok(campaign.enemies.length === 1 && campaign.enemies[0].vitality === 10);
  assert.equal(campaign.hiddenTruth, fullContent.hiddenTruth);
  assert.ok(campaign.twists?.[0]?.reveal.includes("inmortalidad"));
});

test("buildImprovisedCampaign resiste contenido incompleto del LLM", () => {
  const campaign = buildImprovisedCampaign({
    title: "Historia rota",
    genre: "",
    premise: "Una premisa mínima con misterio y un reloj que apura al grupo desde la primera escena.",
    storyHook: "",
    hiddenTruth: "",
    themeSkill: "",
    twist: "",
    stakes: [],
    threat: {},
    scenes: [{ title: "Única escena" }],
    npcs: [{ name: "Sola" }],
    clues: [{ text: "Una pista suelta.", sceneIndex: 99 }]
  });
  assert.equal(campaign.scenes.length, 4);
  assert.ok(campaign.npcs.length >= 2);
  assert.equal(campaign.clues.length, 3);
  const clueIds = new Set(campaign.clues.map((clue) => clue.id));
  for (const scene of campaign.scenes) {
    for (const clueId of scene.clueIds ?? []) assert.ok(clueIds.has(clueId));
    assert.equal(scene.multipleChoiceOptions.length, 3);
    for (const option of scene.multipleChoiceOptions) assert.ok(option.label.length > 8);
  }
  // sceneIndex fuera de rango queda clampeado a una escena real.
  assert.ok(campaign.clues.every((clue) => /scene-[1-4]$/.test(clue.sceneId)));
});

test("npcRelations se resuelven por nombre a relationshipToOtherNPCs", () => {
  const campaign = buildImprovisedCampaign({
    ...fullContent,
    npcRelations: [
      { from: "Brisa Salobre", to: "El Práctico Mudo", nature: "Le compró el silencio con el nombre de su hermano" },
      { from: "el práctico", to: "Brisa", nature: "La vigila desde el muelle por orden de la farera" },
      { from: "Brisa Salobre", to: "Brisa Salobre", nature: "auto-relación inválida" },
      { from: "Nadie Conocido", to: "Brisa Salobre", nature: "nombre que no existe" }
    ]
  });
  const [brisa, practico] = campaign.npcs;
  assert.equal(brisa.relationshipToOtherNPCs?.[practico.id], "Le compró el silencio con el nombre de su hermano");
  assert.equal(practico.relationshipToOtherNPCs?.[brisa.id], "La vigila desde el muelle por orden de la farera");
  // Ni la auto-relación ni el nombre inexistente dejan rastro.
  assert.equal(Object.keys(brisa.relationshipToOtherNPCs ?? {}).length, 1);
});

test("sin npcRelations no aparece relationshipToOtherNPCs", () => {
  const campaign = buildImprovisedCampaign(fullContent);
  for (const npc of campaign.npcs) assert.equal(npc.relationshipToOtherNPCs, undefined);
});

test("la pista marcada isFalse viaja a la campaña como pista plantada", () => {
  const campaign = buildImprovisedCampaign({
    ...fullContent,
    clues: [
      { title: "Amarres sin dueño", text: "El cuaderno del muelle tiene manos que no recuerdan.", sceneIndex: 1 },
      { title: "Iniciales raspadas", text: "La jarra tiene otras iniciales debajo.", sceneIndex: 2, isFalse: true },
      { title: "El libro a medio quemar", text: "Los nombres quemados coinciden.", sceneIndex: 4 }
    ]
  });
  assert.equal(campaign.clues[0].isFalse, undefined);
  assert.equal(campaign.clues[1].isFalse, true);
  assert.equal(campaign.clues[2].isFalse, undefined);
});
