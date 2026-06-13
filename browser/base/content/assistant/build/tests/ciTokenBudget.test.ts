import test from "node:test";
import assert from "node:assert/strict";
import type { TabDigest } from "../src/services/researchBriefTypes.js";
import {
  buildCiOverQuotaClarification,
  classifyTokenBudget,
  estimateCiTokensFromPlan,
  fitDigestsToTokenBudget,
  normalizeCiQuotaMode,
} from "../src/utils/ciTokenBudget.js";
import {
  CI_REPORT_COMPACT_SENTINEL,
  parseCompetitiveIntelWorkflowSentinel,
} from "../src/utils/competitiveIntelResume.js";
import {
  consumeCiQuotaResume,
  parseCiQuotaResumePrompt,
  setCiQuotaResume,
  clearCiQuotaResume,
} from "../src/utils/ciQuotaResume.js";
import { resolveCompetitiveIntelWorkflowGate } from "../src/assistant/supervisorGates.js";
import {
  clearCompetitiveIntelWorkflow,
  initCompetitiveIntelWorkflow,
  updateCompetitiveIntelWorkflow,
} from "../src/services/competitiveIntelWorkflow.js";

function digest(
  id: string,
  chars: number,
  tierLabel?: string
): TabDigest & { tierLabel?: string } {
  return {
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    status: "ok",
    content: "x".repeat(chars),
    keyClaims: [],
    quotes: [],
    tierLabel,
  };
}

test("classifyTokenBudget tiers", () => {
  assert.equal(classifyTokenBudget(5000, 10000), "comfortable");
  assert.equal(classifyTokenBudget(8000, 10000), "tight");
  assert.equal(classifyTokenBudget(12000, 10000), "over_budget");
  assert.equal(classifyTokenBudget(1000, 0), "over_budget");
});

test("estimateCiTokensFromPlan uses enrichment tab count", () => {
  const estimate = estimateCiTokensFromPlan([
    { companyName: "Acme", tier: "high", urls: ["https://a.com", "https://b.com"] },
    { companyName: "Beta", tier: "medium", urls: ["https://c.com"] },
  ]);
  assert.equal(estimate.tabCount, 3);
  assert.ok(estimate.min > 4000);
  assert.ok(estimate.max >= estimate.min);
});

test("fitDigestsToTokenBudget compact fits 25k remaining with 30k estimate", () => {
  const digests = [
    digest("a", 20000, "CI — High"),
    digest("b", 20000, "CI — High"),
    digest("c", 20000, "CI — Medium"),
    digest("d", 20000, "CI — Low"),
    digest("e", 20000, "CI — Adjacent"),
  ];
  const fullEstimate =
    Math.ceil(digests.reduce((sum, d) => sum + d.content.length, 0) / 4) + 4000;
  assert.ok(fullEstimate > 25000);

  const fitted = fitDigestsToTokenBudget({
    digests,
    remaining: 25000,
    mode: "compact",
  });
  const fittedEstimate =
    Math.ceil(
      fitted.digests.reduce((sum, d) => sum + d.content.length, 0) / 4
    ) + 4000;
  assert.ok(fittedEstimate <= 25000);
  assert.ok(fitted.tabCountUsed <= fitted.totalTabCount);
});

test("buildCiOverQuotaClarification includes compact and cancel options", () => {
  const { options, message } = buildCiOverQuotaClarification({
    estimate: 32000,
    remaining: 25000,
    suggestedTabCount: 8,
  });
  assert.match(message, /32,000/);
  assert.match(message, /25,000/);
  assert.equal(options.length, 4);
  assert.equal(options[0]?.id, "ci_quota_compact");
  assert.equal(options[3]?.id, "ci_quota_cancel");
});

test("normalizeCiQuotaMode", () => {
  assert.equal(normalizeCiQuotaMode("compact"), "compact");
  assert.equal(normalizeCiQuotaMode("fewer_tabs"), "fewer_tabs");
  assert.equal(normalizeCiQuotaMode("truncate"), "truncate");
  assert.equal(normalizeCiQuotaMode(undefined), "default");
  assert.equal(normalizeCiQuotaMode("invalid"), "default");
});

test("compact sentinel parses and routes quota_mode compact", () => {
  assert.equal(
    parseCompetitiveIntelWorkflowSentinel(CI_REPORT_COMPACT_SENTINEL),
    CI_REPORT_COMPACT_SENTINEL
  );
  clearCompetitiveIntelWorkflow();
  initCompetitiveIntelWorkflow({ industry: "fintech" });
  updateCompetitiveIntelWorkflow({ step: "report" });
  const gate = resolveCompetitiveIntelWorkflowGate({
    commandText: CI_REPORT_COMPACT_SENTINEL,
    confirmationText: "",
    pendingConfirmation: null,
    hasQueuedCommands: false,
  });
  assert.equal(gate.kind, "route");
  if (gate.kind === "route") {
    assert.equal(gate.args.workflow_action, CI_REPORT_COMPACT_SENTINEL);
    assert.equal(gate.args.quota_mode, "compact");
    assert.equal(gate.args.workflow_confirmed, true);
  }
  clearCompetitiveIntelWorkflow();
});

test("ci quota resume sets quota_mode from clarification option", () => {
  clearCiQuotaResume();
  setCiQuotaResume({
    command: "run_competitive_intel",
    args: {
      industry: "CRM",
      workflow_confirmed: true,
      suggested_max_tabs: 6,
    },
  });
  const compactPrompt = buildCiOverQuotaClarification({
    estimate: 30000,
    remaining: 25000,
    suggestedTabCount: 6,
  }).options[0]?.resolvedPrompt;
  assert.ok(compactPrompt);
  const optionId = parseCiQuotaResumePrompt(compactPrompt!);
  assert.equal(optionId, "ci_quota_compact");
  const args = consumeCiQuotaResume(optionId!);
  assert.equal(args?.quota_mode, "compact");
  assert.equal(args?.workflow_confirmed, true);
});
