import test from "node:test";
import assert from "node:assert/strict";
import {
  tierTableToCsv,
  tierTableToMarkdown,
  tierTableToTsv,
  comparisonMatrixToMarkdown,
  comparisonMatrixToTsv,
} from "../src/utils/competitiveIntelArtifacts.js";
import type {
  CompetitiveCompany,
  CompetitiveIntelReport,
} from "../src/services/competitiveIntelTypes.js";

const companies: CompetitiveCompany[] = [
  {
    name: "Acme",
    normalizedName: "acme",
    description: "Leader",
    tier: "high",
    sourceUrls: [],
    mentionCount: 2,
  },
  {
    name: "BetaCo",
    normalizedName: "betaco",
    description: "Challenger",
    tier: "medium",
    sourceUrls: [],
    mentionCount: 1,
  },
];

test("tierTableToMarkdown groups by tier", () => {
  const md = tierTableToMarkdown(companies);
  assert.match(md, /### High \(1\)/);
  assert.match(md, /\| Acme \| 2 \| Leader \|/);
  assert.match(md, /### Medium \(1\)/);
});

test("tierTableToTsv uses tab separators", () => {
  const tsv = tierTableToTsv(companies);
  assert.match(tsv, /^Tier\tCompany\tMentions\tDescription/);
  assert.ok(tsv.includes("High\tAcme\t2\tLeader"));
});

test("tierTableToCsv escapes commas", () => {
  const csv = tierTableToCsv([
    {
      ...companies[0],
      description: "Leader, fast",
    },
  ]);
  assert.ok(csv.includes('"Leader, fast"'));
});

test("comparisonMatrixToMarkdown and Tsv", () => {
  const report: CompetitiveIntelReport = {
    industry: "CRM",
    generatedAt: "2026-01-01",
    executiveSummary: "Summary",
    overallConfidence: "medium",
    confidenceRationale: "Grounded",
    confidenceRefinementEligible: false,
    competitors: [],
    comparisonMatrix: {
      dimensions: ["Pricing", "Support"],
      cells: [
        {
          competitor: "Acme",
          dimension: "Pricing",
          assessment: "Premium",
          confidence: "high",
          sourceUrls: ["https://example.com"],
        },
        {
          competitor: "Acme",
          dimension: "Support",
          assessment: "Strong",
          confidence: "medium",
          sourceUrls: [],
        },
      ],
    },
    sources: [],
  };
  const md = comparisonMatrixToMarkdown(report);
  assert.match(md, /\| Acme \| Premium \| Strong \|/);
  const tsv = comparisonMatrixToTsv(report);
  assert.ok(tsv.includes("Acme\tPremium\tStrong"));
});
