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

const dir = join(tmpdir(), `tinyquest-json-repair-${process.pid}`);
await mkdir(dir, { recursive: true });
await transpile("../packages/ai-master/src/json-repair.ts", join(dir, "json-repair.mjs"));
const { repairLooseJson } = await import(`file://${join(dir, "json-repair.mjs")}`);

test("JSON sano pasa intacto", () => {
  const clean = '{"title":"Hola","scenes":[{"title":"Uno"}]}';
  assert.deepEqual(JSON.parse(repairLooseJson(clean)), JSON.parse(clean));
});

test("fences de markdown y texto previo se eliminan", () => {
  const wrapped = 'Claro, acá va:\n```json\n{"title":"Hola"}\n```';
  assert.deepEqual(JSON.parse(repairLooseJson(wrapped)), { title: "Hola" });
});

test("comas colgantes se corrigen", () => {
  const trailing = '{"title":"Hola","stakes":["a","b",],}';
  assert.deepEqual(JSON.parse(repairLooseJson(trailing)), { title: "Hola", stakes: ["a", "b"] });
});

test("truncado a mitad de string se cierra y parsea", () => {
  const truncated = '{"title":"Hola","scenes":[{"title":"Uno","objective":"Encontrar al culpable ant';
  const parsed = JSON.parse(repairLooseJson(truncated));
  assert.equal(parsed.title, "Hola");
  assert.equal(parsed.scenes[0].title, "Uno");
  assert.ok(parsed.scenes[0].objective.startsWith("Encontrar"));
});

test("truncado con clave colgante sin valor se poda", () => {
  const truncated = '{"title":"Hola","npcs":[{"name":"Vorr","secret":"algo"},{"name"';
  const parsed = JSON.parse(repairLooseJson(truncated));
  assert.equal(parsed.title, "Hola");
  assert.equal(parsed.npcs[0].name, "Vorr");
});

test("truncado justo después de dos puntos se poda", () => {
  const truncated = '{"title":"Hola","twist":';
  const parsed = JSON.parse(repairLooseJson(truncated));
  assert.equal(parsed.title, "Hola");
});

test("texto extra después del objeto completo se descarta", () => {
  const noisy = '{"title":"Hola"} y eso sería todo, ¡que la disfrutes!';
  assert.deepEqual(JSON.parse(repairLooseJson(noisy)), { title: "Hola" });
});
