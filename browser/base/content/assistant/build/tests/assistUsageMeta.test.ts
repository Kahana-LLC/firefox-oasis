import test from "node:test";
import assert from "node:assert/strict";
import {
  extractTokenCountsFromAssistPayload,
  extractTokenCountsFromUsageMetadata,
} from "../src/assistant/messageUtils.js";

test("extractTokenCountsFromUsageMetadata: snake_case", () => {
  const t = extractTokenCountsFromUsageMetadata({
    prompt_token_count: 12,
    candidates_token_count: 34,
  });
  assert.equal(t.input_tokens, 12);
  assert.equal(t.output_tokens, 34);
});

test("extractTokenCountsFromUsageMetadata: camelCase", () => {
  const t = extractTokenCountsFromUsageMetadata({
    promptTokenCount: 5,
    candidatesTokenCount: 7,
  });
  assert.equal(t.input_tokens, 5);
  assert.equal(t.output_tokens, 7);
});

test("extractTokenCountsFromAssistPayload reads usage_metadata", () => {
  const t = extractTokenCountsFromAssistPayload({
    next: "chat",
    usage_metadata: { prompt_token_count: 1, candidates_token_count: 2 },
  });
  assert.equal(t.input_tokens, 1);
  assert.equal(t.output_tokens, 2);
});
