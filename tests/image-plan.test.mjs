import assert from "node:assert/strict";
import test from "node:test";
import { planImage } from "../apps/edge-worker/src/image-plan.js";

// image-plan.js es la FUENTE ÚNICA que comparten el Worker de prod (worker.js) y
// el middleware dev de Vite (vite.config.ts). Este test blinda las decisiones
// para que local y prod nunca vuelvan a divergir (modelo, prompt, pasos, recortes).

test("sin referencia ni estilo → schnell 8 pasos, prompt recortado a 1960", () => {
  const plan = planImage({ prompt: "TINYQUEST HERO BODY MASTER V29. " + "x".repeat(4000), width: 384, height: 512, seed: 7, hasReference: false, styleCount: 0 });
  assert.equal(plan.model, "@cf/black-forest-labs/flux-1-schnell");
  assert.equal(plan.multipart, false);
  assert.equal(plan.steps, 8);
  assert.ok(plan.promptText.startsWith("TINYQUEST HERO BODY MASTER V29"));
  assert.ok(plan.promptText.endsWith(", no text, no signature, no watermark"));
  assert.ok(plan.promptText.length <= 1960 + ", no text, no signature, no watermark".length);
});

test("medallón NPC V17 usa 6 pasos", () => {
  const plan = planImage({ prompt: "TINYQUEST NPC PORTRAIT V17. mujer elfa", width: 448, height: 448, seed: 3, hasReference: false, styleCount: 0 });
  assert.equal(plan.steps, 6);
});

test("cuerpo con SOLO style refs → klein óleo maduro, styleStart 0, sin copiar sujeto", () => {
  const plan = planImage({ prompt: "TINYQUEST HERO BODY MASTER V29. elfa rubia", width: 384, height: 512, seed: 5, hasReference: false, styleCount: 2 });
  assert.equal(plan.model, "@cf/black-forest-labs/flux-2-klein-4b");
  assert.equal(plan.multipart, true);
  assert.equal(plan.styleStart, 0);
  assert.match(plan.promptText, /Images 0-1 are STYLE REFERENCES ONLY/);
  assert.match(plan.promptText, /mature medieval oil technique/);
  assert.match(plan.promptText, /Reject anime, doll-face, beauty-render/);
  assert.match(plan.promptText, /Create the NEW character described here/);
});

test("frente con referencia canónica → klein close-portrait, styleStart 1", () => {
  const plan = planImage({ prompt: "TINYQUEST HERO FACE VARIANT V25. elfa rubia", width: 512, height: 512, seed: 9, hasReference: true, styleCount: 1 });
  assert.equal(plan.model, "@cf/black-forest-labs/flux-2-klein-4b");
  assert.equal(plan.isFace, true);
  assert.equal(plan.styleStart, 1);
  assert.match(plan.promptText, /repaint a NEW intimate square close three-quarter portrait/);
  assert.match(plan.promptText, /Images 1-1 are STYLE REFERENCES ONLY/);
});

test("cuerpo con referencia NO-face → klein 'copy the exact person and outfit'", () => {
  const plan = planImage({ prompt: "TINYQUEST HERO BODY MASTER V29. elfa rubia", width: 384, height: 512, seed: 2, hasReference: true, styleCount: 0 });
  assert.equal(plan.isFace, false);
  assert.match(plan.promptText, /IMMUTABLE canonical character and wardrobe master/);
});
