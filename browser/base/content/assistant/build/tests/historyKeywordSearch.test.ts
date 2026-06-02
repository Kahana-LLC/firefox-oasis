import test from "node:test";
import assert from "node:assert/strict";

import { mergeKeywordHistoryResults } from "../src/services/historyKeywordSearch.js";

test("mergeKeywordHistoryResults prefers Places title match", () => {
  const merged = mergeKeywordHistoryResults({
    query: "agents",
    limit: 5,
    places: [
      {
        title: "Building AI Agents",
        url: "https://example.com/agents",
        visitDate: 1000,
        snippet: "",
        matchField: "title",
      },
    ],
    orama: [],
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].matchType, "title");
  assert.equal(merged[0].score, 1);
});

test("mergeKeywordHistoryResults adds snippet excerpt from Orama", () => {
  const merged = mergeKeywordHistoryResults({
    query: "agents",
    limit: 5,
    places: [],
    orama: [
      {
        title: "Research",
        url: "https://example.com/post",
        snippet:
          "This article discusses autonomous agents in production systems.",
        visitDate: 2000,
        score: 0.8,
      },
    ],
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].matchType, "snippet");
  assert.match(String(merged[0].excerpt), /agents/i);
});

test("mergeKeywordHistoryResults dedupes by URL keeping higher score", () => {
  const merged = mergeKeywordHistoryResults({
    query: "oauth",
    limit: 5,
    places: [
      {
        title: "OAuth Guide",
        url: "https://example.com/oauth",
        visitDate: 1000,
        snippet: "",
        matchField: "title",
      },
    ],
    orama: [
      {
        title: "OAuth Guide",
        url: "https://example.com/oauth",
        snippet: "OAuth flows explained in detail for developers.",
        visitDate: 1000,
        score: 0.75,
      },
    ],
  });
  assert.equal(merged.length, 1);
  assert.ok(merged[0].excerpt);
});
