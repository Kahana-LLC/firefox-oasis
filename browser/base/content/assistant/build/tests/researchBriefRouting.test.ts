import test from "node:test";
import assert from "node:assert/strict";

import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";

const snapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set(["ai privacy", "research", "sports"]),
  stale: false,
};

test("research brief routes to build_research_brief with topic and group", () => {
  const phrase =
    "Build a research brief on AI privacy tools from tab group AI Privacy";
  const route = decideDeterministicRoute(phrase, snapshot);
  assert.equal(route.type, "tool");
  if (route.type !== "tool") {
    return;
  }
  assert.equal(route.next, "build_research_brief");
  assert.equal(route.args?.topic, "AI privacy tools");
  assert.equal(route.args?.scope, "tab-group");
  assert.equal(route.args?.name, "AI Privacy");
});

test("research brief with except tabs routes exclude_indices", () => {
  const phrase =
    "Build a research brief on AI privacy tools from tab group AI Privacy except tabs 2 and 3";
  const route = decideDeterministicRoute(phrase, snapshot);
  assert.equal(route.type, "tool");
  if (route.type !== "tool") {
    return;
  }
  assert.equal(route.next, "build_research_brief");
  assert.deepEqual(route.args?.exclude_indices, [2, 3]);
});

test("research brief with except keywords routes exclude_queries", () => {
  const phrase =
    "research brief on AI privacy from tab group Research except Wikipedia and NYT";
  const route = decideDeterministicRoute(phrase, snapshot);
  assert.equal(route.type, "tool");
  if (route.type !== "tool") {
    return;
  }
  assert.equal(route.next, "build_research_brief");
  const queries = route.args?.exclude_queries as string[];
  assert.ok(Array.isArray(queries));
  assert.ok(queries.some(q => /wikipedia/i.test(q)));
  assert.ok(queries.some(q => /nyt/i.test(q)));
});

test("summarize all tabs does not hijack research brief route", () => {
  const route = decideDeterministicRoute("summarize all my tabs", snapshot);
  if (route.type === "tool") {
    assert.notEqual(route.next, "build_research_brief");
  }
});

test("create research brief based on tab group sports routes deterministically", () => {
  const route = decideDeterministicRoute(
    "create a research brief based on tab group sports",
    snapshot
  );
  assert.equal(route.type, "tool");
  if (route.type !== "tool") {
    return;
  }
  assert.equal(route.next, "build_research_brief");
  assert.equal(route.args?.infer_topic_from_content, true);
  assert.equal(route.args?.name, "sports");
});

test("research brief from tab group sports without topic", () => {
  const route = decideDeterministicRoute(
    "research brief from tab group sports",
    snapshot
  );
  assert.equal(route.type, "tool");
  if (route.type !== "tool") {
    return;
  }
  assert.equal(route.next, "build_research_brief");
  assert.equal(route.args?.infer_topic_from_content, true);
});

test("research brief from named tabs routes to tabs scope", () => {
  const route = decideDeterministicRoute(
    "research brief from tabs ESPN, NFL",
    snapshot
  );
  assert.equal(route.type, "tool");
  if (route.type !== "tool") {
    return;
  }
  assert.equal(route.next, "build_research_brief");
  assert.equal(route.args?.scope, "tabs");
  const queries = route.args?.tab_queries as string[];
  assert.ok(Array.isArray(queries));
  assert.ok(queries.some(q => /espn/i.test(q)));
});

test("summarize tabs in sports group routes to research brief", () => {
  const route = decideDeterministicRoute("summarize tabs in sports group", snapshot);
  assert.equal(route.type, "tool");
  if (route.type !== "tool") {
    return;
  }
  assert.equal(route.next, "build_research_brief");
  assert.equal(route.args?.name, "sports");
  assert.equal(route.args?.infer_topic_from_content, true);
});

test("create tab group does not route to research brief", () => {
  const route = decideDeterministicRoute("create a tab group sports", snapshot);
  if (route.type === "tool") {
    assert.notEqual(route.next, "build_research_brief");
  }
});

test("single-page summarize still uses summarize_page", () => {
  const route = decideDeterministicRoute("summarize this page", snapshot);
  assert.equal(route.type, "tool");
  if (route.type !== "tool") {
    return;
  }
  assert.equal(route.next, "summarize_page");
});
