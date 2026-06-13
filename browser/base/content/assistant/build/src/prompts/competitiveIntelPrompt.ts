import {
  UNTRUSTED_CONTENT_SYSTEM_RULES,
  buildTrustedUserIntentBlock,
  wrapUntrustedJsonBlock,
} from "../utils/untrustedContent.js";
import type { TabDigest } from "./researchBriefTypes.js";
import type { CompetitiveCompany } from "./competitiveIntelTypes.js";

export const COMPETITIVE_INTEL_SYSTEM_PROMPT = [
  "You are a competitive intelligence analyst.",
  "Produce a grounded competitive intelligence report from extracted browser tab content.",
  "Compare companies across tiers and highlight meaningful distinctions (vertical focus, footprint, pricing, differentiation, customer feedback themes).",
  "Assign confidence honestly: downgrade when sources are thin, login-walled, or single-source.",
  "Do not invent facts, quotes, or URLs not supported by digests.",
  "Use exact competitor names from the trusted competitor list.",
  "For every sourceUrls entry and sources[].url, copy the exact url string from tab_digests.",
  "Omit quotes unless the exact wording appears in tab_digests content.",
  "Return only valid JSON matching the schema.",
  UNTRUSTED_CONTENT_SYSTEM_RULES,
].join("\n");

export const COMPETITIVE_INTEL_COMPACT_ADDENDUM = [
  "COMPACT REPORT MODE:",
  "Keep the executive summary to 150 words maximum.",
  "Use at most 3 comparison matrix dimensions.",
  "List at most 2 differentiators per competitor.",
  "Skip quotes unless essential for a key claim.",
].join("\n");

export const COMPETITIVE_INTEL_GENERATION_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      industry: { type: "string" },
      generatedAt: { type: "string" },
      executiveSummary: { type: "string" },
      overallConfidence: { type: "string", enum: ["high", "medium", "low"] },
      confidenceRationale: { type: "string" },
      confidenceRefinementEligible: { type: "boolean" },
      competitors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            tier: { type: "string" },
            sizeSignal: { type: "string" },
            differentiators: { type: "array", items: { type: "string" } },
            customerFeedback: { type: "array", items: { type: "string" } },
            verticalFocus: { type: "array", items: { type: "string" } },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            sourceUrls: { type: "array", items: { type: "string" } },
            quotes: { type: "array", items: { type: "string" } },
          },
          required: [
            "name",
            "tier",
            "sizeSignal",
            "differentiators",
            "customerFeedback",
            "verticalFocus",
            "confidence",
            "sourceUrls",
          ],
        },
      },
      comparisonMatrix: {
        type: "object",
        properties: {
          dimensions: { type: "array", items: { type: "string" } },
          cells: {
            type: "array",
            items: {
              type: "object",
              properties: {
                competitor: { type: "string" },
                dimension: { type: "string" },
                assessment: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                sourceUrls: { type: "array", items: { type: "string" } },
              },
              required: [
                "competitor",
                "dimension",
                "assessment",
                "confidence",
                "sourceUrls",
              ],
            },
          },
        },
        required: ["dimensions", "cells"],
      },
      tierRationale: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tier: { type: "string" },
            whyRelevant: { type: "string" },
            tabGroupLabel: { type: "string" },
          },
          required: ["tier", "whyRelevant", "tabGroupLabel"],
        },
      },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            status: { type: "string", enum: ["ok", "skipped", "failed"] },
            failureReason: { type: "string" },
            keyClaims: { type: "array", items: { type: "string" } },
            quotes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  context: { type: "string" },
                },
                required: ["text"],
              },
            },
          },
          required: ["title", "url", "status", "keyClaims", "quotes"],
        },
      },
      gapsAndContradictions: { type: "array", items: { type: "string" } },
    },
    required: [
      "industry",
      "generatedAt",
      "executiveSummary",
      "overallConfidence",
      "confidenceRationale",
      "confidenceRefinementEligible",
      "competitors",
      "comparisonMatrix",
      "tierRationale",
      "sources",
      "gapsAndContradictions",
    ],
  },
};

export function buildCompetitiveIntelUserMessage(params: {
  industry: string;
  focus?: string;
  companies: CompetitiveCompany[];
  groupLabels: string[];
  digests: Array<TabDigest & { tierLabel?: string; companyName?: string }>;
  compact?: boolean;
}): string {
  return [
    buildTrustedUserIntentBlock({
      industry: params.industry,
      focus: params.focus || "",
      competitors: params.companies.map(company => company.name),
      tiers: params.groupLabels,
    }),
    params.compact ? COMPETITIVE_INTEL_COMPACT_ADDENDUM : undefined,
    "Build a competitive intelligence battle-card style report.",
    "Explain why each tab group tier matters and compare companies across dimensions.",
    wrapUntrustedJsonBlock(
      "tab_digests",
      params.digests.map(digest => ({
        title: digest.title,
        url: digest.url,
        tierLabel: digest.tierLabel,
        companyName: digest.companyName,
        status: digest.status,
        content: digest.content.slice(0, 8000),
      }))
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}
