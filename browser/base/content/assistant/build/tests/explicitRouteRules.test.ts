import test from "node:test";
import assert from "node:assert/strict";
import { resolveExplicitRoute } from "../src/utils/explicitRouteRules.js";
import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";

const emptySnapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set<string>(),
  stale: false,
};

test("resolveExplicitRoute: open youtube in a new tab -> open_url", () => {
  const r = resolveExplicitRoute("open youtube in a new tab");
  assert.equal(r?.type, "tool");
  assert.equal(r?.next, "open_url");
  assert.equal((r?.args as { url: string }).url, "https://www.youtube.com");
});

test("resolveExplicitRoute: typo youtub -> open_url", () => {
  const r = resolveExplicitRoute("open youtub in a new tab");
  assert.equal(r?.type, "tool");
  assert.equal(r?.next, "open_url");
  assert.equal((r?.args as { url: string }).url, "https://www.youtube.com");
});

test("resolveExplicitRoute: https URL in new tab phrase -> open_url", () => {
  const r = resolveExplicitRoute("open https://example.com in a new tab");
  assert.equal(r?.type, "tool");
  assert.equal(r?.next, "open_url");
  assert.equal((r?.args as { url: string }).url, "https://example.com");
});

test("resolveExplicitRoute: unknown site -> web_search", () => {
  const r = resolveExplicitRoute("open zebra site in a new tab");
  assert.equal(r?.type, "tool");
  assert.equal(r?.next, "web_search");
  assert.equal((r?.args as { query: string }).query, "zebra site");
});

test("resolveExplicitRoute: show subscription unchanged", () => {
  const r = resolveExplicitRoute("show subscription");
  assert.equal(r?.type, "tool");
  assert.equal(r?.next, "show_subscription");
});

test("resolveExplicitRoute: open a new tab (no URL) -> new_tab_to_right", () => {
  for (const phrase of [
    "open a new tab",
    "Open a new tab.",
    "open new tab",
    "new tab",
    "create a new tab please",
  ]) {
    const r = resolveExplicitRoute(phrase);
    assert.equal(r?.type, "tool", phrase);
    assert.equal(r?.next, "new_tab_to_right", phrase);
    assert.deepEqual(r?.args, {}, phrase);
  }
});

test("resolveExplicitRoute: open a new tab group does not match blank-tab rule", () => {
  const r = resolveExplicitRoute("open a new tab group called Videos");
  assert.notEqual(r?.next, "new_tab_to_right");
});

test("decideDeterministicRoute: open YouTube in a new tab (cased, period)", () => {
  const d = decideDeterministicRoute(
    "Open YouTube in a new tab.",
    emptySnapshot
  );
  assert.equal(d.type, "tool");
  assert.equal(d.next, "open_url");
  assert.equal((d.args as { url: string }).url, "https://www.youtube.com");
});

test("decideDeterministicRoute: visit github in a new tab", () => {
  const d = decideDeterministicRoute(
    "visit github in a new tab",
    emptySnapshot
  );
  assert.equal(d.type, "tool");
  assert.equal(d.next, "open_url");
  assert.equal((d.args as { url: string }).url, "https://github.com");
});

test("decideDeterministicRoute: open a new tab -> new_tab_to_right", () => {
  const d = decideDeterministicRoute("open a new tab", emptySnapshot);
  assert.equal(d.type, "tool");
  assert.equal(d.next, "new_tab_to_right");
});

test("decideDeterministicRoute: factual question -> web_search", () => {
  const d = decideDeterministicRoute(
    "who is the president of the US",
    emptySnapshot
  );
  assert.equal(d.type, "tool");
  assert.equal(d.next, "web_search");
});

test("decideDeterministicRoute: watch highlights -> play_video", () => {
  const d = decideDeterministicRoute(
    "i want to watch the nba highlights from last night",
    emptySnapshot
  );
  assert.equal(d.type, "tool");
  assert.equal(d.next, "play_video");
});

test("decideDeterministicRoute: site search on github -> open_url", () => {
  const d = decideDeterministicRoute(
    "find react hooks on github",
    emptySnapshot
  );
  assert.equal(d.type, "tool");
  assert.equal(d.next, "open_url");
  assert.ok((d.args as { url: string }).url.includes("github.com/search"));
});

test("decideDeterministicRoute: remove duplicate tabs -> close_duplicate_tabs", () => {
  const d = decideDeterministicRoute(
    "remove any duplicate tabs",
    emptySnapshot
  );
  assert.equal(d.type, "tool");
  assert.equal(d.next, "close_duplicate_tabs");
});

test("decideDeterministicRoute: compound summarize+close defers whole string", () => {
  const d = decideDeterministicRoute(
    "summarize this page after that close the tab",
    emptySnapshot
  );
  assert.equal(d.type, "no_match");
});

test("decideDeterministicRoute: close shopping tabs by query", () => {
  const d = decideDeterministicRoute("close the shopping tabs", emptySnapshot);
  assert.equal(d.type, "tool");
  assert.equal(d.next, "close_tab");
  assert.equal((d.args as { query: string }).query, "shopping");
});

test("decideDeterministicRoute: open my email tab focuses tab", () => {
  const d = decideDeterministicRoute("open my email tab", emptySnapshot);
  assert.equal(d.type, "tool");
  assert.equal(d.next, "focus_tab");
});

test("decideDeterministicRoute: open my email focuses email tab category", () => {
  const d = decideDeterministicRoute("open my email", emptySnapshot);
  assert.equal(d.type, "tool");
  assert.equal(d.next, "focus_tab");
  assert.equal((d.args as { query: string }).query, "email");
});

test("decideDeterministicRoute: gmail focuses existing gmail tab", () => {
  const d = decideDeterministicRoute("gmail", emptySnapshot);
  assert.equal(d.type, "tool");
  assert.equal(d.next, "focus_tab");
  assert.equal((d.args as { query: string }).query, "gmail");
});
