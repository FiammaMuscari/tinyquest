// E2E de multijugador: levanta el servidor Go REAL y maneja el cliente TS REAL
// (ws-client.ts) contra él. Prueba que la normalización de protocolo case de punta
// a punta: crear sala → unirse → arrancar → turnos rotando → relay de acción.
import assert from "node:assert/strict";
import test from "node:test";
import { after, before } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import ts from "typescript";

const GO = join(process.env.HOME, ".local/go/bin/go");
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
  const src = await readFile(new URL("../apps/web/src/multiplayer/ws-client.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  const out = join(dir, "ws-client.mjs");
  await writeFile(out, outputText);
  ({ MultiplayerClient } = await import(`file://${out}`));
});

after(() => { serverProc?.kill(); });

test("party completa: crear → unirse → arrancar → turnos → relay", async () => {
  const url = `ws://127.0.0.1:${PORT}`;
  const host = new MultiplayerClient(url);
  const guest = new MultiplayerClient(url);

  // 1) Host crea la sala.
  host.createRoom("Fiamy", { name: "Fiamy" }, { worldId: "veldaran" });
  await waitState(host, (s) => s.roomCode && s.isHost && s.playerId);
  const code = host.state.roomCode;
  const hostId = host.state.playerId;
  assert.equal(code.length, 6);

  // 2) Invitado se une.
  guest.joinRoom(code, "Beto", { name: "Beto" });
  await waitState(guest, (s) => s.roomCode === code && s.playerId);
  const guestId = guest.state.playerId;
  assert.notEqual(guestId, hostId);
  // El host ve la lista actualizada (2 jugadores).
  await waitState(host, (s) => s.players.length === 2);

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
  guest.submitAction("forzar la puerta", "body", true);
  const ga = await relay;
  assert.equal(ga.playerId, guestId);
  assert.equal(ga.action, "forzar la puerta");
  assert.equal(ga.stat, "body");
  assert.equal(ga.usePet, true);

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
