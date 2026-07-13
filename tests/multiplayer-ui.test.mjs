import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

const dir = await mkdtemp(join(tmpdir(), "tinyquest-mp-ui-"));
const source = await readFile(new URL("../apps/web/src/multiplayer/session-style.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
await writeFile(join(dir, "session-style.mjs"), output);
const style = await import(`file://${join(dir, "session-style.mjs")}`);
const appSource = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../apps/web/src/styles/app.css", import.meta.url), "utf8");
const protocolSource = await readFile(new URL("../apps/web/src/multiplayer/protocol.ts", import.meta.url), "utf8");
const hubSource = await readFile(new URL("../server-go/internal/hub/hub.go", import.meta.url), "utf8");

test("el color de chat debe ser único y legible", () => {
  assert.match(style.validateChatColor("#ff66aa", ["#FF66AA"]), /ya pertenece/);
  assert.match(style.validateChatColor("#111111", []), /contraste/);
  assert.equal(style.validateChatColor("#8ff2e2", ["#f5d77b"]), null);
  assert.ok(style.chatColorContrast("#8ff2e2") >= 4.5);
});

test("el avatar multijugador conserva exactamente avatarUrl sin elegir variantes", () => {
  const character = { avatarUrl: "/fiamy-frente.jpg", look: { avatarShot: "face", faceUrl: "/fiamy-frente.jpg", fullBodyUrl: "/fiamy-cuerpo.jpg" } };
  assert.equal(style.canonicalMultiplayerCharacter(character).avatarUrl, "/fiamy-frente.jpg");
  assert.doesNotMatch(source, /Math\.random|random\(/i);
  assert.match(protocolSource, /set_player_avatar/);
  assert.match(appSource, /MultiplayerAvatarImg/);
  assert.match(appSource, /multiplayerAvatarSignature/);
});

test("el relay impone color único, contraste y difunde cambios de avatar", () => {
  assert.match(hubSource, /nextChatColor\(room\)/);
  assert.match(hubSource, /chatColorReadable/);
  assert.match(hubSource, /strings\.EqualFold\(other\.chatColor, msg\.Color\)/);
  assert.match(hubSource, /func \(h \*Hub\) setPlayerAvatar/);
  assert.match(hubSource, /SPlayerUpdated/);
});

test("el chat puede minimizarse y redimensionarse sin romper mobile", () => {
  assert.match(appSource, /partyChatMinimized/);
  assert.match(appSource, /ResizeObserver/);
  assert.match(cssSource, /\.partyChatFloating[\s\S]*resize: both/);
  assert.match(cssSource, /\.partyChatEmbedded[\s\S]*resize: vertical/);
  assert.match(cssSource, /@media \(max-width: 680px\)[\s\S]*resize: vertical/);
  assert.match(cssSource, /max-width: calc\(100vw - 28px\)/);
});

test("los mensajes existentes adoptan inmediatamente el color sincronizado", () => {
  assert.match(appSource, /messageColor = mpState\.players\.find/);
  assert.match(appSource, /validateChatColor\(colorDraft, usedColors\)/);
});
