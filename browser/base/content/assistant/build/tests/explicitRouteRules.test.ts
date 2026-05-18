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
