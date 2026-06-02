import test from "node:test";
import assert from "node:assert/strict";

import { resolvePendingClarificationGate } from "../src/assistant/supervisorGates.js";
import type { PendingClarification } from "../src/services/interactionState.js";

const pendingClarification: PendingClarification = {
  originalMessage: "create a research brief based on tab group sports",
  options: [
    {
      id: "opt_1",
      label: "Summarize content of tabs in 'sports' group",
      resolvedPrompt:
        "Summarize the content of each tab in the sports tab group.",
    },
    {
      id: "opt_2",
      label: "Create a new document for a research brief on 'sports'",
      resolvedPrompt: "Build a research brief on sports from tab group sports.",
    },
  ],
};

test("yes resolves to research brief option when it is the only brief option", () => {
  const decision = resolvePendingClarificationGate({
    pendingClarification,
    confirmationText: "yes",
    commandText: "yes",
  });
  assert.equal(decision.kind, "resolved");
  if (decision.kind === "resolved") {
    assert.match(decision.resolvedPrompt, /research brief/i);
  }
});

test("fuzzy paraphrase resolves to matching clarification option", () => {
  const decision = resolvePendingClarificationGate({
    pendingClarification,
    confirmationText: "create a new document for a research brief",
    commandText: "create a new document for a research brief",
  });
  assert.equal(decision.kind, "resolved");
  if (decision.kind === "resolved") {
    assert.match(decision.resolvedPrompt, /Build a research brief/i);
  }
});

test("clarify:opt_2 resolves second option", () => {
  const decision = resolvePendingClarificationGate({
    pendingClarification,
    confirmationText: "clarify:opt_2",
    commandText: "clarify:opt_2",
  });
  assert.equal(decision.kind, "resolved");
  if (decision.kind === "resolved") {
    assert.match(decision.resolvedPrompt, /Build a research brief/i);
  }
});
