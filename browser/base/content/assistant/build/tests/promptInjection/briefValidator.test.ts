import test from "node:test";
import assert from "node:assert/strict";

import { validateResearchBriefOutput } from "../../src/utils/outputValidators.js";
import type {
  ResearchBrief,
  TabDigest,
} from "../../src/services/researchBriefTypes.js";

const digests: TabDigest[] = [
  {
    title: "OAuth guide",
    url: "https://example.com/oauth",
    content: "OAuth uses authorization codes and access tokens.",
    status: "ok",
  },
];

function baseBrief(overrides: Partial<ResearchBrief> = {}): ResearchBrief {
  return {
    topic: "OAuth",
    generatedAt: new Date().toISOString(),
    scopeLabel: "Window",
    executiveSummary: "OAuth is widely used.",
    outline: [],
    themes: [],
    sources: [
      {
        title: "OAuth guide",
        url: "https://example.com/oauth",
        status: "ok",
        keyClaims: [],
        quotes: [
          {
            text: "OAuth uses authorization codes and access tokens.",
          },
        ],
      },
    ],
    gapsAndContradictions: [],
    ...overrides,
  };
}

test("validateResearchBriefOutput accepts grounded quotes", () => {
  const result = validateResearchBriefOutput(baseBrief(), digests, {
    trustedTopic: "OAuth",
  });
  assert.equal(result.ok, true);
});

test("validateResearchBriefOutput rejects fake quotes", () => {
  const brief = baseBrief({
    sources: [
      {
        title: "OAuth guide",
        url: "https://example.com/oauth",
        status: "ok",
        keyClaims: [],
        quotes: [{ text: "This quote was invented by the model." }],
      },
    ],
  });
  const result = validateResearchBriefOutput(brief, digests, {
    trustedTopic: "OAuth",
  });
  assert.equal(result.ok, false);
});

test("validateResearchBriefOutput rejects topic override when not inferred", () => {
  const result = validateResearchBriefOutput(
    baseBrief({ topic: "Jailbreak topic" }),
    digests,
    { trustedTopic: "OAuth", topicInferred: false }
  );
  assert.equal(result.ok, false);
});
