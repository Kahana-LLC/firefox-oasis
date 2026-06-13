import test from "node:test";
import assert from "node:assert/strict";
import { OASIS_EVENT_CI_REPORT_READY } from "../../shared/contracts.js";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

import {
  AGENT_END,
  streamAgentLoop,
  type AgentState,
} from "../src/assistant/agentLoopDriver.js";
import { consumeAssistantGraphStream } from "../src/assistant/stream.js";
import {
  COMPETITIVE_INTEL_MARKER,
  buildCompetitiveIntelToolMessage,
  buildSlimCompetitiveIntelToolMessage,
  parseCompetitiveIntelToolMessage,
} from "../src/utils/competitiveIntelRequest.js";
import { CI_WORKFLOW_MARKER } from "../src/utils/competitiveIntelWorkflowRequest.js";
import {
  isSelfContainedToolResultMessage,
  selfContainedToolResultBytes,
} from "../src/utils/ciReportDelivery.js";
import {
  loadCompetitiveIntelReportCache,
  storeCompetitiveIntelReportCache,
} from "../src/services/competitiveIntelReportCache.js";
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

function ciToolMessage(content: string, withKwargs = true): MessageLike {
  return {
    content,
    name: "run_competitive_intel",
    additional_kwargs: withKwargs
      ? {
          oasisToolResult: {
            kind: "tool_result",
            commandName: "run_competitive_intel",
            message: content,
          },
        }
      : {},
  };
}

test("isSelfContainedToolResultMessage detects CI marker payloads", () => {
  const payload = buildCompetitiveIntelToolMessage({
    markdown: "# Report",
    report: sampleReport,
    reportId: "ci_test",
  });
  const message = ciToolMessage(payload);
  assert.equal(isSelfContainedToolResultMessage(message), true);
  assert.ok(selfContainedToolResultBytes(message) > 0);
});

test("isSelfContainedToolResultMessage detects workflow marker payloads", () => {
  const message = ciToolMessage(
    `${CI_WORKFLOW_MARKER}\n{"step":"report","status":"awaiting_continue"}`
  );
  assert.equal(isSelfContainedToolResultMessage(message), true);
});

test("isSelfContainedToolResultMessage works without kwargs regression", () => {
  const payload = buildSlimCompetitiveIntelToolMessage("ci_cached");
  const message: MessageLike = {
    content: payload,
    name: "run_competitive_intel",
    additional_kwargs: {},
  };
  assert.equal(isSelfContainedToolResultMessage(message), true);
});

test("supervisor routes self-contained CI tool to AGENT_END", async () => {
  const payload = buildSlimCompetitiveIntelToolMessage("ci_route_test");
  let supervisorCalls = 0;
  const supervisorNode = async (state: AgentState) => {
    supervisorCalls += 1;
    if (supervisorCalls === 1) {
      return { next: "run_competitive_intel", args: {}, commandQueue: [] };
    }
    const lastMsg = state.messages[state.messages.length - 1] as MessageLike;
    if (isSelfContainedToolResultMessage(lastMsg)) {
      return { next: AGENT_END, args: {}, commandQueue: [] };
    }
    return { next: "chat", args: {}, commandQueue: [] };
  };

  const chatNode = async () => {
    throw new Error("chat node should not run for CI passthrough");
  };

  const toolAgents = {
    run_competitive_intel: async () => ({
      messages: [
        new AIMessage({
          content: payload,
          name: "run_competitive_intel",
          additional_kwargs: {
            oasisToolResult: {
              kind: "tool_result",
              commandName: "run_competitive_intel",
              message: payload,
            },
          },
        }),
      ],
      lastWorker: "run_competitive_intel",
      next: "supervisor",
      args: {},
      commandQueue: [],
    }),
  };

  const steps: string[] = [];
  for await (const step of streamAgentLoop({
    initialMessages: [new HumanMessage("continue")],
    maxSteps: 8,
    supervisorNode,
    chatNode,
    toolAgents,
    memberNames: ["run_competitive_intel"],
  })) {
    steps.push(Object.keys(step).join(","));
  }

  assert.ok(steps.some(step => step.includes("__end__")));
  assert.equal(steps.some(step => step.includes("chat")), false);
});

test("consumeAssistantGraphStream emits tool buffer without chat node", async () => {
  const payload = buildSlimCompetitiveIntelToolMessage("ci_stream_test");
  async function* mockStream() {
    yield {
      run_competitive_intel: {
        messages: [
          new AIMessage({
            content: payload,
            name: "run_competitive_intel",
            additional_kwargs: {
              oasisToolResult: {
                kind: "tool_result",
                commandName: "run_competitive_intel",
                message: payload,
              },
            },
          }),
        ],
      },
    };
    yield { __end__: true };
  }

  const chunks: string[] = [];
  const combined = await consumeAssistantGraphStream({
    stream: mockStream(),
    prompt: "continue",
    onChunk: text => chunks.push(text),
    inputType: "text",
    toolCommandNames: new Set(["run_competitive_intel"]),
    pushCurrentTurn: () => {},
    trackUsage: () => {},
  });

  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].includes(COMPETITIVE_INTEL_MARKER));
  assert.ok(combined.includes(COMPETITIVE_INTEL_MARKER));
});

test("inline CI payload parses without cache hydration", () => {
  const message = buildCompetitiveIntelToolMessage({
    markdown: "# Competitive intelligence: HR tech",
    report: sampleReport,
    reportId: "ci_inline",
    reportMode: "full",
  });
  const parsed = parseCompetitiveIntelToolMessage(message);
  assert.ok(parsed);
  assert.equal(parsed!.reportId, "ci_inline");
  assert.equal(parsed!.reportMode, "full");
  assert.match(parsed!.markdown, /Competitive intelligence/);
});

test("large CI payload parse stays within budget", () => {
  const competitors = Array.from({ length: 20 }, (_, index) => ({
    name: `Competitor ${index + 1}`,
    tier: "medium",
    sizeSignal: "Mid-market",
    differentiators: ["d1", "d2", "d3"],
    customerFeedback: ["feedback"],
    verticalFocus: ["HR"],
    confidence: "medium" as const,
    sourceUrls: [`https://example.com/${index}`],
  }));
  const largeReport: CompetitiveIntelReport = {
    ...sampleReport,
    competitors,
    tierRationale: [],
    gapsAndContradictions: [],
    comparisonMatrix: {
      dimensions: ["Pricing", "UX", "Integrations", "Support"],
      cells: competitors.flatMap(competitor =>
        ["Pricing", "UX", "Integrations", "Support"].map(dimension => ({
          competitor: competitor.name,
          dimension,
          assessment: "C".repeat(180),
          confidence: "medium" as const,
          sourceUrls: competitor.sourceUrls,
        }))
      ),
    },
  };
  const message = buildCompetitiveIntelToolMessage({
    markdown: "# ".repeat(2000) + "Large report",
    report: largeReport,
    reportId: "ci_large",
  });

  const started = performance.now();
  const parsed = parseCompetitiveIntelToolMessage(message);
  const elapsed = performance.now() - started;

  assert.ok(parsed);
  assert.ok(elapsed < 500, `parse took ${elapsed}ms`);
});

test("OASIS_EVENT_CI_REPORT_READY contract is defined", () => {
  assert.equal(OASIS_EVENT_CI_REPORT_READY, "oasis-ci-report-ready");
});
