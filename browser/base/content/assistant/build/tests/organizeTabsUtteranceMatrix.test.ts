import test from "node:test";
import assert from "node:assert/strict";

import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";
import { ORGANIZE_UTTERANCE_FIXTURES } from "./organizeTabsUtteranceFixtures.js";

const snapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set(["ai privacy", "research", "sports"]),
  stale: false,
};

for (const fixture of ORGANIZE_UTTERANCE_FIXTURES) {
  test(`utterance: ${fixture.phrase.slice(0, 60)}`, () => {
    const route = decideDeterministicRoute(fixture.phrase, snapshot);

    if (fixture.route === "not_organize") {
      if (route.type === "tool") {
        assert.notEqual(route.next, "organize_tabs");
      }
      return;
    }

    assert.equal(route.type, "tool");
    if (route.type !== "tool") {
      return;
    }
    assert.equal(route.next, fixture.route);

    if (fixture.mode) {
      assert.equal(route.args?.mode, fixture.mode);
    }
    if (fixture.scope) {
      assert.equal(route.args?.scope, fixture.scope);
    }
    if (fixture.focus) {
      assert.equal(route.args?.focus, fixture.focus);
    }
    if (fixture.name) {
      assert.equal(route.args?.name, fixture.name);
    }
    if (fixture.useActiveGroup) {
      assert.equal(route.args?.use_active_tab_group, true);
    }
    if (fixture.excludeIndices) {
      assert.deepEqual(route.args?.exclude_indices, fixture.excludeIndices);
    }
  });
}
