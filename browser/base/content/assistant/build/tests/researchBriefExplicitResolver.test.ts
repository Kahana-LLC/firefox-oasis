import test from "node:test";
import assert from "node:assert/strict";

import {
  finalizeResearchBriefArgs,
  isObviousResearchBriefRequest,
  looksLikeResearchBriefCommand,
  normalizeResearchBriefInput,
  resolveExplicitResearchBriefRoute,
} from "../src/utils/researchBriefExplicitResolver.js";
import type { RoutingStateSnapshot } from "../src/utils/routerTypes.js";

const snapshot: RoutingStateSnapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set(["ai privacy", "research", "sports", "github"]),
  stale: false,
};

function assertBriefRoute(
  phrase: string,
  expected: {
    topic?: string | null;
    name?: string;
    scope?: string;
    inferTopic?: boolean;
    tab_queries?: string[];
    tab_indices?: number[];
  }
) {
  const route = resolveExplicitResearchBriefRoute(phrase, snapshot);
  assert.equal(route?.type, "tool");
  if (route?.type !== "tool") {
    return;
  }
  assert.equal(route.next, "build_research_brief");
  if (expected.inferTopic) {
    assert.equal(route.args?.infer_topic_from_content, true);
    if (expected.topic) {
      assert.equal(route.args?.topic, expected.topic);
    } else {
      assert.ok(!route.args?.topic);
    }
  } else if (expected.topic !== undefined) {
    assert.equal(route.args?.topic, expected.topic);
  }
  if (expected.name !== undefined) {
    assert.equal(route.args?.name, expected.name);
  }
  if (expected.scope !== undefined) {
    assert.equal(route.args?.scope, expected.scope);
  }
  if (expected.tab_queries !== undefined) {
    assert.deepEqual(route.args?.tab_queries, expected.tab_queries);
  }
  if (expected.tab_indices !== undefined) {
    assert.deepEqual(route.args?.tab_indices, expected.tab_indices);
  }
}

test("normalizeResearchBriefInput fixes researhc typo", () => {
  assert.equal(
    normalizeResearchBriefInput(
      "create a researhc brief from tab group sports"
    ),
    "create a research brief from tab group sports"
  );
});

test("create research brief based on tab group sports infers topic", () => {
  assertBriefRoute("create a research brief based on tab group sports", {
    inferTopic: true,
    name: "sports",
    scope: "tab-group",
  });
});

test("research brief from tab group sports without explicit topic infers", () => {
  assertBriefRoute("research brief from tab group sports", {
    inferTopic: true,
    name: "sports",
    scope: "tab-group",
  });
});

test("research brief for tab group sports infers topic", () => {
  assertBriefRoute("research brief for tab group sports", {
    inferTopic: true,
    name: "sports",
    scope: "tab-group",
  });
});

test("research brief on sports from tab group sports infers topic", () => {
  assertBriefRoute(
    "create a new document for a research brief on sports from tab group sports",
    { inferTopic: true, name: "sports", scope: "tab-group" }
  );
});

test("research brief on college football from tab group sports uses explicit topic", () => {
  assertBriefRoute(
    "Build a research brief on college football recruiting from tab group sports",
    {
      topic: "college football recruiting",
      name: "sports",
      scope: "tab-group",
    }
  );
});

test("research brief on AI privacy tools from tab group AI Privacy", () => {
  assertBriefRoute(
    "Build a research brief on AI privacy tools from tab group AI Privacy",
    {
      topic: "AI privacy tools",
      name: "AI Privacy",
      scope: "tab-group",
    }
  );
});

test("research brief on sports infers tab group from snapshot", () => {
  assertBriefRoute("research brief on sports", {
    inferTopic: true,
    name: "sports",
    scope: "tab-group",
  });
});

test("research brief from tabs list", () => {
  assertBriefRoute("research brief from tabs ESPN, Bleacher Report", {
    scope: "tabs",
    inferTopic: true,
    tab_queries: ["ESPN", "Bleacher Report"],
  });
});

test("research brief from tab titled", () => {
  assertBriefRoute('research brief from tab titled "NFL draft grades"', {
    scope: "tabs",
    inferTopic: true,
    tab_queries: ["NFL draft grades"],
  });
});

test("research brief from tabs 2, 3, and 5", () => {
  assertBriefRoute("research brief from tabs 2, 3, and 5", {
    scope: "tabs",
    inferTopic: true,
    tab_indices: [2, 3, 5],
  });
});

test("research brief on GDPR from tabs privacy law, EU regulation", () => {
  assertBriefRoute(
    "research brief on GDPR from tabs privacy law, EU regulation",
    {
      topic: "GDPR",
      scope: "tabs",
      tab_queries: ["privacy law", "EU regulation"],
    }
  );
});

test("finalizeResearchBriefArgs infers topic for short group name only", () => {
  const args = finalizeResearchBriefArgs(
    { scope: "tab-group", name: "sports" },
    snapshot
  );
  assert.equal(args?.infer_topic_from_content, true);
  assert.ok(!args?.topic);
  assert.equal(args?.name, "sports");
});

test("create a brief based on this tab group routes to active group", () => {
  const route = resolveExplicitResearchBriefRoute(
    "create a brief based on this tab group",
    snapshot
  );
  assert.equal(route?.type, "tool");
  if (route?.type === "tool") {
    assert.equal(route.next, "build_research_brief");
    assert.equal(route.args?.use_active_tab_group, true);
    assert.equal(route.args?.infer_topic_from_content, true);
  }
});

test("build a research brief on this tab group routes to active group", () => {
  const route = resolveExplicitResearchBriefRoute(
    "build a research brief on this tab group",
    snapshot
  );
  assert.equal(route?.type, "tool");
  if (route?.type === "tool") {
    assert.equal(route.next, "build_research_brief");
    assert.equal(route.args?.use_active_tab_group, true);
    assert.equal(route.args?.infer_topic_from_content, true);
  }
});

test("create a research brief based on the github tab group", () => {
  assertBriefRoute("create a research brief based on the github tab group", {
    inferTopic: true,
    name: "github",
    scope: "tab-group",
  });
});

test("looksLikeResearchBriefCommand accepts brief without research keyword", () => {
  assert.equal(
    looksLikeResearchBriefCommand("create a brief based on this tab group"),
    true
  );
});

test("active tab group phrasing skips meta clarification", () => {
  assert.equal(
    isObviousResearchBriefRequest("create a brief based on this tab group"),
    true
  );
  assert.equal(
    isObviousResearchBriefRequest("research brief from this group"),
    true
  );
  assert.equal(
    isObviousResearchBriefRequest("build a research brief from my tab group"),
    true
  );
  assert.equal(
    isObviousResearchBriefRequest("research brief from current tab group"),
    true
  );
});

test("summarize tabs in sports group routes via explicit resolver", () => {
  const route = resolveExplicitResearchBriefRoute(
    "summarize tabs in sports group",
    snapshot
  );
  assert.equal(route?.type, "tool");
  if (route?.type === "tool") {
    assert.equal(route.next, "build_research_brief");
    assert.equal(route.args?.name, "sports");
  }
});

test("consolidate findings from this tab group routes", () => {
  const route = resolveExplicitResearchBriefRoute(
    "consolidate findings from this tab group",
    snapshot
  );
  assert.equal(route?.type, "tool");
  if (route?.type === "tool") {
    assert.equal(route.next, "build_research_brief");
    assert.equal(route.args?.use_active_tab_group, true);
  }
});

test("create a summary of these tabs routes to window scope", () => {
  assertBriefRoute("create a summary of these tabs", {
    scope: "window",
    inferTopic: true,
  });
});

test("create a summary of this tab group routes to active group", () => {
  const route = resolveExplicitResearchBriefRoute(
    "create a summary of this tab group",
    snapshot
  );
  assert.equal(route?.type, "tool");
  if (route?.type === "tool") {
    assert.equal(route.next, "build_research_brief");
    assert.equal(route.args?.use_active_tab_group, true);
    assert.equal(route.args?.infer_topic_from_content, true);
  }
});

test("looksLikeResearchBriefCommand accepts summary of this tab group", () => {
  assert.equal(
    looksLikeResearchBriefCommand("create a summary of this tab group"),
    true
  );
});

test("create a summary of tabs related to llms routes by topic", () => {
  assertBriefRoute("create a summary of the tabs related to llms", {
    scope: "relevant",
    topic: "llms",
    inferTopic: true,
  });
});

test("summarize tabs about oauth routes by topic", () => {
  assertBriefRoute("summarize tabs about oauth", {
    scope: "relevant",
    topic: "oauth",
    inferTopic: true,
  });
});

test("consolidate tabs related to machine learning routes by topic", () => {
  assertBriefRoute("consolidate tabs related to machine learning", {
    scope: "relevant",
    topic: "machine learning",
    inferTopic: true,
  });
});

test("create a summary of tabs related to software routes semantically", () => {
  assertBriefRoute("create a summary of tabs related to software", {
    scope: "relevant",
    topic: "software",
    inferTopic: true,
  });
});

test("unrelated commands do not route", () => {
  assert.equal(
    resolveExplicitResearchBriefRoute("create a tab group sports", snapshot),
    null
  );
});
