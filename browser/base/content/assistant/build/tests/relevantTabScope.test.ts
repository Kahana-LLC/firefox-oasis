import test from "node:test";
import assert from "node:assert/strict";

import { effectiveResearchScope } from "../src/services/relevantTabScope.js";
import { RELEVANT_AUTO_UPGRADE_THRESHOLD } from "../src/services/relevantTabConstants.js";

function mockGBrowser(tabCount: number) {
  const tabs = Array.from({ length: tabCount }, () => ({ pinned: false }));
  return {
    tabs: tabs,
    selectedTab: tabs[0],
    selectedBrowser: null,
  } as never;
}

test("effectiveResearchScope keeps explicit tab-group", () => {
  assert.equal(
    effectiveResearchScope({
      gBrowser: null,
      scope: "tab-group",
      name: "Research",
    }),
    "tab-group"
  );
});

test("effectiveResearchScope upgrades large window to relevant", () => {
  assert.equal(
    effectiveResearchScope({
      gBrowser: mockGBrowser(RELEVANT_AUTO_UPGRADE_THRESHOLD + 1),
      scope: "window",
    }),
    "relevant"
  );
});

test("effectiveResearchScope keeps small window as window", () => {
  assert.equal(
    effectiveResearchScope({
      gBrowser: mockGBrowser(5),
      scope: "window",
    }),
    "window"
  );
});
