import assert from "node:assert/strict";
import test from "node:test";
import { advanceVadSpeechDebounce } from "./voiceVadDebounce.js";

test("resets streak when not speech", () => {
  assert.deepEqual(advanceVadSpeechDebounce(2, false, 3), {
    streak: 0,
    commit: false,
  });
});

test("increments until commit", () => {
  assert.deepEqual(advanceVadSpeechDebounce(0, true, 3), {
    streak: 1,
    commit: false,
  });
  assert.deepEqual(advanceVadSpeechDebounce(1, true, 3), {
    streak: 2,
    commit: false,
  });
  assert.deepEqual(advanceVadSpeechDebounce(2, true, 3), {
    streak: 0,
    commit: true,
  });
});

test("commit on first frame when debounce is 1", () => {
  assert.deepEqual(advanceVadSpeechDebounce(0, true, 1), {
    streak: 0,
    commit: true,
  });
});
