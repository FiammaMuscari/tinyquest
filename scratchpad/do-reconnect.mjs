// El mismo corte de socket, pero contra el Durable Object REAL (workerd vía
// `wrangler dev`), que es lo que corre en producción. El relay Go y el DO son
// dos implementaciones del mismo protocolo: hay que probar las dos.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const URL_WS = "ws://127.0.0.1:8788/ws";
const SHIM = `const localStorage = (() => { const s = new Map(); return { getItem: (k) => (s.has(k) ? s.get(k) : null), setItem: (k, v) => s.set(k, String(v)), removeItem: (k) => s.delete(k) }; })();\n`;
const dir = join(tmpdir(), `tq-do-${process.pid}`);
await mkdir(dir, { recursive: true });
const styleSrc = await readFile(new URL("../apps/web/src/multiplayer/session-style.ts", import.meta.url), "utf8");
await writeFile(join(dir, "session-style.mjs"), ts.transpileModule(styleSrc, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
const src = await readFile(new URL("../apps/web/src/multiplayer/ws-client.ts", import.meta.url), "utf8");
const body = SHIM + ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replace('from "./session-style"', 'from "./session-style.mjs"');
await writeFile(join(dir, "a.mjs"), body);
await writeFile(join(dir, "b.mjs"), body);
const { MultiplayerClient: A } = await import(`file://${join(dir, "a.mjs")}`);
const { MultiplayerClient: B } = await import(`file://${join(dir, "b.mjs")}`);

const wait = (c, p, ms = 8000) => new Promise((res, rej) => {
  if (p(c.state)) return res(c.state);
  const t = setTimeout(() => { c.off("state_change", h); rej(new Error("timeout")); }, ms);
  const h = (s) => { if (p(s)) { clearTimeout(t); c.off("state_change", h); res(s); } };
  c.on("state_change", h);
});

const host = new A(URL_WS);
const guest = new B(URL_WS);
host.createRoom("Annie", { name: "Annie", avatarUrl: "/annie.jpg" }, { worldId: "veldaran" });
await wait(host, (s) => s.roomCode && s.isHost);
const code = host.state.roomCode, hostId = host.state.playerId;
console.log(`sala en el DO: ${code}`);

host.ws.close(); // despliegue / wifi / tapa de notebook
await wait(host, (s) => /Reconect/i.test(s.errorMessage ?? ""), 5000);
console.log("corte detectado, reintentando…");
await wait(host, (s) => s.errorMessage === null && s.playerId === hostId, 12000);
console.log(`reconectado: mismo asiento=${host.state.playerId === hostId} anfitrión=${host.state.isHost} fase=${host.state.phase}`);

guest.joinRoom(code, "ernie", { name: "ernie", avatarUrl: "/ernie.jpg" });
await wait(host, (s) => s.players.length === 2);
host.setRoomOptions(true);
await wait(guest, (s) => s.allowMidJoin === true, 5000);
console.log("el anfitrión abre la puerta y el invitado la ve: OK");

const fake = { turn: 0, sessionComplete: false, players: [{ id: hostId }, { id: guest.state.playerId }], activePlayerIndex: 0, sessionLog: [], currentSceneIndex: 0 };
host.startStory(fake, hostId);
await wait(guest, (s) => s.gameRoom !== null, 5000);
console.log("la historia arranca con el invitado esperando en la sala: OK");
host.disconnect(); guest.disconnect();
process.exit(0);
