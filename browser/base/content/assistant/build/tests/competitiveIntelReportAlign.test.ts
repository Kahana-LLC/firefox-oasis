import test from "node:test";
import assert from "node:assert/strict";
import {
  alignCompetitiveIntelReport,
  normalizeDigestUrl,
  resolveAllowedCompanyName,
  resolveDigestUrl,
  buildDigestUrlIndex,
} from "../src/utils/competitiveIntelReportAlign.js";
import { validateCompetitiveIntelOutput } from "../src/utils/outputValidators.js";
import type { CompetitiveIntelReport } from "../src/services/competitiveIntelTypes.js";
import type { TabDigest } from "../src/services/researchBriefTypes.js";

const digests: TabDigest[] = [
  {
    title: "Beamery G2",
    url: "https://www.g2.com/products/beamery/reviews",
    status: "ok",
    content: "Beamery is praised for talent CRM workflows and enterprise skills planning.",
  },
];

const looseReport: CompetitiveIntelReport = {
  industry: "HR tech",
  generatedAt: new Date().toISOString(),
  executiveSummary: "Beamery competes strongly in enterprise talent CRM.",
  overallConfidence: "medium",
  confidenceRationale: "One review source.",
  confidenceRefinementEligible: true,
  competitors: [
    {
      name: "Beamery",
      tier: "High",
      sizeSignal: "Enterprise",
      differentiators: ["Talent CRM"],
      customerFeedback: ["Strong skills planning"],
      verticalFocus: ["enterprise"],
      confidence: "medium",
      sourceUrls: ["https://g2.com/products/beamery/reviews"],
      quotes: ["praised for talent CRM workflows"],
    },
  ],
  comparisonMatrix: {
    dimensions: ["CRM"],
    cells: [
      {
        competitor: "Beamery",
        dimension: "CRM",
        assessment: "Strong",
        confidence: "medium",
        sourceUrls: ["https://g2.com/products/beamery/reviews"],
      },
    ],
  },
  tierRationale: [
    {
      tier: "High",
      whyRelevant: "Leader",
      tabGroupLabel: "CI — High",
    },
  ],
  sources: [
    {
      title: "Beamery G2",
      url: "https://g2.com/products/beamery/reviews",
      status: "ok",
      keyClaims: ["Talent CRM leader"],
      quotes: [{ text: "talent CRM workflows", context: "G2" }],
    },
  ],
  gapsAndContradictions: [],
};

test("normalizeDigestUrl strips www and trailing slash", () => {
  assert.equal(
    normalizeDigestUrl("https://www.g2.com/products/beamery/reviews/"),
    "https://g2.com/products/beamery/reviews"
  );
});

test("resolveDigestUrl matches canonical digest URLs with variants", () => {
  const index = buildDigestUrlIndex(digests);
  assert.equal(
    resolveDigestUrl("https://g2.com/products/beamery/reviews", index),
    "https://www.g2.com/products/beamery/reviews"
  );
});

test("resolveAllowedCompanyName matches suffix variants", () => {
  assert.equal(
    resolveAllowedCompanyName("Eightfold", ["Eightfold AI"]),
    "Eightfold AI"
  );
});

test("alignCompetitiveIntelReport fixes URLs and validates", () => {
  const aligned = alignCompetitiveIntelReport(looseReport, digests, [
    "Beamery",
  ]);
  const validation = validateCompetitiveIntelOutput(aligned, {
    digests,
    allowedCompanies: ["Beamery"],
  });
  assert.equal(validation.ok, true);
  assert.equal(
    aligned.competitors[0]?.sourceUrls[0],
    "https://www.g2.com/products/beamery/reviews"
  );
});
