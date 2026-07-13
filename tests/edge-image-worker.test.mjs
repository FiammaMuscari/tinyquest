import assert from "node:assert/strict";
import test from "node:test";

const stored = new Map();
globalThis.caches = {
  default: {
    async match(request) { return stored.get(request.url)?.clone(); },
    async put(request, response) { stored.set(request.url, response.clone()); }
  }
};

const worker = (await import("../apps/edge-worker/src/worker.js")).default;

function harness() {
  const calls = [];
  const pending = [];
  const env = {
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { image: btoa("fake-jpeg") };
      }
    },
    ASSETS: { fetch: () => new Response("asset") }
  };
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  return { calls, pending, env, ctx };
}

async function generate(prompt, width, height, setup) {
  const request = new Request("https://tinyquest.test/api/cf-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, width, height, seed: 71 })
  });
  const response = await worker.fetch(request, setup.env, setup.ctx);
  await Promise.all(setup.pending.splice(0));
  return response;
}

test("NPC 448² usa seis pasos mientras el héroe conserva ocho", async () => {
  stored.clear();
  const npc = harness();
  const npcResponse = await generate("TINYQUEST NPC PORTRAIT V17. mujer elfa", 448, 448, npc);
  assert.equal(npcResponse.status, 200);
  assert.equal(npc.calls[0].input.steps, 6);
  assert.equal(npc.calls[0].input.width, 448);
  assert.equal(npc.calls[0].input.height, 448);

  const hero = harness();
  await generate("TINYQUEST HERO BODY MASTER V25. full standing figure", 384, 512, hero);
  assert.equal(hero.calls[0].input.steps, 8);
});

test("el segundo payload idéntico sale de caché sin ejecutar IA", async () => {
  stored.clear();
  const first = harness();
  await generate("TINYQUEST CREATURE PORTRAIT V17. dragon", 448, 448, first);
  assert.equal(first.calls.length, 1);

  const second = harness();
  const response = await generate("TINYQUEST CREATURE PORTRAIT V17. dragon", 448, 448, second);
  assert.equal(response.status, 200);
  assert.equal(second.calls.length, 0);
});
