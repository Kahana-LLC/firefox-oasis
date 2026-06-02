import test from "node:test";
import assert from "node:assert/strict";

import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";

const snapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set(["sports"]),
  stale: false,
};

test("organize tabs routes before organize windows disambiguation", () => {
  const tabsRoute = decideDeterministicRoute("organize my tabs", snapshot);
  assert.equal(tabsRoute.type, "tool");
  if (tabsRoute.type === "tool") {
    assert.equal(tabsRoute.next, "organize_tabs");
  }

  const windowsRoute = decideDeterministicRoute("organize windows", snapshot);
  assert.equal(windowsRoute.type, "tool");
  if (windowsRoute.type === "tool") {
    assert.equal(windowsRoute.next, "organize_windows");
  }
});

test("group LLM research phrase routes to organize_tabs", () => {
  const route = decideDeterministicRoute(
    "Group all tabs related to LLM research",
    snapshot
  );
  assert.equal(route.type, "tool");
  if (route.type === "tool") {
    assert.equal(route.next, "organize_tabs");
    assert.equal(route.args?.focus, "LLM research");
  }
});
