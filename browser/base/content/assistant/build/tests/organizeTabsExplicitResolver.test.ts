import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeOrganizeTabsCommand,
  resolveExplicitOrganizeTabsRoute,
} from "../src/utils/organizeTabsExplicitResolver.js";

const snapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set(["sports", "research"]),
  stale: false,
};

test("looksLikeOrganizeTabsCommand rejects create tab group", () => {
  assert.equal(
    looksLikeOrganizeTabsCommand("Create a tab group called Research"),
    false
  );
});

test("looksLikeOrganizeTabsCommand rejects research brief", () => {
  assert.equal(
    looksLikeOrganizeTabsCommand(
      "Build a research brief from tab group sports"
    ),
    false
  );
});

test("resolveExplicitOrganizeTabsRoute extracts focus and mode", () => {
  const route = resolveExplicitOrganizeTabsRoute(
    "Group all tabs related to LLM research",
    snapshot
  );
  assert.ok(route);
  assert.equal(route?.next, "organize_tabs");
  assert.equal(route?.args?.mode, "single_focus");
  assert.equal(route?.args?.focus, "LLM research");
});

test("resolveExplicitOrganizeTabsRoute handles research vs other", () => {
  const route = resolveExplicitOrganizeTabsRoute(
    "Separate my LLM research from everything else",
    snapshot
  );
  assert.ok(route);
  assert.equal(route?.args?.mode, "research_vs_other");
  assert.equal(route?.args?.focus, "LLM research");
});

test("resolveExplicitOrganizeTabsRoute handles ungrouped scope", () => {
  const route = resolveExplicitOrganizeTabsRoute(
    "Organize ungrouped tabs only",
    snapshot
  );
  assert.ok(route);
  assert.equal(route?.args?.scope, "ungrouped_only");
});
