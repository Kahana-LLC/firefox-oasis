import test from "node:test";
import assert from "node:assert/strict";

import {
  isDistinctTopic,
  isShortLabel,
  resolveBriefTopicFields,
} from "../src/utils/researchBriefTopicPolicy.js";
import { inferResearchBriefTopicHeuristic } from "../src/utils/researchBriefTopicPolicy.js";

test("isShortLabel detects short group names", () => {
  assert.equal(isShortLabel("sports"), true);
  assert.equal(isShortLabel("AI Privacy"), true);
  assert.equal(isShortLabel("college football recruiting"), false);
  assert.equal(isShortLabel("enterprise privacy compliance guide"), false);
});

test("isDistinctTopic rejects topic that equals group label", () => {
  assert.equal(isDistinctTopic("sports", "sports"), false);
  assert.equal(isDistinctTopic("sports", "Tab group: sports"), false);
});

test("isDistinctTopic accepts substantive topic beyond group", () => {
  assert.equal(
    isDistinctTopic("college football recruiting", "sports"),
    true
  );
});

test("resolveBriefTopicFields infers for group without user topic", () => {
  const result = resolveBriefTopicFields({
    scope: "tab-group",
    groupName: "sports",
  });
  assert.equal(result.inferTopicFromContent, true);
  assert.equal(result.topic, "");
});

test("resolveBriefTopicFields uses explicit distinct topic", () => {
  const result = resolveBriefTopicFields({
    scope: "tab-group",
    groupName: "sports",
    userTopic: "college football recruiting",
  });
  assert.equal(result.inferTopicFromContent, false);
  assert.equal(result.topic, "college football recruiting");
});

test("resolveBriefTopicFields infers for tabs scope without topic", () => {
  const result = resolveBriefTopicFields({ scope: "tabs" });
  assert.equal(result.inferTopicFromContent, true);
});

test("inferResearchBriefTopicHeuristic prefers shared tokens", () => {
  const topic = inferResearchBriefTopicHeuristic([
    { title: "NFL draft picks 2025 - ESPN" },
    { title: "NFL mock draft roundup - Bleacher Report" },
    { title: "NBA playoffs schedule" },
  ]);
  assert.match(topic, /nfl/i);
});
