// E2E de multijugador: levanta el servidor Go REAL y maneja el cliente TS REAL
// (ws-client.ts) contra él. Prueba que la normalización de protocolo case de punta
// a punta: crear sala → unirse → arrancar → turnos rotando → relay de acción.
import assert from "node:assert/strict";
import test from "node:test";
import { after, before } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import ts from "typescript";

const localGo = join(process.env.HOME, ".local/go/bin/go");
const GO = existsSync(localGo) ? localGo : "go";
const serverDir = new URL("../server-go", import.meta.url).pathname;
const env = { ...process.env, PATH: `${join(process.env.HOME, ".local/go/bin")}:${process.env.PATH}`, GOPATH: join(process.env.HOME, "go"), GOCACHE: join(process.env.HOME, ".cache/go-build") };

const PORT = 8799;
let serverProc;
let MultiplayerClient;

// Espera hasta `timeout` ms a que se cumpla una condición sobre el estado del cliente.
function waitState(client, predicate, timeout = 3000) {
  return new Promise((resolve, reject) => {
    if (predicate(client.state)) return resolve(client.state);
    const timer = setTimeout(() => { client.off("state_change", h); reject(new Error("timeout esperando estado")); }, timeout);
    const h = (s) => { if (predicate(s)) { clearTimeout(timer); client.off("state_change", h); resolve(s); } };
    client.on("state_change", h);
  });
}

function waitEvent(client, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client.off(event, h); reject(new Error(`timeout esperando evento ${event}`)); }, timeout);
    const h = (payload) => { clearTimeout(timer); client.off(event, h); resolve(payload); };
    client.on(event, h);
  });
}

// El cliente guarda el asiento en localStorage para poder reconectar, y Node no
// lo trae. Un shim global no alcanza: los dos clientes comparten proceso y se
// pisarían el asiento, que es un accidente del test y no de la realidad (cada
// jugador está en su navegador). Cada copia del módulo lleva el suyo, privado.
const SEAT_SHIM = `const localStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
})();
`;
let GuestClient;

before(async () => {
  // Compilar el binario del servidor (falla ruidosamente si el Go no compila).
  const built = spawnSync(GO, ["build", "-o", join(tmpdir(), "tq-server"), "./cmd/server"], { cwd: serverDir, env });
  if (built.status !== 0) throw new Error("go build falló:\n" + built.stderr);
  serverProc = spawn(join(tmpdir(), "tq-server"), [], { env: { ...env, PORT: String(PORT) }, stdio: "ignore" });
  // Esperar a que el puerto acepte (healthz).
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (r.ok) break;
    } catch { /* aún no levanta */ }
    await new Promise((r) => setTimeout(r, 50));
  }

  // Transpilar el cliente TS real a mjs (los `import type` se borran; no arrastra el motor).
  const dir = join(tmpdir(), `tq-mp-${process.pid}`);
  await mkdir(dir, { recursive: true });
  const styleSrc = await readFile(new URL("../apps/web/src/multiplayer/session-style.ts", import.meta.url), "utf8");
  const styleOut = ts.transpileModule(styleSrc, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  await writeFile(join(dir, "session-style.mjs"), styleOut);
  const src = await readFile(new URL("../apps/web/src/multiplayer/ws-client.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  const body = SEAT_SHIM + outputText.replace('from "./session-style"', 'from "./session-style.mjs"');
  // Dos copias del módulo = dos navegadores, cada uno con su asiento guardado.
  const hostFile = join(dir, "ws-client-a.mjs");
  const guestFile = join(dir, "ws-client-b.mjs");
  await writeFile(hostFile, body);
  await writeFile(guestFile, body);
  ({ MultiplayerClient } = await import(`file://${hostFile}`));
  ({ MultiplayerClient: GuestClient } = await import(`file://${guestFile}`));
});

after(() => { serverProc?.kill(); });

test("party completa: crear → unirse → arrancar → turnos → relay", async () => {
  const url = `ws://127.0.0.1:${PORT}`;
  const host = new MultiplayerClient(url);
  const guest = new GuestClient(url);

  // 1) Host crea la sala.
  host.createRoom("Fiamy", { name: "Fiamy", avatarUrl: "/host-cuerpo.jpg" }, { worldId: "veldaran" });
  await waitState(host, (s) => s.roomCode && s.isHost && s.playerId);
  const code = host.state.roomCode;
  const hostId = host.state.playerId;
  assert.equal(code.length, 6);

  // 2) Invitado se une.
  guest.joinRoom(code, "Beto", { name: "Beto", avatarUrl: "/beto-frente.jpg", look: { avatarShot: "face", faceUrl: "/beto-frente.jpg", fullBodyUrl: "/beto-cuerpo.jpg" } });
  await waitState(guest, (s) => s.roomCode === code && s.playerId);
  const guestId = guest.state.playerId;
  assert.notEqual(guestId, hostId);
  // El host ve la lista actualizada (2 jugadores).
  await waitState(host, (s) => s.players.length === 2);
  assert.equal(host.state.players.find((p) => p.id === guestId).character.avatarUrl, "/beto-frente.jpg");

  // La toma guardada del compañero se actualiza como fuente única para ambos.
  guest.setPlayerAvatar({ name: "Beto", avatarUrl: "/beto-cuerpo-nuevo.jpg", look: { avatarShot: "fullbody", faceUrl: "/beto-frente-nuevo.jpg", fullBodyUrl: "/beto-cuerpo-nuevo.jpg" } });
  await waitState(host, (s) => s.players.find((p) => p.id === guestId)?.character.avatarUrl === "/beto-cuerpo-nuevo.jpg");
  await waitState(guest, (s) => s.players.find((p) => p.id === guestId)?.character.avatarUrl === "/beto-cuerpo-nuevo.jpg");

  // 3) Host arranca la historia; primero juega él.
  const fakeRoom = { turn: 0, sessionComplete: false, players: [{ id: hostId }, { id: guestId }], activePlayerIndex: 0, sessionLog: [], currentSceneIndex: 0 };
  const guestStarted = waitEvent(guest, "story_started");
  host.startStory(fakeRoom, hostId);
  const gs = await guestStarted;
  assert.equal(gs.yourTurn, false, "el invitado NO arranca");
  await waitState(guest, (s) => s.phase === "watching");

  // 4) Host difunde su turno: ahora le toca al invitado.
  const guestUpdate = waitEvent(guest, "state_update");
  host.broadcastState({ ...fakeRoom, turn: 1, activePlayerIndex: 1 }, guestId, "El host actuó.");
  const su = await guestUpdate;
  assert.equal(su.yourTurn, true, "tras el broadcast, el turno pasa al invitado");
  await waitState(guest, (s) => s.phase === "active" && s.yourTurn);

  // 5) El invitado manda su acción → al host le llega como guest_action.
  const relay = waitEvent(host, "guest_action");
  guest.submitAction("forzar la puerta", "body", true, true);
  const ga = await relay;
  assert.equal(ga.playerId, guestId);
  assert.equal(ga.action, "forzar la puerta");
  assert.equal(ga.stat, "body");
  assert.equal(ga.usePet, true);
  // El talento es del invitado: si no viaja, el host resuelve con SU toggle.
  assert.equal(ga.useTalent, true, "useTalent del invitado debe llegar al host");

  // 6) Chat compartido, color personal y expulsión del host.
  guest.setChatColor("#ff66aa");
  await waitState(guest, (s) => s.players.find((p) => p.id === guestId)?.chatColor === "#ff66aa");
  host.setChatColor("#ff66aa");
  await waitState(host, (s) => s.errorMessage?.includes("ya pertenece"));
  const hostChat = waitEvent(host, "chat_message");
  guest.sendChat("Hola desde el grupo");
  const chat = await hostChat;
  assert.equal(chat.text, "Hola desde el grupo");
  assert.equal(chat.color, "#ff66aa");
  host.kickPlayer(guestId);
  await waitState(guest, (s) => s.kickedMessage && s.roomCode === null);

  host.disconnect();
  guest.disconnect();
});

test("al anfitrión se le corta el socket y vuelve a su asiento solo", async () => {
  // El caso que rompió la sala en producción: un despliegue del Worker cerró todos
  // los sockets. El anfitrión no guardaba asiento, así que su socket nuevo no era
  // dueño de nada: el servidor le contestaba "not_host" a todo (la puerta no abría,
  // la historia no arrancaba) y a los 5 minutos la sala se borraba sola.
  const url = `ws://127.0.0.1:${PORT}`;
  const host = new MultiplayerClient(url);
  const guest = new GuestClient(url);

  host.createRoom("Annie", { name: "Annie", avatarUrl: "/annie.jpg" }, { worldId: "veldaran" });
  await waitState(host, (s) => s.roomCode && s.isHost);
  const code = host.state.roomCode;
  const hostId = host.state.playerId;

  // El corte pasa ANTES de que entre nadie: en un proceso los dos clientes
  // comparten localStorage, y si el invitado guarda su asiento encima tapa
  // justamente el agujero que hay que probar (el anfitrión no guardaba el suyo).
  // Corte brusco: como un despliegue o un wifi que parpadea. NO es una salida
  // intencional, así que el cliente tiene que reconectar por su cuenta.
  host.ws.close();
  await waitState(host, (s) => /Reconect/i.test(s.errorMessage ?? ""), 4000);

  // Vuelve al MISMO asiento, sigue siendo anfitrión y sigue en su sala de espera
  // (no en la del invitado, que es desde donde no se puede arrancar).
  await waitState(host, (s) => s.errorMessage === null && s.playerId === hostId, 8000);
  assert.equal(host.state.isHost, true);
  assert.equal(host.state.roomCode, code);
  assert.equal(host.state.phase, "lobby_host");

  // La sala sobrevivió y el socket nuevo manda de verdad: entra un invitado y el
  // anfitrión abre la puerta, que es lo que antes fallaba con "not_host".
  guest.joinRoom(code, "ernie", { name: "ernie", avatarUrl: "/ernie.jpg" });
  await waitState(host, (s) => s.players.length === 2, 4000);
  host.setRoomOptions(true);
  await waitState(guest, (s) => s.allowMidJoin === true, 4000);

  host.disconnect();
  guest.disconnect();
});

test("unirse a sala inexistente reporta error", async () => {
  const guest = new MultiplayerClient(`ws://127.0.0.1:${PORT}`);
  const err = waitEvent(guest, "error");
  guest.joinRoom("ZZZZZZ", "X", { name: "X" });
  const message = await err;
  assert.match(message, /sala/i);
  guest.disconnect();
});
