import test from "node:test";
import assert from "node:assert/strict";
import {
  clearCompetitiveIntelWorkflow,
  getCompetitiveIntelWorkflow,
  initCompetitiveIntelWorkflow,
  updateCompetitiveIntelWorkflow,
} from "../src/services/competitiveIntelWorkflow.js";
import {
  CI_REPORT_COMPACT_SENTINEL,
  CI_WORKFLOW_CANCEL_SENTINEL,
  CI_WORKFLOW_CONTINUE_SENTINEL,
  isCompetitiveIntelCancelText,
  isCompetitiveIntelContinueText,
  isCompetitiveIntelExpandExternalAiText,
  isCompetitiveIntelReviewDeepenText,
  isCompetitiveIntelRegenerateReportText,
  parseCompetitiveIntelWorkflowSentinel,
} from "../src/utils/competitiveIntelResume.js";
import { resolveCompetitiveIntelWorkflowGate } from "../src/assistant/supervisorGates.js";
import { resolvePendingConfirmationGate } from "../src/assistant/supervisorGates.js";

test("workflow init sets oasis_first enrichment profile", () => {
  clearCompetitiveIntelWorkflow();
  const workflow = initCompetitiveIntelWorkflow({
    industry: "enterprise CRM",
  });
  assert.equal(workflow.enrichmentProfile, "oasis_first");
  clearCompetitiveIntelWorkflow();
});

test("workflow init and step transitions", () => {
  clearCompetitiveIntelWorkflow();
  const workflow = initCompetitiveIntelWorkflow({
    industry: "enterprise CRM",
    focus: "mid-market",
  });
  assert.equal(workflow.step, "intro");
  assert.match(workflow.discoveryQuery, /enterprise CRM/i);
  updateCompetitiveIntelWorkflow({ step: "discovery" });
  assert.equal(getCompetitiveIntelWorkflow()?.step, "discovery");
  clearCompetitiveIntelWorkflow();
  assert.equal(getCompetitiveIntelWorkflow(), null);
});

test("resume sentinels and continue/cancel text", () => {
  assert.equal(
    parseCompetitiveIntelWorkflowSentinel(CI_WORKFLOW_CONTINUE_SENTINEL),
    CI_WORKFLOW_CONTINUE_SENTINEL
  );
  assert.equal(
    parseCompetitiveIntelWorkflowSentinel(CI_REPORT_COMPACT_SENTINEL),
    CI_REPORT_COMPACT_SENTINEL
  );
  assert.equal(isCompetitiveIntelContinueText("continue"), true);
  assert.equal(isCompetitiveIntelContinueText("I've run the queries"), true);
  assert.equal(isCompetitiveIntelCancelText("cancel competitive intel"), true);
});

test("supervisor gate routes continue during active workflow", () => {
  clearCompetitiveIntelWorkflow();
  initCompetitiveIntelWorkflow({ industry: "fintech" });
  const gate = resolveCompetitiveIntelWorkflowGate({
    commandText: "continue",
    confirmationText: "",
    pendingConfirmation: null,
    hasQueuedCommands: false,
  });
  assert.equal(gate.kind, "route");
  if (gate.kind === "route") {
    assert.equal(gate.args.workflow_confirmed, true);
    assert.equal(gate.args.industry, "fintech");
  }
  clearCompetitiveIntelWorkflow();
});

test("supervisor gate routes cancel sentinel", () => {
  clearCompetitiveIntelWorkflow();
  initCompetitiveIntelWorkflow({ industry: "cybersecurity" });
  const gate = resolveCompetitiveIntelWorkflowGate({
    commandText: CI_WORKFLOW_CANCEL_SENTINEL,
    confirmationText: "",
    pendingConfirmation: null,
    hasQueuedCommands: false,
  });
  assert.equal(gate.kind, "route");
  if (gate.kind === "route") {
    assert.equal(gate.args.workflow_action, CI_WORKFLOW_CANCEL_SENTINEL);
  }
  clearCompetitiveIntelWorkflow();
});

test("supervisor gate routes expand actions when workflow is done", () => {
  clearCompetitiveIntelWorkflow();
  initCompetitiveIntelWorkflow({ industry: "HR tech" });
  updateCompetitiveIntelWorkflow({ step: "done" });
  assert.equal(isCompetitiveIntelExpandExternalAiText("expand with external AI"), true);
  assert.equal(isCompetitiveIntelReviewDeepenText("add review enrichment"), true);
  assert.equal(isCompetitiveIntelRegenerateReportText("regenerate report"), true);

  const expandGate = resolveCompetitiveIntelWorkflowGate({
    commandText: "expand with external AI",
    confirmationText: "",
    pendingConfirmation: null,
    hasQueuedCommands: false,
  });
  assert.equal(expandGate.kind, "route");
  if (expandGate.kind === "route") {
    assert.equal(expandGate.args.workflow_action, "expand_external_ai");
  }

  const reviewGate = resolveCompetitiveIntelWorkflowGate({
    commandText: "add review enrichment",
    confirmationText: "",
    pendingConfirmation: null,
    hasQueuedCommands: false,
  });
  assert.equal(reviewGate.kind, "route");
  if (reviewGate.kind === "route") {
    assert.equal(reviewGate.args.workflow_action, "review_deepen");
  }
  clearCompetitiveIntelWorkflow();
});

test("supervisor gate skips continue after tool already ran this turn", () => {
  clearCompetitiveIntelWorkflow();
  initCompetitiveIntelWorkflow({ industry: "fintech" });
  const gate = resolveCompetitiveIntelWorkflowGate({
    commandText: "continue",
    confirmationText: "",
    pendingConfirmation: null,
    hasQueuedCommands: false,
    justRanTool: true,
  });
  assert.equal(gate.kind, "none");
  clearCompetitiveIntelWorkflow();
});

test("supervisor gate routes yes to enrichment when tier plan pending", () => {
  clearCompetitiveIntelWorkflow();
  initCompetitiveIntelWorkflow({ industry: "fintech" });
  updateCompetitiveIntelWorkflow({ step: "tiers" });
  const gate = resolveCompetitiveIntelWorkflowGate({
    commandText: "yes",
    confirmationText: "yes",
    pendingConfirmation: {
      command: "run_competitive_intel",
      args: { workflow_confirmed: true, workflow_action: "__CI_TIERS_CONFIRM__" },
      description: "Confirm tiers",
    },
    hasQueuedCommands: false,
    justRanTool: true,
  });
  assert.equal(gate.kind, "route");
  if (gate.kind === "route") {
    assert.equal(gate.args.workflow_confirmed, true);
  }
  clearCompetitiveIntelWorkflow();
});

test("confirmation gate accepts continue for competitive intel tier plan", () => {
  const gate = resolvePendingConfirmationGate({
    confirmationText: "continue",
    pendingConfirmation: {
      command: "run_competitive_intel",
      args: { workflow_confirmed: true },
      description: "Confirm tiers",
    },
    justRanConfirm: false,
  });
  assert.equal(gate.kind, "route");
  if (gate.kind === "route") {
    assert.equal(gate.next, "confirm_action");
    assert.equal(gate.args.confirmed, true);
  }
});
