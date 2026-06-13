import { buildTrustedUserIntentBlock } from "../utils/untrustedContent.js";
import type { CompetitiveTierId } from "../services/competitiveIntelTypes.js";

export const POOL_GENERATION_SYSTEM_PROMPT = [
  "You are a competitive intelligence analyst.",
  "Generate a competitor pool for the given industry using your knowledge.",
  "Return only valid JSON matching the schema.",
  "Use well-known company names. Include official website URLs only when confident.",
  "Include Wikipedia article URLs only when a clear en.wikipedia.org/wiki article exists.",
  "Do not invent G2, Capterra, Gartner, or LinkedIn URLs.",
  "Map market leaders to high, challengers to medium, niche to low, adjacent entrants to adjacent.",
].join("\n");

export const POOL_GENERATION_CONFIG = {
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
            wikipediaUrl: { type: "string" },
          },
          required: ["name", "description", "suggestedTier"],
        },
      },
    },
    required: ["companies"],
  },
};

export type GeneratedPoolCompany = {
  name: string;
  description?: string;
  suggestedTier?: CompetitiveTierId;
  websiteUrl?: string;
  wikipediaUrl?: string;
};

export function buildPoolGenerationUserMessage(params: {
  industry: string;
  focus?: string;
  maxCompetitors: number;
}): string {
  return [
    buildTrustedUserIntentBlock({
      industry: params.industry,
      focus: params.focus || "",
      maxCompetitors: params.maxCompetitors,
    }),
    `List up to ${params.maxCompetitors} key players and secondary/adjacent companies.`,
    "Group into market leaders (high), strong challengers (medium), niche players (low), and adjacent entrants (adjacent).",
    "For each: company name, one-line description, suggestedTier, websiteUrl (homepage), wikipediaUrl (if known).",
  ].join("\n\n");
}

export function parsePoolGenerationResult(response: unknown): {
  companies: GeneratedPoolCompany[];
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
    return normalizeGeneratedCompanies(
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
    return normalizeGeneratedCompanies(parsed.companies);
  } catch {
    return null;
  }
}

function normalizeGeneratedCompanies(
  companies: Array<Record<string, unknown>>
): { companies: GeneratedPoolCompany[] } {
  return {
    companies: companies
      .map(item => ({
        name: String(item.name || "").trim(),
        description: String(item.description || "").trim(),
        suggestedTier: item.suggestedTier as CompetitiveTierId | undefined,
        websiteUrl: String(item.websiteUrl || "").trim() || undefined,
        wikipediaUrl: String(item.wikipediaUrl || "").trim() || undefined,
      }))
      .filter(item => item.name),
  };
}
