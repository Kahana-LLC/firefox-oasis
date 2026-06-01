import test from "node:test";
import assert from "node:assert/strict";

import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";
import { UTTERANCE_FIXTURES } from "./researchBriefUtteranceFixtures.js";

const snapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set(["ai privacy", "research", "sports"]),
  stale: false,
};

for (const fixture of UTTERANCE_FIXTURES) {
  test(`utterance: ${fixture.phrase.slice(0, 60)}`, () => {
    const route = decideDeterministicRoute(fixture.phrase, snapshot);

    if (fixture.route === "summarize_page") {
      assert.equal(route.type, "tool");
      if (route.type === "tool") {
        assert.equal(route.next, "summarize_page");
      }
      return;
    }

    if (fixture.route === "not_brief") {
      if (route.type === "tool") {
        assert.notEqual(route.next, "build_research_brief");
      }
      return;
    }

    assert.equal(route.type, "tool");
    if (route.type !== "tool") {
      return;
    }
    assert.equal(route.next, "build_research_brief");

    if (fixture.scope) {
      assert.equal(route.args?.scope, fixture.scope);
    }
    if (fixture.useActiveGroup) {
      assert.equal(route.args?.use_active_tab_group, true);
    }
    if (fixture.name) {
      assert.equal(route.args?.name, fixture.name);
    }
    if (fixture.inferTopic) {
      assert.equal(route.args?.infer_topic_from_content, true);
    }
    if (fixture.topic) {
      assert.equal(route.args?.topic, fixture.topic);
    }
  });
}
