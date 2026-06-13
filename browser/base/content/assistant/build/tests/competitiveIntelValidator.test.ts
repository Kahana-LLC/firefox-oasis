import test from "node:test";
import assert from "node:assert/strict";
import { validateCompetitiveIntelOutput } from "../src/utils/outputValidators.js";
import type { CompetitiveIntelReport } from "../src/services/competitiveIntelTypes.js";
import type { TabDigest } from "../src/services/researchBriefTypes.js";

const digests: TabDigest[] = [
  {
    tabId: 1,
    title: "Acme overview",
    url: "https://example.com/acme",
    status: "ok",
    content: "Acme Corp leads enterprise CRM with strong pharma vertical focus.",
  },
];

const baseReport: CompetitiveIntelReport = {
  industry: "enterprise CRM",
  generatedAt: new Date().toISOString(),
  executiveSummary: "Acme leads the market.",
  overallConfidence: "medium",
  confidenceRationale: "Single source.",
  confidenceRefinementEligible: true,
  competitors: [
    {
      name: "Acme Corp",
      tier: "High",
      sizeSignal: "Large enterprise footprint",
      differentiators: ["Pharma focus"],
      customerFeedback: ["Strong support"],
      verticalFocus: ["pharma"],
      confidence: "medium",
      sourceUrls: ["https://example.com/acme"],
      quotes: ["leads enterprise CRM"],
    },
  ],
  comparisonMatrix: {
    dimensions: ["Primary vertical"],
    cells: [
      {
        competitor: "Acme Corp",
        dimension: "Primary vertical",
        assessment: "Pharma",
        confidence: "medium",
        sourceUrls: ["https://example.com/acme"],
      },
    ],
  },
  tierRationale: [
    {
      tier: "High",
      whyRelevant: "Market leader",
      tabGroupLabel: "CI — High",
    },
  ],
  sources: [
    {
      title: "Acme overview",
      url: "https://example.com/acme",
      status: "ok",
      keyClaims: ["Market leader"],
      quotes: [{ text: "leads enterprise CRM", url: "https://example.com/acme" }],
    },
  ],
  gapsAndContradictions: [],
};

test("validateCompetitiveIntelOutput accepts grounded report", () => {
  const result = validateCompetitiveIntelOutput(baseReport, {
    digests,
    allowedCompanies: ["Acme Corp"],
  });
  assert.equal(result.ok, true);
});

test("validateCompetitiveIntelOutput rejects invented competitor", () => {
  const report = {
    ...baseReport,
    competitors: [
      {
        ...baseReport.competitors[0],
        name: "FakeCo",
      },
    ],
  };
  const result = validateCompetitiveIntelOutput(report, {
    digests,
    allowedCompanies: ["Acme Corp"],
  });
  assert.equal(result.ok, false);
});

test("validateCompetitiveIntelOutput rejects ungrounded quote", () => {
  const report = {
    ...baseReport,
    competitors: [
      {
        ...baseReport.competitors[0],
        quotes: ["totally invented quote"],
      },
    ],
  };
  const result = validateCompetitiveIntelOutput(report, {
    digests,
    allowedCompanies: ["Acme Corp"],
  });
  assert.equal(result.ok, false);
});
