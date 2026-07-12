import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "tinyquest-portrait-prompts-"));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const visualSource = await readFile(new URL("../apps/web/src/visual-identity.ts", import.meta.url), "utf8");
let portraitSource = await readFile(new URL("../apps/web/src/portraits.ts", import.meta.url), "utf8");
portraitSource = portraitSource
  .replace(/^import \{ useCallback[^\n]+\n/, "")
  .replace('from "./visual-identity"', 'from "./visual-identity.mjs"');
await writeFile(join(dir, "visual-identity.mjs"), transpile(visualSource));
await writeFile(join(dir, "portraits.mjs"), transpile(portraitSource));
const portraits = await import(`file://${join(dir, "portraits.mjs")}`);

const appearance = "EXACT SKIN COLOR: light warm beige skin. EXACT IRIS COLOR: strongly saturated VIOLET PURPLE irises, NOT blue. EXACT HAIR COLOR: metallic golden hair. female veil elf, black and gold medieval gown, scar on left eyebrow";
const promptFrom = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\/prompt\//, ""));

test("Frente prioriza cámara e identidad antes del estilo", () => {
  const prompt = promptFrom(portraits.characterPortraitUrl("Fiamy", appearance, "fantasy", 2));
  assert.ok(prompt.indexOf("CAMERA MANDATORY") < prompt.indexOf("IDENTITY LOCK"));
  assert.match(prompt.slice(0, 500), /three-quarter profile.*VIOLET PURPLE/is);
  assert.ok(prompt.length <= 1960, `prompt de frente truncable: ${prompt.length}`);
});

test("Cuerpo exige long shot y pies antes del límite del proveedor", () => {
  const prompt = promptFrom(portraits.fullBodyPortraitUrl("Fiamy", appearance, "fantasy", 2));
  assert.match(prompt.slice(0, 520), /FULL BODY LONG SHOT.*55 percent.*BOTH FEET/is);
  assert.ok(prompt.indexOf("FULL BODY LONG SHOT") < prompt.indexOf("IDENTITY LOCK"));
  assert.ok(prompt.length <= 1960, `prompt de cuerpo truncable: ${prompt.length}`);
});
