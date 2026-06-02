import test from "node:test";
import assert from "node:assert/strict";

import {
  extractOrganizeTabsFocus,
  looksLikeOrganizeTabsCommand,
  normalizeOrganizeTabsInput,
  prepareOrganizeTabsCommandBody,
} from "../src/utils/organizeTabsQuery.js";
import { resolveExplicitOrganizeTabsRoute } from "../src/utils/organizeTabsExplicitResolver.js";

const snapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set<string>(),
  stale: false,
};

test("normalizeOrganizeTabsInput fixes common typos", () => {
  assert.equal(
    normalizeOrganizeTabsInput("group all tabs reltated to LLMs"),
    "group all tabs related to LLMs"
  );
  assert.equal(
    normalizeOrganizeTabsInput("organise my tabs"),
    "organize my tabs"
  );
});

test("prepareOrganizeTabsCommandBody strips conversational wrappers", () => {
  assert.equal(
    prepareOrganizeTabsCommandBody("can you group tabs about OAuth?"),
    "group tabs about OAuth"
  );
  assert.equal(
    prepareOrganizeTabsCommandBody("please organize my open tabs by topic"),
    "organize my open tabs by topic"
  );
});

test("extractOrganizeTabsFocus finds topic after polite prefix", () => {
  assert.equal(
    extractOrganizeTabsFocus("can you group all tabs related to LLMs?"),
    "LLMs"
  );
  assert.equal(
    extractOrganizeTabsFocus('group tabs related to "machine learning"'),
    "machine learning"
  );
});

test("looksLikeOrganizeTabsCommand accepts new phrasing", () => {
  assert.equal(
    looksLikeOrganizeTabsCommand("can you group all tabs related to LLMs?"),
    true
  );
  assert.equal(
    looksLikeOrganizeTabsCommand("put all my LLM tabs together"),
    true
  );
  assert.equal(
    looksLikeOrganizeTabsCommand("categorize tabs about React"),
    true
  );
});

test("resolveExplicitOrganizeTabsRoute extracts focus from polite phrasing", () => {
  const route = resolveExplicitOrganizeTabsRoute(
    "can you group all tabs related to LLMs?",
    snapshot
  );
  assert.ok(route);
  assert.equal(route?.args?.mode, "single_focus");
  assert.equal(route?.args?.focus, "LLMs");
});

test("resolveExplicitOrganizeTabsRoute handles reltated typo", () => {
  const route = resolveExplicitOrganizeTabsRoute(
    "group all tabs reltated to LLMs",
    snapshot
  );
  assert.ok(route);
  assert.equal(route?.args?.mode, "single_focus");
  assert.equal(route?.args?.focus, "LLMs");
});

test("resolveExplicitOrganizeTabsRoute keeps multi_topic without focus", () => {
  const route = resolveExplicitOrganizeTabsRoute(
    "Organize my open tabs by topic",
    snapshot
  );
  assert.ok(route);
  assert.equal(route?.args?.mode, "multi_topic");
  assert.equal(route?.args?.focus, undefined);
});
