import assert from "node:assert/strict";
import test from "node:test";

import { RoomHub, chatContrast } from "../apps/edge-worker/src/room-hub.js";

function socket(roomCode, playerId) {
  const messages = [];
  return {
    messages,
    deserializeAttachment: () => ({ roomCode, playerId }),
    send(payload) { messages.push(JSON.parse(payload)); }
  };
}

function setupRoom() {
  const first = socket("ABC234", "p-one");
  const second = socket("ABC234", "p-two");
  const room = {
    code: "ABC234",
    players: [
      { id: "p-one", name: "Uno", isHost: true, connected: true, chatColor: "#f5d77b", character: { name: "Uno", avatarUrl: "face-one" } },
      { id: "p-two", name: "Dos", isHost: false, connected: true, chatColor: "#8ff2e2", character: { name: "Dos", avatarUrl: "body-two" } }
    ],
    lastActivity: 0
  };
  const hub = Object.create(RoomHub.prototype);
  hub.rooms = new Map([[room.code, room]]);
  hub.ctx = {
    getWebSockets: () => [first, second],
    storage: { sql: { exec() {} } }
  };
  return { hub, room, first, second };
}

test("el Durable Object sincroniza exactamente el avatar canónico", () => {
  const { hub, room, first, second } = setupRoom();
  const character = {
    name: "Dos",
    avatarUrl: "selected-full-body-v4",
    look: { avatarShot: "body", portraitFaceUrl: "face-v4", portraitFullBodyUrl: "body-v4" }
  };

  hub.setPlayerAvatar(second, { roomCode: room.code, character });

  assert.deepEqual(room.players[1].character, character);
  assert.equal(first.messages.at(-1).type, "player_updated");
  assert.equal(first.messages.at(-1).players[1].character.avatarUrl, "selected-full-body-v4");
  assert.equal(second.messages.at(-1).players[1].character.avatarUrl, "selected-full-body-v4");
});

test("el Durable Object rechaza colores repetidos o ilegibles", () => {
  const { hub, room, first, second } = setupRoom();
  hub.setChatColor(second, { roomCode: room.code, color: "#F5D77B" });
  assert.equal(second.messages.at(-1).type, "error");
  assert.match(second.messages.at(-1).message, /otro jugador/);

  hub.setChatColor(second, { roomCode: room.code, color: "#05090f" });
  assert.equal(second.messages.at(-1).type, "error");
  assert.match(second.messages.at(-1).message, /contraste/);
  assert.ok(chatContrast("#8ff2e2") >= 4.5);
  assert.equal(room.players[1].chatColor, "#8ff2e2");
  assert.equal(first.messages.length, 0);
});
