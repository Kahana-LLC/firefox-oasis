import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_AUTO_TRANSCRIPT_LENGTH,
  shouldDiscardAutoTranscript,
} from "./voiceUtteranceGuards.js";

test("manual stop never discards", () => {
  assert.equal(shouldDiscardAutoTranscript("a", true), false);
  assert.equal(shouldDiscardAutoTranscript("", true), false);
});

test("empty does not discard via guard", () => {
  assert.equal(shouldDiscardAutoTranscript("", false), false);
});

test("long enough never discards", () => {
  assert.equal(shouldDiscardAutoTranscript("hello", false), false);
  assert.equal(
    shouldDiscardAutoTranscript("a".repeat(MIN_AUTO_TRANSCRIPT_LENGTH), false),
    false
  );
});

test("allowlisted short phrases", () => {
  assert.equal(shouldDiscardAutoTranscript("ok", false), false);
  assert.equal(shouldDiscardAutoTranscript("back", false), false);
  assert.equal(shouldDiscardAutoTranscript("  Tab  ", false), false);
});

test("very short non-allowlist auto discards", () => {
  assert.equal(shouldDiscardAutoTranscript("hi", false), true);
  assert.equal(shouldDiscardAutoTranscript("um", false), true);
});
