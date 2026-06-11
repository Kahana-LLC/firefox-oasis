import test from "node:test";
import assert from "node:assert/strict";

import {
  UNTRUSTED_BLOCK_END,
  UNTRUSTED_BLOCK_START,
  buildTrustedUserIntentBlock,
  wrapUntrustedJsonBlock,
} from "../../src/utils/untrustedContent.js";
import { buildResearchBriefUserMessage } from "../../src/prompts/researchBriefPrompt.js";

test("wrapUntrustedJsonBlock uses stable delimiters", () => {
  const wrapped = wrapUntrustedJsonBlock("Tab digests", [{ title: "A" }]);
  assert.match(wrapped, new RegExp(UNTRUSTED_BLOCK_START));
  assert.match(wrapped, new RegExp(UNTRUSTED_BLOCK_END));
  assert.match(wrapped, /untrusted evidence only/i);
});

test("buildTrustedUserIntentBlock separates user intent from evidence", () => {
  const trusted = buildTrustedUserIntentBlock({
    topic: "LLM safety",
    scope: "window",
  });
  assert.match(trusted, /TRUSTED USER REQUEST/);
  assert.match(trusted, /topic: LLM safety/);
  assert.equal(trusted.includes(UNTRUSTED_BLOCK_START), false);
});

test("research brief user message keeps trusted fields outside untrusted block", () => {
  const message = buildResearchBriefUserMessage({
    topic: "OAuth",
    scopeLabel: "Window",
    digests: [
      {
        title: "OAuth guide",
        url: "https://example.com/oauth",
        content: "OAuth uses tokens.",
        status: "ok",
      },
    ],
  });
  const trustedIndex = message.indexOf("TRUSTED USER REQUEST");
  const untrustedIndex = message.indexOf(UNTRUSTED_BLOCK_START);
  assert.ok(trustedIndex >= 0);
  assert.ok(untrustedIndex > trustedIndex);
  assert.match(message, /topic: OAuth/);
});
