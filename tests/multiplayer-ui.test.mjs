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

test("la miniatura del avatar viaja por el relay y nunca sustituye la toma elegida", () => {
  // El dueño del personaje genera la miniatura; sin ella cada navegador tenía que
  // volver a pedirle la imagen al generador y mientras tanto mostraba la otra toma.
  const withThumb = {
    avatarUrl: "https://image.pollinations.ai/prompt/x?width=512",
    look: { avatarShot: "face", faceUrl: "https://image.pollinations.ai/prompt/x?width=512", fullBodyUrl: "/cuerpo.jpg", avatarThumb: "data:image/jpeg;base64,AAAA", avatarThumbKey: "abc123" }
  };
  assert.equal(style.canonicalMultiplayerCharacter(withThumb).look.avatarThumb, "data:image/jpeg;base64,AAAA");
  assert.match(style.multiplayerAvatarSignature(withThumb), /avatarThumbKey/);

  // Republica cuando cambia la miniatura, aunque la URL grande sea la misma.
  const otherThumb = { ...withThumb, look: { ...withThumb.look, avatarThumbKey: "zzz999" } };
  assert.notEqual(style.multiplayerAvatarSignature(withThumb), style.multiplayerAvatarSignature(otherThumb));

  // Tope del relay: si el Character se pasa, cae la miniatura y NO el avatar.
  const huge = { ...withThumb, look: { ...withThumb.look, avatarThumb: `data:image/jpeg;base64,${"A".repeat(60_000)}` } };
  const trimmed = style.canonicalMultiplayerCharacter(huge);
  assert.equal(trimmed.look.avatarThumb, undefined);
  assert.equal(trimmed.look.avatarThumbKey, undefined);
  assert.equal(trimmed.avatarUrl, huge.avatarUrl, "el asiento se publica igual");
  assert.ok(JSON.stringify(trimmed).length < 64_000, "entra en el límite del hub");

  // La sala usa la miniatura como respaldo, jamás la otra toma cuando existe.
  assert.match(appSource, /const thumb = character\.look\?\.avatarThumbKey === portraitThumbKey\(character\.avatarUrl\)/);
  assert.match(appSource, /buildPortraitThumb/);
  assert.match(hubSource, /64\s*\*\s*1024/, "el hub sigue capando el Character");
});
