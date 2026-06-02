import test from "node:test";
import assert from "node:assert/strict";

import {
  clampMaxTabs,
  estimateSynthesisTokens,
  parseResearchBriefFromAssistContent,
  researchBriefToMarkdown,
  truncateDigestsToBudget,
} from "../src/services/researchBriefFormat.js";
import type {
  ResearchBrief,
  TabDigest,
} from "../src/services/researchBriefTypes.js";
import {
  buildResearchBriefToolMessage,
  displayMarkdownFromResearchBriefToolMessage,
  parseResearchBriefToolMessage,
} from "../src/utils/researchBriefRequest.js";

const sampleBrief: ResearchBrief = {
  topic: "AI privacy tools",
  generatedAt: "2026-06-01T12:00:00.000Z",
  scopeLabel: "Tab group: Research",
  executiveSummary: "Founders need local-first tooling.",
  outline: [
    {
      heading: "Why it matters",
      bullets: ["Regulatory pressure", "User trust"],
    },
  ],
  themes: [
    {
      label: "Data minimization",
      synthesis: "Several sources emphasize collecting less.",
      sourceUrls: ["https://example.com/a"],
    },
  ],
  sources: [
    {
      title: "Example Article",
      url: "https://example.com/a",
      status: "ok",
      keyClaims: ["Privacy by design"],
      quotes: [{ text: "Data should stay on device.", context: "Intro" }],
    },
    {
      title: "Failed",
      url: "https://example.com/b",
      status: "failed",
      failureReason: "Paywall",
      keyClaims: [],
      quotes: [],
    },
  ],
  gapsAndContradictions: ["No EU-specific guidance in set"],
};

test("researchBriefToMarkdown includes outline, quotes, and source metadata", () => {
  const md = researchBriefToMarkdown(sampleBrief);
  assert.match(md, /^# Research brief: AI privacy tools/);
  assert.match(md, /## Executive summary/);
  assert.match(md, /### Why it matters/);
  assert.match(md, /> Data should stay on device/);
  assert.match(md, /\[Example Article\]\(https:\/\/example\.com\/a\)/);
  assert.match(md, /\*Paywall\*/);
  assert.match(md, /## Gaps and contradictions/);
});

test("parseResearchBriefFromAssistContent accepts JSON object", () => {
  const parsed = parseResearchBriefFromAssistContent(sampleBrief);
  assert.ok(parsed);
  assert.equal(parsed?.topic, "AI privacy tools");
  assert.equal(parsed?.sources.length, 2);
});

test("research brief tool message round-trip", () => {
  const markdown = researchBriefToMarkdown(sampleBrief);
  const wire = buildResearchBriefToolMessage({ markdown, brief: sampleBrief });
  const parsed = parseResearchBriefToolMessage(wire);
  assert.ok(parsed);
  assert.equal(parsed?.markdown, markdown);
  assert.equal(parsed?.brief.topic, sampleBrief.topic);
  assert.equal(displayMarkdownFromResearchBriefToolMessage(wire), markdown);
});

test("clampMaxTabs enforces defaults and hard cap", () => {
  assert.equal(clampMaxTabs(undefined), 10);
  assert.equal(clampMaxTabs(3), 3);
  assert.equal(clampMaxTabs(99), 15);
});

test("truncateDigestsToBudget scales content down", () => {
  const digests: TabDigest[] = [
    {
      title: "A",
      url: "https://a.test",
      content: "x".repeat(50000),
      status: "ok",
    },
    {
      title: "B",
      url: "https://b.test",
      content: "y".repeat(50000),
      status: "ok",
    },
  ];
  const { digests: out, truncated } = truncateDigestsToBudget(digests, 80000);
  assert.equal(truncated, true);
  const total = out.reduce((s, d) => s + d.content.length, 0);
  assert.ok(total <= 80000 + 10);
});

test("estimateSynthesisTokens uses char heuristic", () => {
  const digests: TabDigest[] = [
    { title: "T", url: "https://t", content: "abcd", status: "ok" },
  ];
  assert.ok(estimateSynthesisTokens(digests) >= 4000);
});
