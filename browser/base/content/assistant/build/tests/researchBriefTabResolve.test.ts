import test from "node:test";
import assert from "node:assert/strict";

import {
  isIndicesOnlyClause,
  parseTabIndicesFromClause,
  parseTabQueryList,
  resolveTabsScope,
} from "../src/services/researchBriefTabResolve.js";
import type { BrowserTabLike, GBrowserLike } from "../src/types/runtime.js";

function mockTab(label: string, url: string): BrowserTabLike {
  return {
    label,
    linkedBrowser: {
      currentURI: { spec: url },
      contentTitle: label,
    },
  };
}

function mockGBrowser(tabs: BrowserTabLike[]): GBrowserLike {
  return { tabs };
}

test("parseTabQueryList splits comma and and", () => {
  assert.deepEqual(parseTabQueryList("ESPN, Bleacher Report and NFL.com"), [
    "ESPN",
    "Bleacher Report",
    "NFL.com",
  ]);
});

test("parseTabIndicesFromClause extracts unique indices", () => {
  assert.deepEqual(parseTabIndicesFromClause("2, 3, and 5"), [2, 3, 5]);
});

test("isIndicesOnlyClause", () => {
  assert.equal(isIndicesOnlyClause("2, 3 and 5"), true);
  assert.equal(isIndicesOnlyClause("ESPN"), false);
});

test("resolveTabsScope unions queries and indices", () => {
  const tabs = [
    mockTab("Home", "https://example.com"),
    mockTab("ESPN scores", "https://espn.com/nfl"),
    mockTab("Privacy law overview", "https://law.example/privacy"),
  ];
  const result = resolveTabsScope(
    mockGBrowser(tabs),
    ["espn"],
    [1],
    10,
    {}
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.tabs.length, 2);
  assert.match(result.scopeLabel, /Tabs:/i);
});

test("resolveTabsScope caps tabs over max", () => {
  const tabs = Array.from({ length: 12 }, (_, i) =>
    mockTab(`Article ${i} about sports`, `https://news.example/${i}`)
  );
  const result = resolveTabsScope(mockGBrowser(tabs), ["sports"], [], 10, {});
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.tabs.length, 10);
  assert.ok(result.tabsOmittedByLimit >= 2);
});

test("resolveTabsScope errors when no matches", () => {
  const result = resolveTabsScope(
    mockGBrowser([mockTab("Only tab", "https://a.com")]),
    ["zzznomatch"],
    [],
    10,
    {}
  );
  assert.equal(result.ok, false);
});
