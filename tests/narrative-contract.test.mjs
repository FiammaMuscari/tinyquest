import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

async function importContract() {
  const dir = join(tmpdir(), `tinyquest-narrative-${process.pid}`);
  await mkdir(dir, { recursive: true });
  const source = await readFile(new URL("../packages/game-engine/src/narrative-contract.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  await writeFile(join(dir, "narrative-contract.mjs"), outputText);
  return import(`file://${join(dir, "narrative-contract.mjs")}`);
}

const { getNarrativeActionType, narrativeDoDont } = await importContract();

test("pressure witness action requires dialogue and avoids object examination", () => {
  const choice = { id: "press", label: "Presionar al testigo", action: "Presionar al testigo de El Cadáver Bajo el Molino", category: "talk" };
  const type = getNarrativeActionType(choice);
  assert.equal(type, "pressure_witness");
  const contract = narrativeDoDont(type);
  assert(contract.must.some((item) => item.includes("diálogo")));
  assert(contract.avoid.some((item) => item.includes("examinar")));
});

test("examine object action requires physical evidence", () => {
  const choice = { id: "object", label: "Examinar el objeto clave", action: "Examinar la cuerda cortada", category: "investigate" };
  const type = getNarrativeActionType(choice);
  assert.equal(type, "examine_object");
  assert(narrativeDoDont(type).must.some((item) => item.includes("evidencia")));
});

test("force route action requires movement and route change", () => {
  const choice = { id: "route", label: "Forzar una ruta peligrosa", action: "Forzar una salida por la puerta lateral", category: "defend" };
  const type = getNarrativeActionType(choice);
  assert.equal(type, "force_route");
  assert(narrativeDoDont(type).must.some((item) => item.includes("movimiento")));
});
