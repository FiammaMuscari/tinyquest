import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function transpile(src, out) {
  const source = await readFile(new URL(src, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(out, outputText);
}

const dir = join(tmpdir(), `tinyquest-story-coherence-${process.pid}`);
await mkdir(dir, { recursive: true });
await transpile("../packages/ai-master/src/story-coherence.ts", join(dir, "story-coherence.mjs"));
const { storyCoherenceIssues } = await import(`file://${join(dir, "story-coherence.mjs")}`);

const hero = { name: "Nyra", species: "elfa", role: "cazadora", petName: "Alma Dracónica", concept: "busca a su hermana" };

function baseStory(overrides = {}) {
  return {
    title: "El Rastro de Ceniza",
    premise: "El perro Firulais gime junto al cuerpo; el olor a ceniza no es del incendio.",
    npcs: [
      { name: "Firulais", role: "aliado", bond: "tu perro", description: "perro rastreador" },
      { name: "Marga", role: "testigo", bond: "vecina de la víctima", description: "anciana" }
    ],
    scenes: [{ title: "La casa quemada", objective: "Seguir a Firulais" }],
    clues: [{ title: "El collar", text: "Firulais olfatea un guante ajeno", sceneIndex: 1 }],
    threat: { name: "El Encapuchado", description: "prende fuegos" },
    summary: { objective: "Encontrá al culpable", risk: "Tu perro", firstMystery: "¿De quién es el guante?", timeLimit: "antes del anochecer" },
    heroBond: "El incendio fue en la casa de tu hermana.",
    ...overrides
  };
}

test("historia sana con pedido y héroe pasa sin problemas", () => {
  const issues = storyCoherenceIssues(baseStory(), { userPrompt: "un perro llamado Firulais", hero });
  assert.deepEqual(issues, []);
});

test("nombre pedido ausente en toda la salida se detecta", () => {
  const story = baseStory({
    premise: "Un incendio sin testigos.",
    npcs: [{ name: "Marga", role: "testigo", bond: "vecina", description: "anciana" }],
    scenes: [{ title: "La casa quemada", objective: "Investigar" }],
    clues: [{ title: "El guante", text: "un guante ajeno", sceneIndex: 1 }]
  });
  const issues = storyCoherenceIssues(story, { userPrompt: "un perro llamado Firulais", hero });
  assert.ok(issues.includes("nombre-perdido:firulais"));
});

test("nombre solo decorativo (fuera de campos jugables) se detecta", () => {
  const story = baseStory({
    premise: "Un incendio sin testigos.",
    npcs: [{ name: "Marga", role: "testigo", bond: "vecina", description: "anciana" }],
    scenes: [{ title: "La casa quemada", objective: "Investigar" }],
    clues: [{ title: "El guante", text: "un guante ajeno", sceneIndex: 1 }],
    heroBond: "Firulais te acompaña desde niña."
  });
  const issues = storyCoherenceIssues(story, { userPrompt: "un perro llamado Firulais", hero });
  assert.ok(issues.includes("nombre-sin-rol-jugable:firulais"));
});

test("compañero del héroe fusionado con la mascota pedida se detecta", () => {
  const story = baseStory({
    premise: "Tu perro Alma Dracónica olfatea el cuerpo.",
    npcs: [{ name: "Marga", role: "testigo", bond: "vecina", description: "anciana" }],
    scenes: [{ title: "La casa", objective: "Seguir al perro firulais" }],
    clues: [{ title: "El collar", text: "firulais halló un guante", sceneIndex: 1 }]
  });
  const issues = storyCoherenceIssues(story, { userPrompt: "un perro llamado Firulais", hero });
  assert.ok(issues.includes("compañero-fusionado-con-mascota"));
});

test("NPC cuyo bond nombra al compañero del héroe se detecta", () => {
  const story = baseStory({
    npcs: [
      { name: "Firulais", role: "aliado", bond: "tu perro", description: "perro rastreador" },
      { name: "Sombra", role: "guía", bond: "es Alma Dracónica, tu compañera", description: "criatura" }
    ]
  });
  const issues = storyCoherenceIssues(story, { userPrompt: "un perro llamado Firulais", hero });
  assert.ok(issues.some((i) => i.startsWith("npc-fusionado-con-compañero:")));
});

test("duración larga pedida: un reloj coherente (meses/semanas) NO se penaliza", () => {
  const story = baseStory({ summary: { objective: "Encontrá al culpable", risk: "Tu perro", firstMystery: "¿Quién?", timeLimit: "quedan seis semanas antes de la luna nueva" } });
  const issues = storyCoherenceIssues(story, { userPrompt: "una búsqueda de tres meses con un perro llamado Firulais", hero });
  assert.ok(!issues.some((i) => i.startsWith("reloj")));
});

test("duración larga pedida pero reloj de una noche SE penaliza (ignora la escala)", () => {
  const story = baseStory({ summary: { objective: "Encontrá al culpable", risk: "Tu perro", firstMystery: "¿Quién?", timeLimit: "antes del anochecer" } });
  const issues = storyCoherenceIssues(story, { userPrompt: "una búsqueda de tres meses con un perro llamado Firulais", hero });
  assert.ok(issues.includes("reloj-ignora-escala-larga"));
});

test("héroe presente exige heroBond", () => {
  const story = baseStory({ heroBond: undefined });
  const issues = storyCoherenceIssues(story, { userPrompt: "un perro llamado Firulais", hero });
  assert.ok(issues.includes("hero-sin-vinculo"));
});

test("palabras descriptivas tras sustantivo de mascota no cuentan como nombre", () => {
  const story = baseStory({ premise: "Un incendio sin testigos y un perro negro suelto." });
  const issues = storyCoherenceIssues(story, { userPrompt: "un perro negro gigante llamado Firulais", hero });
  assert.ok(!issues.some((i) => i.includes("negro") || i.includes("gigante")));
});

test("sin pedido ni héroe no hay problemas", () => {
  const issues = storyCoherenceIssues(baseStory({ heroBond: undefined }), {});
  assert.deepEqual(issues, []);
});

test("apellidos con epíteto-guion se detectan (Ojos-de-Humo, Susurro-Gris)", () => {
  const story = baseStory({
    npcs: [
      { name: "Lyra Ojos-de-Humo", role: "aliada", bond: "amiga", description: "x" },
      { name: "Kaelen Susurro-Gris", role: "anciano", bond: "linaje", description: "x" }
    ]
  });
  const issues = storyCoherenceIssues(story, { userPrompt: "aventura", hero });
  assert.ok(issues.filter((i) => i.startsWith("apellido-epiteto-guion")).length === 2);
});

test("apellido con el nombre del mundo se detecta (Theron de Ceniza)", () => {
  const story = baseStory({
    npcs: [{ name: "Theron de Ceniza", role: "acusador", bond: "consejo", description: "x" }]
  });
  const issues = storyCoherenceIssues(story, { userPrompt: "aventura", hero, worldContext: { worldName: "La Marea de Ceniza", era: "", ambience: "", rules: [], seasoning: "", perspective: "exterior", entryLine: "" } });
  assert.ok(issues.some((i) => i.startsWith("apellido-nombre-del-mundo")));
});

test("apellido propio eufónico NO se penaliza (Lyra Valdren)", () => {
  const story = baseStory({
    npcs: [{ name: "Lyra Valdren", role: "aliada", bond: "amiga", description: "x" }]
  });
  const issues = storyCoherenceIssues(story, { userPrompt: "aventura", hero });
  assert.ok(!issues.some((i) => i.startsWith("apellido")));
});

test("el nombre del jugador con guion NO se penaliza", () => {
  const story = baseStory({
    npcs: [{ name: "Firulais", role: "compañero", bond: "tu perro", description: "x" }]
  });
  const issues = storyCoherenceIssues(story, { userPrompt: "un perro llamado Firulais", hero });
  assert.ok(!issues.some((i) => i.startsWith("apellido")));
});
