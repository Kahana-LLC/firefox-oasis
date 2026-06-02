import test from "node:test";
import assert from "node:assert/strict";

import {
  isAmbiguousTab,
  parseOrganizeTabsClusterPlan,
  validateClusterPlan,
} from "../src/services/organizeTabsPlanUtils.js";
import type { TabCatalogEntry } from "../src/services/organizeTabsTypes.js";
import {
  shouldConfirmOrganizeTabsPlan,
  buildOrganizeTabsPreviewDescription,
} from "../src/utils/organizeTabsScopePreview.js";

test("isAmbiguousTab detects generic titles", () => {
  assert.equal(
    isAmbiguousTab({
      title: "New Tab",
      url: "https://example.com",
      domain: "example.com",
    }),
    true
  );
  assert.equal(
    isAmbiguousTab({
      title: "Detailed article about transformers",
      url: "https://example.com/a",
      domain: "example.com",
    }),
    false
  );
});

test("parseOrganizeTabsClusterPlan parses valid JSON shape", () => {
  const plan = parseOrganizeTabsClusterPlan(
    {
      mode: "single_focus",
      groups: [{ name: "LLM Research", tabIndices: [1, 3, 5] }],
      ungroupedIndices: [2],
      warnings: [],
    },
    "single_focus"
  );
  assert.ok(plan);
  assert.equal(plan?.groups.length, 1);
  assert.deepEqual(plan?.groups[0].tabIndices, [1, 3, 5]);
});

test("validateClusterPlan rejects unknown indices and pinned tabs", () => {
  const catalog: TabCatalogEntry[] = [
    {
      index: 1,
      title: "A",
      url: "https://a.com",
      domain: "a.com",
      currentGroup: null,
      pinned: false,
    },
    {
      index: 2,
      title: "B",
      url: "https://b.com",
      domain: "b.com",
      currentGroup: null,
      pinned: true,
    },
  ];
  const parsed = parseOrganizeTabsClusterPlan(
    {
      mode: "single_focus",
      groups: [{ name: "Group", tabIndices: [1, 2, 99] }],
      ungroupedIndices: [],
      warnings: [],
    },
    "single_focus"
  );
  assert.ok(parsed);
  const validated = validateClusterPlan(parsed!, catalog, 6);
  assert.equal(validated.ok, true);
  if (validated.ok) {
    assert.deepEqual(validated.plan.groups[0].tabIndices, [1]);
  }
});

test("shouldConfirmOrganizeTabsPlan when multiple groups", () => {
  assert.equal(
    shouldConfirmOrganizeTabsPlan({
      plan: {
        mode: "multi_topic",
        groups: [
          { name: "A", tabIndices: [1] },
          { name: "B", tabIndices: [2] },
        ],
        ungroupedIndices: [],
        warnings: [],
      },
      tabsMovingFromExistingGroups: 0,
      totalTabsAffected: 2,
    }),
    true
  );
});

test("buildOrganizeTabsPreviewDescription lists groups", () => {
  const text = buildOrganizeTabsPreviewDescription({
    scopeLabel: "Current window",
    plan: {
      mode: "single_focus",
      groups: [{ name: "LLM Research", tabIndices: [1, 2] }],
      ungroupedIndices: [3],
      warnings: [],
    },
    catalog: [
      {
        index: 1,
        title: "Paper A",
        url: "https://a.com",
        domain: "a.com",
        currentGroup: null,
        pinned: false,
      },
      {
        index: 2,
        title: "Paper B",
        url: "https://b.com",
        domain: "b.com",
        currentGroup: null,
        pinned: false,
      },
    ],
    tabsMovingFromExistingGroups: 0,
  });
  assert.match(text, /LLM Research/);
  assert.match(text, /Continue\?/);
});
