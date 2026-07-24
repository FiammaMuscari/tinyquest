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
const viteSource = await readFile(new URL("../apps/web/vite.config.ts", import.meta.url), "utf8");
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

test("Frente V24 es una pintura cercana y más detallada referenciada por Cuerpo", () => {
  const face = portraits.characterPortraitUrl("Fiamy", appearance, "fantasy", 2);
  const body = portraits.fullBodyPortraitUrl("Fiamy", appearance, "fantasy", 2);
  const prompt = promptFrom(face);
  assert.notEqual(face, body);
  assert.match(prompt, /HERO FACE DETAIL V24.*intimate close three-quarter portrait.*Head is large and near camera/is);
  assert.match(prompt, /Waist, hips, legs and feet remain outside frame.*Never full body/is);
  assert.match(prompt, /STYLE FIDELITY LOCK: preserve the canonical body's exact medieval dark-fantasy hand-painted language/is);
  assert.match(prompt, /QUALITY FLOOR: face, eyes, hair\/fringe, scars.*at least as defined as the body master/is);
  assert.ok(prompt.length <= 1960, `prompt de frente truncable: ${prompt.length}`);
});

test("Cuerpo V26 prioriza encuadre corporal y mantiene calidad adulta", () => {
  const url = portraits.fullBodyPortraitUrl("Fiamy", appearance, "fantasy", 2);
  const prompt = promptFrom(url);
  assert.match(prompt.slice(0, 1500), /HERO BODY MASTER V26.*CAMERA FIRST — NON-NEGOTIABLE.*complete head through both feet.*full torso, hips, both arms.*BOTH KNEES.*lower legs visible.*body fills the vertical frame.*not a portrait, bust, headshot or close-up.*visibly hand-painted matte oil.*MATURE ADULT QUALITY FLOOR.*STYLE FIDELITY LOCK:.*mature semi-realism.*CANONICAL SPEC:/is);
  assert.match(prompt, /FULLY CLOTHED opaque medieval layers/i);
  assert.match(prompt, /CANONICAL SPEC:.*VIOLET PURPLE.*scar on left eyebrow/is);
  assert.match(prompt, /NO blur, deformity, extra digits\/limbs.*nudity\/bare chest.*mixed gender anatomy/is);
  assert.equal(new URL(url).searchParams.get("width"), "384");
  assert.equal(new URL(url).searchParams.get("height"), "512");
  assert.deepEqual(portraits.kneeUpCropGeometry(384, 512), { sx: 8, sy: 0, sw: 368, sh: 420, width: 448, height: 512 });
  assert.match(portraitSource, /if \(cropVersion\) blob = await cropHeroPortrait\(blob, cropVersion\)/);
  assert.ok(prompt.length <= 1960, `prompt de cuerpo truncable: ${prompt.length}`);
});

test("durante Reimaginar se oculta la imagen anterior y se muestra el spinner", () => {
  assert.match(appSource, /heroPairBusy\s*\?\s*<img src=\{loadingSpinnerDataUri\} className="summaryShot imgLoadingBg"/);
  assert.match(appSource, /portraitBusy\s*\?\s*<img src=\{loadingSpinnerDataUri\} className="heroPortrait imgLoadingBg"/);
  assert.match(appSource, /disabled=\{!heroLookDone \|\| portraitBusy\}/);
});

test("Frente y Cuerpo comparten seed temporal; la ficha guardada puede conservar sus URLs", () => {
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

test("editar o guardar jamás regenera; solo Reimaginar reemplaza el par", () => {
  assert.match(appSource, /CharacterDesigner draft=\{draft\} setDraft=\{setDraft\} disabled=\{false\} portraitBusy=\{heroPairBusy\}/);
  assert.match(appSource, /Guardar la ficha NUNCA genera ni cambia Frente\/Cuerpo/);
  assert.match(appSource, /Solo Reimaginar puede reemplazarlo/);
  assert.doesNotMatch(appSource, /Sí, guardar y actualizar/);
  assert.match(appSource, /if \(!stored\) return;\s*setDraft\(createCharacter\(\{ \.\.\.draft, look: \{ \.\.\.draft\.look, avatarShot: shot \}, avatarUrl: stored \}\)\)/s);
  assert.match(appSource, /Commit atómico:[\s\S]+if \(!ready\) \{[\s\S]+heroPairRetryRef\.current/);
  assert.doesNotMatch(appSource, /CURACIÓN al arrancar|expected = heroImageUrls\(current\)/);
});

test("las selecciones visuales no se desmarcan ni se pisan con clicks rápidos", () => {
  assert.match(appSource, /const editorDraftRef = useRef\(draft\)/);
  assert.match(appSource, /const current = editorDraftRef\.current;[\s\S]+editorDraftRef\.current = next;[\s\S]+setDraft\(next\)/);
  assert.doesNotMatch(appSource, /gender: draft\.look\?\.gender === option \? undefined/);
  assert.doesNotMatch(appSource, /skinTone: draft\.look\?\.skinTone === option\.label \? undefined/);
  assert.doesNotMatch(appSource, /eyeColor: draft\.look\?\.eyeColor === option\.label \? undefined/);
  assert.doesNotMatch(appSource, /hairColor: draft\.look\?\.hairColor === option\.label \? undefined/);
  assert.doesNotMatch(appSource, /hairLength: draft\.look\?\.hairLength === option \? undefined/);
});

test("Reimaginar cambia a Cuerpo y lo carga antes de derivar Frente", () => {
  assert.match(appSource, /look: \{ \.\.\.current\.look, avatarShot: "fullbody" \}/);
  assert.match(appSource, /avatarUrl: current\.look\?\.fullBodyUrl \?\? current\.avatarUrl/);
  assert.match(appSource, /forgeHeroPortraitPair\(retry\?\.identity === identity \? retry\.nonce : seedNonce, bodyFirst\)/);
  assert.match(appSource, /linkPortraitReference\(urls\.face, urls\.fullbody\)/);
});

test("la forja literaria usa Gemini por defecto y reserva Groq para los turnos", () => {
  assert.match(appSource, /VITE_MASTER_PROVIDER \?\? "gemini"/);
});

test("Frente usa edición referenciada y el caché sigue versionado", () => {
  assert.match(appSource, /linkPortraitStyleReferences\(urls\.face/);
  assert.match(workerSource, /OUTPUT COMPOSITION OVERRIDES THE REFERENCE FRAMING/);
  assert.match(workerSource, /never return, crop, zoom or preserve the full-body composition/);
  assert.match(workerSource, /x-tiny-quest-composition.*close-portrait-v24/s);
  assert.match(portraitSource, /x-tiny-quest-identity-source"\) !== "canonical-body"/);
  assert.match(portraitSource, /x-tiny-quest-composition"\) !== "close-portrait-v24"/);
  assert.match(workerSource, /function imageCacheFamily\(prompt\)/);
  assert.match(workerSource, /const family = imageCacheFamily\(input\.prompt\)/);
  assert.match(portraitSource, /if \(isVersionedTinyQuestImageUrl\(url\) \|\| isCanonicalHeroPortraitUrl\(url\)\) throw new ReferenceVariantError\(\)/);
});

test("el servidor local 5173 cumple el mismo contrato de Frente que producción", () => {
  assert.match(viteSource, /HERO FACE \(\?:VARIANT\|DETAIL\) V\\d\+/);
  assert.match(viteSource, /flux-1-schnell/);
  assert.match(viteSource, /OUTPUT COMPOSITION OVERRIDES THE REFERENCE FRAMING/);
  assert.match(viteSource, /x-tiny-quest-identity-source", "canonical-body"/);
  assert.match(viteSource, /x-tiny-quest-composition", faceDetail \? "close-portrait-v24"/);
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

test("la portada muestra el fondo rápido y compone al héroe sin bloquear", () => {
  assert.match(appSource, /const ready = Boolean\(src\)/);
  assert.doesNotMatch(appSource, /src && heroShotUrl && !composed\)\) return <AssetForging/);
});

test("editar la identidad adapta la historia sin descartar el reparto", () => {
  assert.match(appSource, /lastForgedHeroKeyRef\.current !== storyHeroIdentityKey\(character\)/);
  assert.match(appSource, /revisionOf: lastForgedContentRef\.current/);
  assert.match(appSource, /lastForgeWishRef\.current/);
  assert.match(appSource, /storyVariationRef\.current \+= 1/);
});

test("Toda escena V2 conserva el entorno vacío incluso en modo huellas", () => {
  const args = ["Historia", "Archivo", "Hallar el sello", "Marea de Ceniza", "Era sellada", "elfa de ojos verdes", "agua subterránea", ["No hay agua expuesta"], "La ceniza contiene oro"];
  const place = promptFrom(portraits.liveSceneImageUrl("place", ...args));
  const hero = promptFrom(portraits.liveSceneImageUrl("hero", ...args));
  assert.match(place.slice(0, 1200), /TINYQUEST ENVIRONMENT SCENE V2.*CONFIRMED BEAT.*ZERO people, heroes, NPCs, creatures or silhouettes/is);
  assert.match(hero, /Environmental traces.*hero outside frame/is);
  assert.doesNotMatch(hero, /EXPRESSION LOCK:|SINGLE-SUBJECT/i);
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
