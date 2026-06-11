import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRelevantTabSelectUserMessage,
  parseRelevantTabSelectResponse,
} from "../src/prompts/relevantTabSelectPrompt.js";

const catalog = [
  {
    index: 1,
    title: "Sarah Chen | LinkedIn",
    url: "https://linkedin.com/in/sarahchen",
    domain: "linkedin.com",
    currentGroup: null,
    pinned: false,
  },
];

test("buildRelevantTabSelectUserMessage includes focus and catalog", () => {
  const message = buildRelevantTabSelectUserMessage({
    focusQuery: "Sarah investor outreach",
    artifactKind: "outreach",
    maxTabs: 5,
    catalog,
  });
  assert.match(message, /Sarah investor outreach/);
  assert.match(message, /linkedin.com\/in\/sarahchen/);
});

test("parseRelevantTabSelectResponse validates indices", () => {
  const parsed = parseRelevantTabSelectResponse(
    {
      selectedIndices: [1, 99],
      rationale: "LinkedIn profile matches Sarah",
      warnings: [],
    },
    catalog,
    5
  );
  assert.ok(parsed);
  assert.deepEqual(parsed?.selectedIndices, [1]);
});
