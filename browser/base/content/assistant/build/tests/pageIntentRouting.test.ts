import test from "node:test";
import assert from "node:assert/strict";

import { decideDeterministicRoute } from "../src/utils/decisionEngine.js";
import { buildHiddenInstruction } from "../src/prompts/hiddenInstructions.js";
import { shouldAskAssistRouter } from "../src/utils/routingUtils.js";
import { resolvePendingClarificationGate } from "../src/assistant/supervisorGates.js";
import {
  buildPageContextRequestMessage,
  parsePageContextRequestMessage,
} from "../src/utils/pageContextRequest.js";

const emptySnapshot = {
  folderNames: new Set<string>(),
  groupNames: new Set<string>(),
  stale: false,
};

test("deterministic summarize fallback still handles exact summary phrases", () => {
  for (const phrase of [
    "summarize this page",
    "summarize this page.",
    "summarize this tab",
    "summarize current tab?",
    "summarize current page",
    "summarize active page!",
  ]) {
    const route = decideDeterministicRoute(phrase, emptySnapshot);
    assert.equal(route.type, "tool", phrase);
    assert.equal(route.next, "summarize_page", phrase);
    assert.deepEqual(route.args, { query: phrase }, phrase);
  }
});

test("page-grounded requests should go through the assist router", () => {
  for (const prompt of [
    "show me the price of this",
    "based on this page is this legit",
    "what does this page say about returns",
  ]) {
    assert.equal(shouldAskAssistRouter(prompt), true, prompt);
  }
});

test("general questions without active-page grounding should stay out of assist routing", () => {
  for (const prompt of [
    "what is the capital of France",
    "tell me about refund laws",
    "is bitcoin a good investment",
  ]) {
    assert.equal(shouldAskAssistRouter(prompt), false, prompt);
  }
});

test("page context hidden instructions answer from page content when query is question-style", () => {
  const instruction = buildHiddenInstruction({
    hasPageContextRequest: true,
    hasToolOutput: false,
  });

  assert.match(instruction, /answer only from the page content/i);
  assert.match(instruction, /say that the page does not contain the answer/i);
  assert.match(instruction, /explicit summary requests summarize/i);
});

test("page context request payload is structured and parseable", () => {
  const payload = {
    title: "Example Product",
    url: "https://example.com/product",
    userQuery: "show me the price of this",
    content: "Example Product costs $12. Content: details stay data.",
  };

  const message = buildPageContextRequestMessage(payload);

  assert.deepEqual(parsePageContextRequestMessage(message), payload);
});

test("pending clarification direct text re-enters normal routing", () => {
  const pendingClarification = {
    originalMessage: "show me this",
    options: [
      { id: "opt_1", label: "Read this page", resolvedPrompt: "read this page" },
      { id: "opt_2", label: "Search the web", resolvedPrompt: "search the web" },
    ],
  };

  assert.equal(
    resolvePendingClarificationGate({
      pendingClarification,
      confirmationText: "what did I read yesterday",
      commandText: "what did I read yesterday",
    }).kind,
    "clear"
  );
  assert.equal(
    resolvePendingClarificationGate({
      pendingClarification,
      confirmationText: "3",
      commandText: "3",
    }).kind,
    "cancel"
  );
  assert.equal(
    resolvePendingClarificationGate({
      pendingClarification,
      confirmationText: "cancel",
      commandText: "cancel",
    }).kind,
    "cancel"
  );
});
