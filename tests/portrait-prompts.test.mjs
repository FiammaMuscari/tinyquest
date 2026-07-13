import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "tinyquest-portrait-prompts-"));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const visualSource = await readFile(new URL("../apps/web/src/visual-identity.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../apps/edge-worker/src/worker.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
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

test("Frente es una variante 3/4 preparada para derivarse del cuerpo master", () => {
  const url = portraits.characterPortraitUrl("Fiamy", appearance, "fantasy", 2);
  const prompt = promptFrom(url);
  assert.match(prompt, /HERO FACE VARIANT V22/);
  assert.match(prompt.slice(0, 180), /MEDIUM: visibly hand-painted matte oil/i);
  assert.ok(prompt.indexOf("CANONICAL SPEC:") < prompt.indexOf("CAMERA:"));
  assert.match(prompt.slice(0, 700), /VIOLET PURPLE.*3\/4 head-and-shoulders.*30 degrees/is);
  assert.match(prompt, /EXPRESSION LOCK: calm alert self-possession/i);
  assert.match(prompt, /FACE QUALITY: crisp believable proportions/i);
  assert.equal(new URL(url).searchParams.get("width"), "512");
  assert.equal(new URL(url).searchParams.get("height"), "512");
  assert.ok(prompt.length <= 1960, `prompt de frente truncable: ${prompt.length}`);
});

test("Cuerpo genera rodillas y descarta determinísticamente la franja de pies", () => {
  const url = portraits.fullBodyPortraitUrl("Fiamy", appearance, "fantasy", 2);
  const prompt = promptFrom(url);
  assert.match(prompt.slice(0, 1200), /HERO BODY MASTER V22.*CAMERA FIRST.*whole head through feet.*margins.*BOTH KNEES.*crops below knees/is);
  assert.match(prompt.slice(0, 180), /MEDIUM: visibly hand-painted matte oil/i);
  assert.match(prompt, /FULLY CLOTHED opaque medieval layers/i);
  assert.match(prompt, /NO blur, deformity, extra digits\/limbs.*nudity\/bare chest.*mixed gender anatomy/is);
  assert.ok(prompt.indexOf("CAMERA FIRST:") < prompt.indexOf("CANONICAL SPEC:"));
  assert.equal(new URL(url).searchParams.get("width"), "384");
  assert.equal(new URL(url).searchParams.get("height"), "512");
  assert.deepEqual(portraits.kneeUpCropGeometry(384, 512), { sx: 8, sy: 0, sw: 368, sh: 420, width: 448, height: 512 });
  assert.match(portraitSource, /if \(needsKneeUpCrop\(url\)\) blob = await cropKneeUpPortrait\(blob\)/);
  assert.ok(prompt.length <= 1960, `prompt de cuerpo truncable: ${prompt.length}`);
});

test("Frente y Cuerpo comparten seed temporal y una pestaña nueva no revive caché vieja", () => {
  const face = portraits.characterPortraitUrl("Fiamy", appearance, "fantasy", 77);
  const body = portraits.fullBodyPortraitUrl("Fiamy", appearance, "fantasy", 77);
  assert.equal(new URL(face).searchParams.get("seed"), new URL(body).searchParams.get("seed"));
  assert.match(portraitSource, /tiny-quest:portrait-session-seed-v1/);
  assert.match(portraitSource, /typeof sessionStorage === "undefined"/);
  assert.match(appSource, /sessionStorage\.getItem\(draftStorageKey\)/);
  assert.match(appSource, /sessionStorage\.setItem\(draftStorageKey/);
  assert.match(appSource, /previousFaceUrl: reimagining/);
  assert.match(appSource, /Recuperar versión anterior/);
});

test("Worker deriva Frente desde Cuerpo sin rediseñar persona o ropa", () => {
  assert.match(appSource, /linkPortraitReference\(urls\.face, urls\.fullbody\)/);
  assert.match(appSource, /linkPortraitStyleReferences\(urls\.face, \["\/assets\/style\/face-style-oil\.jpg"\]\)/);
  assert.doesNotMatch(appSource, /linkPortraitReference\(urls\.fullbody, urls\.face\)/);
  assert.match(workerSource, /HERO FACE VARIANT V22/);
  assert.match(workerSource, /IMAGE_PIPELINE_VERSION = "image-v22"/);
  assert.match(workerSource, /IMMUTABLE canonical full character and wardrobe master/);
  assert.match(workerSource, /Copy the EXACT same person, facial geometry, adult sex\/gender presentation, species, anatomy, skin, iris and hair colors\/LENGTH/);
  assert.match(workerSource, /face and torso MUST express the same coherent gender/);
  assert.match(workerSource, /Keep chest and torso fully clothed/);
  assert.match(workerSource, /Reject anime, doll-face, beauty-render and glossy digital smoothness/);
  assert.match(workerSource, /Change ONLY camera to close head-and-shoulders/);
  assert.match(workerSource, /Expression only moves brows, eyelids and mouth; never geometry/);
  assert.match(portraitSource, /if \(referenceUrl\) throw new ReferenceVariantError\(\)/);
});

test("medallones NPC usan perfil rápido de seis pasos", () => {
  assert.match(workerSource, /fastMedallion/);
  assert.match(workerSource, /steps: fastMedallion \? 6 : 8/);
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
  assert.match(hero, /EXPRESSION LOCK:/i);
  assert.match(hero, /only natural expression responds to the confirmed beat/i);
  assert.ok(place.length <= 1960, `prompt de escena truncable: ${place.length}`);
  assert.ok(hero.length <= 1960, `prompt de escena con héroe truncable: ${hero.length}`);
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
  assert.equal(new URL(url).searchParams.get("width"), "448");
  assert.equal(new URL(url).searchParams.get("height"), "448");
});

test("una amenaza de viento genera fenómeno y no un rostro aleatorio", () => {
  const url = portraits.beingPortraitUrlWithContext(
    "Viento de los Portales",
    undefined,
    "fantasía oscura",
    { description: "Corrientes de aire que abren grietas dimensionales y arrastran objetos", role: "amenaza" }
  );
  const prompt = promptFrom(url);
  assert.match(prompt, /TINYQUEST PHENOMENON V17/i);
  assert.match(prompt, /Absolutely no human, humanoid, face/i);
});
