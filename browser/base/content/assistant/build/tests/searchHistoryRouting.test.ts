import test from "node:test";
import assert from "node:assert/strict";

import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";
import { resolveManifestSearchRoute } from "../src/utils/manifestSearchResolver.js";

const snapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set<string>(),
  stale: false,
};

test("search history for agents routes to search_history with keyword mode", () => {
  const route = decideDeterministicRoute("search history for agents", snapshot);
  assert.equal(route.type, "tool");
  if (route.type === "tool") {
    assert.equal(route.next, "search_history");
    assert.equal(route.args?.query, "agents");
    assert.equal(route.args?.mode, "keyword");
  }
});

test("search history for agents does not route to search_memory", () => {
  const route = decideDeterministicRoute("search history for agents", snapshot);
  assert.equal(route.type, "tool");
  if (route.type === "tool") {
    assert.notEqual(route.next, "search_memory");
  }
});

test("manifest search resolver extracts keyword query and mode", () => {
  const route = resolveManifestSearchRoute(
    "search my browsing history for oauth",
    snapshot
  );
  assert.ok(route);
  assert.equal(route?.type, "tool");
  if (route?.type === "tool") {
    assert.equal(route.next, "search_history");
    assert.equal(route.args?.query, "oauth");
    assert.equal(route.args?.mode, "keyword");
  }
});

test("search history alone routes to recent mode", () => {
  const route = decideDeterministicRoute("search history", snapshot);
  assert.equal(route.type, "tool");
  if (route.type === "tool") {
    assert.equal(route.next, "search_history");
    assert.equal(route.args?.query, "");
    assert.equal(route.args?.mode, "recent");
  }
});

test("quoted search history preserves phrase", () => {
  const route = decideDeterministicRoute(
    'search history for "multi word term"',
    snapshot
  );
  assert.equal(route.type, "tool");
  if (route.type === "tool") {
    assert.equal(route.args?.query, "multi word term");
    assert.equal(route.args?.mode, "keyword");
  }
});
