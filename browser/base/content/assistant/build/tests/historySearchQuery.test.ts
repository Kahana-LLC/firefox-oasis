import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeHistoryKeywordSearch,
  parseHistorySearchQuery,
  inferHistorySearchMode,
} from "../src/utils/historySearchQuery.js";

test("parseHistorySearchQuery extracts keyword from search history for agents", () => {
  const parsed = parseHistorySearchQuery("search history for agents");
  assert.ok(parsed);
  assert.equal(parsed?.query, "agents");
  assert.equal(parsed?.mode, "keyword");
  assert.equal(parsed?.quoted, false);
});

test("parseHistorySearchQuery preserves quoted phrase", () => {
  const parsed = parseHistorySearchQuery(
    'search history for "multi word term"'
  );
  assert.ok(parsed);
  assert.equal(parsed?.query, "multi word term");
  assert.equal(parsed?.mode, "keyword");
  assert.equal(parsed?.quoted, true);
});

test("parseHistorySearchQuery handles browsing history variant", () => {
  const parsed = parseHistorySearchQuery(
    "search my browsing history for transformers"
  );
  assert.ok(parsed);
  assert.equal(parsed?.query, "transformers");
  assert.equal(parsed?.mode, "keyword");
});

test("parseHistorySearchQuery returns recent mode for list history", () => {
  const parsed = parseHistorySearchQuery("search history");
  assert.ok(parsed);
  assert.equal(parsed?.query, "");
  assert.equal(parsed?.mode, "recent");
});

test("parseHistorySearchQuery find in history for", () => {
  const parsed = parseHistorySearchQuery("find in my history for oauth");
  assert.ok(parsed);
  assert.equal(parsed?.query, "oauth");
  assert.equal(parsed?.mode, "keyword");
});

test("looksLikeHistoryKeywordSearch true for keyword phrases", () => {
  assert.equal(
    looksLikeHistoryKeywordSearch("search history for agents"),
    true
  );
});

test("looksLikeHistoryKeywordSearch false for semantic phrasing", () => {
  assert.equal(
    looksLikeHistoryKeywordSearch("what did I read about agents"),
    false
  );
});

test("inferHistorySearchMode respects explicit mode", () => {
  assert.equal(inferHistorySearchMode("agents", "keyword"), "keyword");
  assert.equal(inferHistorySearchMode("", "recent"), "recent");
  assert.equal(inferHistorySearchMode("agents"), "auto");
});
