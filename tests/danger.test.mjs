import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importDangerModule() {
  const source = await readFile(new URL("../packages/game-engine/src/danger.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { capDangerGainForRound, getDangerBand, shouldForceSceneAdvance } = await importDangerModule();

test("getDangerBand maps danger clock thresholds", () => {
  assert.equal(getDangerBand(0), "low");
  assert.equal(getDangerBand(3), "low");
  assert.equal(getDangerBand(4), "medium");
  assert.equal(getDangerBand(6), "medium");
  assert.equal(getDangerBand(7), "high");
  assert.equal(getDangerBand(8), "high");
  assert.equal(getDangerBand(9), "critical");
  assert.equal(getDangerBand(10), "critical");
});

test("shouldForceSceneAdvance follows danger, round and clock rules", () => {
  assert.equal(shouldForceSceneAdvance({
    danger: 8,
    round: 2,
    maxRounds: 4,
    sceneClockFull: false,
    walkthroughForcedAdvance: false
  }), false);

  assert.equal(shouldForceSceneAdvance({
    danger: 9,
    round: 2,
    maxRounds: 4,
    sceneClockFull: false,
    walkthroughForcedAdvance: false
  }), true);

  assert.equal(shouldForceSceneAdvance({
    danger: 10,
    round: 2,
    maxRounds: 4,
    sceneClockFull: false,
    walkthroughForcedAdvance: false
  }), true);

  assert.equal(shouldForceSceneAdvance({
    danger: 5,
    round: 4,
    maxRounds: 4,
    sceneClockFull: false,
    walkthroughForcedAdvance: false
  }), true);
});


test("capDangerGainForRound stretches danger escalation", () => {
  assert.equal(capDangerGainForRound({ requestedGain: 2, currentRoundGain: 0 }), 2);
  assert.equal(capDangerGainForRound({ requestedGain: 2, currentRoundGain: 1 }), 1);
  assert.equal(capDangerGainForRound({ requestedGain: 2, currentRoundGain: 2 }), 0);
  assert.equal(capDangerGainForRound({ requestedGain: 1, currentRoundGain: 4 }), 0);
});
