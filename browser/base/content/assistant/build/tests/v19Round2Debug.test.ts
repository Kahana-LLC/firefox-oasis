import test from "node:test";
import assert from "node:assert/strict";

import { splitCommandChain } from "../src/assistant/commandChain.js";
import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";
import { resolveExplicitMutationRoute } from "../src/utils/mutationExplicitResolver.js";

const snap = {
  folderNames: new Set<string>(),
  groupNames: new Set<string>(),
  stale: false,
};

test("compound summarize+close splits and does not route whole string to close_tab", () => {
  const input = "summarize this page after that close the tab";
  const chain = splitCommandChain(input);
  assert.equal(chain.commands.length, 2);
  assert.equal(chain.commands[0], "summarize this page");

  const mutation = resolveExplicitMutationRoute(input);
  assert.notEqual(mutation?.next, "close_tab", "substring close_tab match");

  const wholeRoute = decideDeterministicRoute(input, snap);
  if (wholeRoute.type === "tool") {
    assert.notEqual(wholeRoute.next, "close_tab");
  }

  const first = decideDeterministicRoute(chain.commands[0], snap);
  assert.equal(first.type, "tool");
  assert.equal(first.next, "summarize_page");
});

test("close shopping tabs routes to close_tab with query", () => {
  const route = decideDeterministicRoute("close the shopping tabs", snap);
  assert.equal(route.type, "tool");
  assert.equal(route.next, "close_tab");
  assert.equal((route.args as { query: string }).query, "shopping");
});

test("open my email tab routes to focus_tab", () => {
  const route = decideDeterministicRoute("open my email tab", snap);
  assert.equal(route.type, "tool");
  assert.equal(route.next, "focus_tab");
  assert.equal((route.args as { query: string }).query, "email");
});

test("compound shopping and email splits", () => {
  const chain = splitCommandChain("close the shopping tabs, open my email tab");
  assert.equal(chain.commands.length, 2);
  const first = decideDeterministicRoute(chain.commands[0], snap);
  const second = decideDeterministicRoute(chain.commands[1], snap);
  assert.equal(first.next, "close_tab");
  assert.equal(second.next, "focus_tab");
});
