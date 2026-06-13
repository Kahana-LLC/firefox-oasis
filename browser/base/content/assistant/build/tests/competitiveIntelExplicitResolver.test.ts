import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCompetitiveIntelIndustry,
  looksLikeCompetitiveIntelCommand,
  resolveExplicitCompetitiveIntelRoute,
} from "../src/utils/competitiveIntelExplicitResolver.js";
import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";

const emptySnapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set<string>(),
  stale: false,
};

test("looksLikeCompetitiveIntelCommand matches CI phrases", () => {
  assert.equal(
    looksLikeCompetitiveIntelCommand(
      "I want a competitive intelligence report on enterprise CRM"
    ),
    true
  );
  assert.equal(looksLikeCompetitiveIntelCommand("summarize this page"), false);
});

test("extractCompetitiveIntelIndustry parses industry", () => {
  assert.equal(
    extractCompetitiveIntelIndustry(
      "competitive intelligence report on enterprise data observability"
    ),
    "enterprise data observability"
  );
  assert.equal(
    extractCompetitiveIntelIndustry("who are the key players in fintech"),
    "fintech"
  );
});

test("resolveExplicitCompetitiveIntelRoute routes to run_competitive_intel", () => {
  const route = resolveExplicitCompetitiveIntelRoute(
    "competitive analysis of project management software"
  );
  assert.equal(route?.type, "tool");
  assert.equal(route?.next, "run_competitive_intel");
  assert.equal(
    (route?.args as { industry: string }).industry,
    "project management software"
  );
});

test("resolveExplicitCompetitiveIntelRoute routes CI tab group brief standalone", () => {
  const route = resolveExplicitCompetitiveIntelRoute(
    "competitive intelligence brief from my CI tab groups for enterprise CRM"
  );
  assert.equal(route?.type, "tool");
  assert.equal(route?.next, "build_competitive_intel_brief");
  assert.equal((route?.args as { scope: string }).scope, "ci_tab_groups");
});

test("resolveExplicitCompetitiveIntelRoute routes single CI tier group", () => {
  const route = resolveExplicitCompetitiveIntelRoute(
    "battle card from CI — High for fintech"
  );
  assert.equal(route?.type, "tool");
  assert.equal(route?.next, "build_competitive_intel_brief");
  assert.equal((route?.args as { name: string }).name, "CI — High");
});

test("decideDeterministicRoute routes CI utterance", () => {
  const route = decideDeterministicRoute(
    "I want a competitive intelligence report on enterprise CRM",
    emptySnapshot
  );
  assert.equal(route.type, "tool");
  assert.equal(route.next, "run_competitive_intel");
  assert.equal((route.args as { industry: string }).industry, "enterprise CRM");
});
