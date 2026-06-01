import test from "node:test";
import assert from "node:assert/strict";

import { splitResearchBriefExcludeClause } from "../src/utils/researchBriefExplicitResolver.js";
import {
  buildScopeLabelWithExclusions,
  filterExcludedTabs as filterTabs,
  tabMatchesExcludeQuery,
} from "../src/services/researchBriefScope.js";

const tabs = [
  { title: "Wikipedia", url: "https://en.wikipedia.org/wiki/Privacy" },
  { title: "NYT Article", url: "https://nytimes.com/privacy" },
  { title: "CNN Home", url: "https://cnn.com/" },
  { title: "Docs", url: "https://example.com/docs" },
  { title: "AB", url: "https://ab.test" },
];

test("filterExcludedTabs by 1-based indices", () => {
  const result = filterTabs(tabs, { excludeIndices: [2, 4] });
  assert.equal(result.tabs.length, 3);
  assert.equal(result.tabs[0]?.title, "Wikipedia");
  assert.equal(result.tabs[1]?.title, "CNN Home");
  assert.equal(result.excludedCount, 2);
});

test("filterExcludedTabs by title/url queries", () => {
  const result = filterTabs(tabs, { excludeQueries: ["Wikipedia", "cnn.com"] });
  assert.equal(result.tabs.length, 3);
  assert.equal(result.excludedCount, 2);
});

test("exclude queries shorter than 3 chars are ignored", () => {
  const result = filterTabs(tabs, { excludeQueries: ["AB", "NYT"] });
  assert.equal(result.tabs.length, 4);
  assert.equal(result.excludedCount, 1);
});

test("tabMatchesExcludeQuery is case insensitive", () => {
  assert.equal(
    tabMatchesExcludeQuery(
      { title: "Privacy Guide", url: "https://x.test" },
      "privacy"
    ),
    true
  );
});

test("buildScopeLabelWithExclusions formats label", () => {
  assert.equal(
    buildScopeLabelWithExclusions("Tab group: Research", 8, 2),
    "Tab group: Research (8 tabs, excluded 2)"
  );
});

test("splitResearchBriefExcludeClause parses tab indices", () => {
  const parsed = splitResearchBriefExcludeClause(
    "research brief on AI privacy from tab group Research except tabs 2 and 4"
  );
  assert.match(parsed.body, /tab group Research$/i);
  assert.deepEqual(parsed.excludeIndices, [2, 4]);
  assert.deepEqual(parsed.excludeQueries, []);
});

test("splitResearchBriefExcludeClause parses keyword exclusions", () => {
  const parsed = splitResearchBriefExcludeClause(
    "Build a research brief on AI privacy from tab group Research except Wikipedia and NYT"
  );
  assert.match(parsed.body, /tab group Research$/i);
  assert.deepEqual(parsed.excludeIndices, []);
  assert.ok(parsed.excludeQueries.includes("Wikipedia"));
  assert.ok(parsed.excludeQueries.includes("NYT"));
});
