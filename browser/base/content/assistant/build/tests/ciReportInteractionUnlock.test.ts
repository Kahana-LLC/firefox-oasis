import test from "node:test";
import assert from "node:assert/strict";
import { AIMessage } from "@langchain/core/messages";

import { OASIS_EVENT_CI_REPORT_READY } from "../../shared/contracts.js";
import {
  buildCompetitiveIntelToolMessage,
  buildSlimCompetitiveIntelToolMessage,
} from "../src/utils/competitiveIntelRequest.js";
import {
  isCiReportResultMessage,
  isSelfContainedToolResultMessage,
} from "../src/utils/ciReportDelivery.js";
import type { CompetitiveIntelReport } from "../src/services/competitiveIntelTypes.js";
import type { MessageLike } from "../src/assistant/messageUtils.js";

const sampleReport: CompetitiveIntelReport = {
  industry: "HR tech",
  generatedAt: "2026-01-01",
  executiveSummary: "Summary",
  overallConfidence: "medium",
  confidenceRationale: "Grounded",
  confidenceRefinementEligible: false,
  competitors: [],
  comparisonMatrix: { dimensions: [], cells: [] },
  sources: [],
};

function installWindowShim(events: string[]) {
  const previous = globalThis.window;
  const shim = {
    dispatchEvent: (event: Event) => {
      events.push(event.type);
      return true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  Object.assign(globalThis, { window: shim, dispatchEvent: shim.dispatchEvent });
  return () => {
    if (previous === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      globalThis.window = previous;
    }
  };
}

test("isCiReportResultMessage detects CI marker payloads only", () => {
  const ciPayload = buildCompetitiveIntelToolMessage({
    markdown: "# Report",
    report: sampleReport,
    reportId: "ci_unlock",
  });
  const ciMessage: MessageLike = {
    content: ciPayload,
    name: "run_competitive_intel",
    additional_kwargs: {
      oasisToolResult: {
        kind: "tool_result",
        commandName: "run_competitive_intel",
        message: ciPayload,
      },
    },
  };
  assert.equal(isCiReportResultMessage(ciMessage), true);
  assert.equal(
    isCiReportResultMessage({
      content: "plain assistant reply",
      name: "chat",
    }),
    false
  );
});

test("finalizeCiReportInteractionUnlock clears pending overlays and emits event", async () => {
  const events: string[] = [];
  const restore = installWindowShim(events);
  const {
    clearPendingClarification,
    clearPendingConfirmation,
    getPendingClarification,
    getPendingConfirmation,
    setPendingClarification,
    setPendingConfirmation,
  } = await import("../src/services/interactionState.js");
  const { finalizeCiReportInteractionUnlock } = await import(
    "../src/utils/ciReportUnlock.js"
  );

  setPendingClarification({
    originalMessage: "Choose report mode",
    options: [
      {
        id: "compact",
        label: "Compact",
        resolvedPrompt: "compact report",
      },
    ],
  });
  setPendingConfirmation({
    command: "run_competitive_intel",
    args: {},
    description: "Confirm enrichment",
  });

  try {
    finalizeCiReportInteractionUnlock();
    assert.equal(getPendingClarification(), null);
    assert.equal(getPendingConfirmation(), null);
    assert.ok(events.includes(OASIS_EVENT_CI_REPORT_READY));
  } finally {
    restore();
    clearPendingClarification();
    clearPendingConfirmation();
  }
});

test("maybeFinalizeCiReportFromText unlocks only for CI marker text", async () => {
  const events: string[] = [];
  const restore = installWindowShim(events);
  const { maybeFinalizeCiReportFromText } = await import(
    "../src/utils/ciReportUnlock.js"
  );
  const { clearPendingClarification, clearPendingConfirmation } = await import(
    "../src/services/interactionState.js"
  );

  try {
    assert.equal(maybeFinalizeCiReportFromText("hello"), false);
    assert.equal(events.length, 0);

    const payload = buildSlimCompetitiveIntelToolMessage("ci_finalize");
    assert.equal(maybeFinalizeCiReportFromText(payload), true);
    assert.ok(events.includes(OASIS_EVENT_CI_REPORT_READY));
    assert.ok(events.includes("oasis-usage-update"));
  } finally {
    restore();
    clearPendingClarification();
    clearPendingConfirmation();
  }
});

test("self-contained slim CI payload still unlocks passthrough path", () => {
  const payload = buildSlimCompetitiveIntelToolMessage("ci_passthrough");
  const message: MessageLike = {
    content: payload,
    name: "run_competitive_intel",
    additional_kwargs: {
      oasisToolResult: {
        kind: "tool_result",
        commandName: "run_competitive_intel",
        message: payload,
      },
    },
  };
  assert.equal(isSelfContainedToolResultMessage(message), true);
  assert.equal(isCiReportResultMessage(message), true);
  assert.ok(
    new AIMessage({ content: payload, name: "run_competitive_intel" })
  );
});
