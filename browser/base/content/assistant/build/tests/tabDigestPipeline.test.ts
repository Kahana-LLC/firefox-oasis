import test from "node:test";
import assert from "node:assert/strict";
import type { TabDigest } from "../src/services/researchBriefTypes.js";
import {
  applyQuotaBudget,
} from "../src/services/tabDigestPipeline.js";

function digest(id: string, chars: number): TabDigest {
  return {
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    status: "ok",
    content: "x".repeat(chars),
    keyClaims: [],
    quotes: [],
  };
}

test("applyQuotaBudget research_brief fewer_tabs halves readable set", () => {
  const digests = [digest("a", 1000), digest("b", 1000), digest("c", 1000), digest("d", 1000)];
  const readable = digests;
  const budget = applyQuotaBudget({
    digests,
    readable,
    quotaMode: "fewer_tabs",
    profile: "research_brief",
    remaining: 50000,
  });
  assert.equal(budget.digests.length, 2);
});

test("applyQuotaBudget competitive_intel compact returns fitted digests", () => {
  const digests = [
    digest("a", 20000),
    digest("b", 20000),
    digest("c", 20000),
    digest("d", 20000),
  ];
  const budget = applyQuotaBudget({
    digests,
    readable: digests,
    quotaMode: "compact",
    profile: "competitive_intel",
    remaining: 25000,
  });
  assert.ok(budget.digests.length <= digests.length);
  assert.ok(budget.estimate > 0);
});
