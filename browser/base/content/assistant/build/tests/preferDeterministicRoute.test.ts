import test from "node:test";
import assert from "node:assert/strict";

import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";
import {
  tryPreferDeterministicToolRoute,
  tryResolveEarlyDeterministicSupervisorRoute,
} from "../src/utils/preferDeterministicRoute.js";
import { looksLikeOrganizeTabsCommand } from "../src/utils/organizeTabsUtterances.js";

const snapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set<string>(),
  stale: false,
};

test("tryPreferDeterministicToolRoute routes search history for agents as keyword", () => {
  const route = decideDeterministicRoute("search history for agents", snapshot);
  const preferred = tryPreferDeterministicToolRoute(
    "search history for agents",
    route
  );
  assert.ok(preferred);
  assert.equal(preferred?.next, "search_history");
  assert.equal(preferred?.args.query, "agents");
  assert.equal(preferred?.args.mode, "keyword");
});

test("tryPreferDeterministicToolRoute routes group tabs related to LLMs", () => {
  const phrase = "group all tabs related to LLMs";
  assert.equal(looksLikeOrganizeTabsCommand(phrase), true);
  const route = decideDeterministicRoute(phrase, snapshot);
  const preferred = tryPreferDeterministicToolRoute(phrase, route);
  assert.ok(preferred);
  assert.equal(preferred?.next, "organize_tabs");
  assert.equal(preferred?.args.mode, "single_focus");
  assert.equal(preferred?.args.focus, "LLMs");
});

test("tryPreferDeterministicToolRoute handles reltated typo", () => {
  const phrase = "group all tabs reltated to LLMs";
  assert.equal(looksLikeOrganizeTabsCommand(phrase), true);
  const route = decideDeterministicRoute(phrase, snapshot);
  const preferred = tryPreferDeterministicToolRoute(phrase, route);
  assert.ok(preferred);
  assert.equal(preferred?.next, "organize_tabs");
  assert.equal(preferred?.args.focus, "LLMs");
});

test("tryPreferDeterministicToolRoute enriches focus from polite phrasing", () => {
  const phrase = "can you group tabs about OAuth?";
  const route = {
    type: "tool" as const,
    next: "organize_tabs",
    args: { mode: "multi_topic", scope: "window" },
    reason: "explicit-organize-tabs",
  };
  const preferred = tryPreferDeterministicToolRoute(phrase, route);
  assert.ok(preferred);
  assert.equal(preferred?.args.mode, "single_focus");
  assert.equal(preferred?.args.focus, "OAuth");
});

test("tryPreferDeterministicToolRoute bypasses assist for research brief", () => {
  const phrase = "create a research brief based on tab group sports";
  const route = decideDeterministicRoute(phrase, snapshot);
  const preferred = tryPreferDeterministicToolRoute(phrase, route);
  assert.ok(preferred);
  assert.equal(preferred?.next, "build_research_brief");
  assert.equal(preferred?.args.name, "sports");
});

test("tryResolveEarlyDeterministicSupervisorRoute routes build on this tab group", () => {
  const phrase = "build a research brief on this tab group";
  const route = decideDeterministicRoute(phrase, snapshot);
  const resolved = tryResolveEarlyDeterministicSupervisorRoute(phrase, route);
  assert.ok(resolved);
  assert.equal(resolved?.next, "build_research_brief");
  assert.equal(resolved?.args.use_active_tab_group, true);
});
