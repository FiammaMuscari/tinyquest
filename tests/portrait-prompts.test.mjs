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

test("expone referencias de estilo separadas de la identidad", () => {
  assert.equal(typeof portraits.linkPortraitReference, "function");
  assert.equal(typeof portraits.linkPortraitStyleReferences, "function");
});

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

test("Portada prioriza leyes del mundo y fondo sin figuras", () => {
  const prompt = promptFrom(portraits.storySceneImageUrl("Deuda de Ceniza", "Marea de Ceniza", "Era sellada", "Archivo quemado", "agua subterránea", ["No hay agua expuesta"]));
  assert.match(prompt.slice(0, 800), /CLEAN ENVIRONMENT MATTE-PAINTING BACKGROUND PLATE.*ABANDONED EVACUATED.*ABSOLUTE WORLD CONSTRAINTS.*bone-dry cracked matte mineral ground/is);
  assert.ok(prompt.length <= 1960, `prompt de portada truncable: ${prompt.length}`);
});

test("Escena diferencia ambiente vacío de modo héroe", () => {
  const args = ["Historia", "Archivo", "Hallar el sello", "Marea de Ceniza", "Era sellada", "elfa de ojos verdes", "agua subterránea", ["No hay agua expuesta"], "La ceniza contiene oro"];
  const place = promptFrom(portraits.liveSceneImageUrl("place", ...args));
  const hero = promptFrom(portraits.liveSceneImageUrl("hero", ...args));
  assert.match(place.slice(0, 1000), /ABSOLUTE WORLD CONSTRAINTS.*CLEAN ENVIRONMENT MATTE-PAINTING BACKGROUND PLATE/is);
  assert.match(hero.slice(0, 900), /ABSOLUTE WORLD CONSTRAINTS.*SINGLE-SUBJECT FILM COMPOSITE/is);
  assert.ok(place.length <= 1960, `prompt de escena truncable: ${place.length}`);
});

test("NPC combina apariencia y descripción en un medallón cuadrado", () => {
  const url = portraits.beingPortraitUrlWithContext(
    "Dama Oria",
    "mujer elfa adulta, piel oscura, ojos dorados, pelo blanco",
    "castillo nocturno",
    { description: "guardiana que lleva una llave de cobre", role: "aliada" }
  );
  const prompt = promptFrom(url);
  assert.match(prompt, /mujer elfa adulta.*NARRATIVE DESCRIPTION TO MATCH VISUALLY.*llave de cobre/is);
  assert.equal(new URL(url).searchParams.get("width"), "512");
  assert.equal(new URL(url).searchParams.get("height"), "512");
});

test("una amenaza de viento genera fenómeno y no un rostro aleatorio", () => {
  const url = portraits.beingPortraitUrlWithContext(
    "Viento de los Portales",
    undefined,
    "fantasía oscura",
    { description: "Corrientes de aire que abren grietas dimensionales y arrastran objetos", role: "amenaza" }
  );
  const prompt = promptFrom(url);
  assert.match(prompt, /TINYQUEST PHENOMENON V15/i);
  assert.match(prompt, /Absolutely no human, humanoid, face/i);
});
