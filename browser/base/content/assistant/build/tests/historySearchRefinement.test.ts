import test from "node:test";
import assert from "node:assert/strict";

import {
  applyHistorySearchFilters,
  buildHistoryRefinementPrompt,
  mergeHistorySearchFilters,
  parseHistoryRefinementReply,
  parseHistorySearchFiltersFromArgs,
  resolvePendingHistoryRefinementGate,
  setPendingHistoryRefinement,
  clearPendingHistoryRefinement,
  shouldPromptHistoryRefinement,
} from "../src/utils/historySearchRefinement.js";

const sampleResults = Array.from({ length: 8 }, (_, i) => ({
  title: `Agents article ${i}`,
  url: `https://example.com/agents-${i}`,
  visitDate: Date.now() - i * 86_400_000,
  score: 0.9 - i * 0.01,
}));

test("shouldPromptHistoryRefinement true when many matches", () => {
  assert.equal(shouldPromptHistoryRefinement(sampleResults), true);
  assert.equal(shouldPromptHistoryRefinement(sampleResults.slice(0, 3)), false);
  assert.equal(
    shouldPromptHistoryRefinement(sampleResults, { skip: true }),
    false
  );
});

test("parseHistoryRefinementReply extracts domain and time hints", () => {
  const parsed = parseHistoryRefinementReply("on github last week");
  assert.equal(parsed.domain, "github");
  assert.ok(parsed.sinceMs);
});

test("parseHistoryRefinementReply extracts extra keywords", () => {
  const parsed = parseHistoryRefinementReply("cursor deployment notes");
  assert.deepEqual(parsed.extraTerms, ["cursor", "deployment", "notes"]);
});

test("applyHistorySearchFilters filters by domain and extra terms", () => {
  const filtered = applyHistorySearchFilters(
    [
      {
        title: "OAuth on GitHub",
        url: "https://github.com/org/oauth",
        visitDate: Date.now(),
        score: 1,
      },
      {
        title: "OAuth docs",
        url: "https://example.com/oauth",
        visitDate: Date.now(),
        score: 0.9,
      },
    ],
    { domain: "github", extraTerms: ["oauth"] }
  );
  assert.equal(filtered.length, 1);
  assert.match(filtered[0].url, /github/i);
});

test("resolvePendingHistoryRefinementGate merges follow-up into search args", () => {
  clearPendingHistoryRefinement();
  setPendingHistoryRefinement({
    query: "agents",
    mode: "keyword",
    filters: {},
    totalMatches: 12,
  });

  const gate = resolvePendingHistoryRefinementGate({
    pending: {
      query: "agents",
      mode: "keyword",
      filters: {},
      totalMatches: 12,
    },
    userText: "on github last week",
  });
  assert.equal(gate.kind, "search");
  if (gate.kind === "search") {
    assert.equal(gate.args.query, "agents");
    assert.equal(gate.args.mode, "keyword");
    assert.equal(gate.args.domain, "github");
    assert.equal(gate.args.refined, true);
  }
});

test("resolvePendingHistoryRefinementGate supports show all", () => {
  const gate = resolvePendingHistoryRefinementGate({
    pending: {
      query: "agents",
      mode: "keyword",
      filters: {},
      totalMatches: 12,
    },
    userText: "show all",
  });
  assert.equal(gate.kind, "search");
  if (gate.kind === "search") {
    assert.equal(gate.args.skipRefinement, true);
  }
});

test("parseHistorySearchFiltersFromArgs reads command args", () => {
  const filters = parseHistorySearchFiltersFromArgs({
    domain: "nytimes.com",
    extra: "taxes refund",
  });
  assert.equal(filters.domain, "nytimes.com");
  assert.deepEqual(filters.extraTerms, ["taxes", "refund"]);
});

test("buildHistoryRefinementPrompt mentions narrowing hints", () => {
  const prompt = buildHistoryRefinementPrompt("agents", 12);
  assert.match(prompt, /12/);
  assert.match(prompt, /agents/i);
  assert.match(prompt, /cancel/i);
});

test("mergeHistorySearchFilters keeps prior domain when new reply lacks one", () => {
  const merged = mergeHistorySearchFilters(
    { domain: "github" },
    { extraTerms: ["oauth"] }
  );
  assert.equal(merged.domain, "github");
  assert.deepEqual(merged.extraTerms, ["oauth"]);
});
