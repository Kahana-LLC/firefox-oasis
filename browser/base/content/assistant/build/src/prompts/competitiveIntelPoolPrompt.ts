import {
  UNTRUSTED_CONTENT_SYSTEM_RULES,
  wrapUntrustedJsonBlock,
} from "../utils/untrustedContent.js";
import type { TabDigest } from "./researchBriefTypes.js";
import type { CompetitiveTierId } from "./competitiveIntelTypes.js";

export const POOL_EXTRACTION_SYSTEM_PROMPT = [
  "You extract competitor company names from AI chat discovery results.",
  "Return only valid JSON matching the schema.",
  "Use only companies explicitly mentioned in the provided digests.",
  UNTRUSTED_CONTENT_SYSTEM_RULES,
].join("\n");

export const POOL_EXTRACTION_CONFIG = {
  responseMimeType: "application/json",
  responseJsonSchema: {
    type: "object",
    properties: {
      companies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            suggestedTier: {
              type: "string",
              enum: ["high", "medium", "low", "adjacent"],
            },
            websiteUrl: { type: "string" },
            g2Url: { type: "string" },
            trustradiusUrl: { type: "string" },
            capterraUrl: { type: "string" },
            wikipediaUrl: { type: "string" },
            gartnerUrl: { type: "string" },
            sourceUrls: { type: "array", items: { type: "string" } },
            mentionCount: { type: "number" },
          },
          required: ["name", "description", "mentionCount"],
        },
      },
    },
    required: ["companies"],
  },
};

export type PoolExtractedCompany = {
  name: string;
  description?: string;
  suggestedTier?: CompetitiveTierId;
  websiteUrl?: string;
  g2Url?: string;
  trustradiusUrl?: string;
  capterraUrl?: string;
  wikipediaUrl?: string;
  gartnerUrl?: string;
  sourceUrls?: string[];
  mentionCount?: number;
};

export function buildPoolExtractionUserMessage(params: {
  industry: string;
  focus?: string;
  digests: TabDigest[];
}): string {
  const focusLine = params.focus?.trim()
    ? `User focus: ${params.focus.trim()}`
    : "";
  return [
    `Industry: ${params.industry}`,
    focusLine,
    "Extract distinct competitor companies mentioned across these discovery tabs.",
    "For each company, extract direct URLs only when explicitly cited: websiteUrl (homepage), g2Url (g2.com/products/...), capterraUrl, wikipediaUrl (en.wikipedia.org/wiki/...), gartnerUrl (gartner.com/reviews/...). Skip LinkedIn. Do not guess URLs.",
    "Set mentionCount to how many tabs mention each company.",
    "Map market leaders to high, challengers to medium, niche to low, adjacent entrants to adjacent.",
    wrapUntrustedJsonBlock(
      "discovery_digests",
      params.digests.map(digest => ({
        title: digest.title,
        url: digest.url,
        content: digest.content.slice(0, 6000),
      }))
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parsePoolExtractionResult(response: unknown): {
  companies: PoolExtractedCompany[];
} | null {
  let content: unknown = response;
  if (typeof response === "object" && response && "content" in response) {
    content = (response as { content: unknown }).content;
  }
  if (
    typeof content === "object" &&
    content &&
    Array.isArray((content as { companies?: unknown }).companies)
  ) {
    return normalizePoolCompanies(
      (content as { companies: Array<Record<string, unknown>> }).companies
    );
  }
  const text = typeof content === "string" ? content : "";
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as {
      companies?: Array<Record<string, unknown>>;
    };
    if (!Array.isArray(parsed.companies)) return null;
    return normalizePoolCompanies(parsed.companies);
  } catch {
    return null;
  }
}

function normalizePoolCompanies(companies: Array<Record<string, unknown>>): {
  companies: PoolExtractedCompany[];
} {
  return {
    companies: companies
      .map(item => ({
        name: String(item.name || "").trim(),
        description: String(item.description || "").trim(),
        suggestedTier: item.suggestedTier as CompetitiveTierId | undefined,
        websiteUrl: String(item.websiteUrl || "").trim() || undefined,
        g2Url: String(item.g2Url || "").trim() || undefined,
        trustradiusUrl: String(item.trustradiusUrl || "").trim() || undefined,
        capterraUrl: String(item.capterraUrl || "").trim() || undefined,
        wikipediaUrl: String(item.wikipediaUrl || "").trim() || undefined,
        gartnerUrl: String(item.gartnerUrl || "").trim() || undefined,
        sourceUrls: Array.isArray(item.sourceUrls)
          ? item.sourceUrls.map(url => String(url))
          : [],
        mentionCount:
          typeof item.mentionCount === "number" ? item.mentionCount : 1,
      }))
      .filter(item => item.name),
  };
}
