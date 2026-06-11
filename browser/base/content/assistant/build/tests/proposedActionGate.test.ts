import test from "node:test";
import assert from "node:assert/strict";

import { resolvePendingProposedActionGate } from "../src/assistant/supervisorGates.js";
import {
  detectProposedActionFromText,
  looksLikeUnbackedActionClaim,
} from "../src/utils/proposedActionUtils.js";

test("detectProposedActionFromText extracts youtube play intent", () => {
  const proposal = detectProposedActionFromText(
    "I can search YouTube for NBA highlights from last night."
  );
  assert.ok(proposal);
  assert.equal(proposal?.suggestedTool, "play_video");
});

test("resolvePendingProposedActionGate executes on okay", () => {
  const gate = resolvePendingProposedActionGate({
    confirmationText: "okay",
    pendingProposedAction: {
      proposedPrompt: "play nba highlights from last night",
      suggestedTool: "play_video",
    },
    pendingConfirmation: null,
  });
  assert.equal(gate.kind, "resolved");
  if (gate.kind === "resolved") {
    assert.equal(gate.suggestedTool, "play_video");
  }
});

test("looksLikeUnbackedActionClaim flags fake completion text", () => {
  assert.equal(
    looksLikeUnbackedActionClaim(
      "I've opened YouTube and searched for NBA highlights for you."
    ),
    true
  );
});
