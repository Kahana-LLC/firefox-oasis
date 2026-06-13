import { assistRemote } from "../proxyClient.js";
import { syncSubscriptionFromAssistResponse } from "./syncAssistUsage.js";
import { extractTabDigests } from "./researchBrief.js";
import {
  getChromeContext,
  getTabs,
  normalizeName,
  tabUrl,
} from "./firefoxFacade.js";
import type { BrowserTabLike } from "../types/runtime.js";
import type { TabDigest } from "./researchBriefTypes.js";
import type {
  CompetitiveCompany,
  CompetitiveTierId,
} from "./competitiveIntelTypes.js";
import { DEFAULT_COMPETITIVE_TIERS } from "./competitiveIntelTypes.js";
import {
  mergeCompanyEnrichmentFields,
  enrichmentUrlsFromPoolFields,
} from "../utils/competitiveIntelCompanyUrls.js";
import { applyHarvestedUrlsToCompanies } from "../utils/competitiveIntelUrlHarvest.js";
import { isDiscoveryToolUrl } from "./competitiveIntelDiscovery.js";
import {
  POOL_EXTRACTION_CONFIG,
  POOL_EXTRACTION_SYSTEM_PROMPT,
  buildPoolExtractionUserMessage,
  parsePoolExtractionResult,
  type PoolExtractedCompany,
} from "../prompts/competitiveIntelPoolPrompt.js";
import {
  POOL_GENERATION_CONFIG,
  POOL_GENERATION_SYSTEM_PROMPT,
  buildPoolGenerationUserMessage,
  parsePoolGenerationResult,
  type GeneratedPoolCompany,
} from "../prompts/competitiveIntelPoolGenerationPrompt.js";

function levenshtein(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return 0;
  const matrix: number[][] = Array.from({ length: left.length + 1 }, (_, i) =>
    Array.from({ length: right.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[left.length][right.length];
}

function normalizeCompanyName(name: string): string {
  return normalizeName(name)
    .replace(/\b(inc|llc|ltd|corp|co)\b\.?/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeCompanies(
  companies: CompetitiveCompany[],
  maxCompetitors: number
): CompetitiveCompany[] {
  const merged: CompetitiveCompany[] = [];
  for (const company of companies) {
    const normalized = normalizeCompanyName(company.name);
    if (!normalized) continue;
    const existing = merged.find(
      item =>
        normalizeCompanyName(item.name) === normalized ||
        levenshtein(normalizeCompanyName(item.name), normalized) <= 2
    );
    if (existing) {
      existing.mentionCount += company.mentionCount || 1;
      existing.sourceUrls = [
        ...new Set([...existing.sourceUrls, ...company.sourceUrls]),
      ];
      if (!existing.description && company.description) {
        existing.description = company.description;
      }
      if (company.suggestedTier && !existing.suggestedTier) {
        existing.suggestedTier = company.suggestedTier;
      }
      const merged = mergeCompanyEnrichmentFields(existing, company);
      Object.assign(existing, merged);
      continue;
    }
    merged.push({
      ...company,
      normalizedName: normalized,
      mentionCount: company.mentionCount || 1,
    });
  }
  return merged
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, maxCompetitors);
}

function poolCompanyFromFields(
  company: PoolExtractedCompany | GeneratedPoolCompany,
  mentionCount = 1
): CompetitiveCompany {
  const enrichmentUrls = enrichmentUrlsFromPoolFields({
    websiteUrl: company.websiteUrl,
    wikipediaUrl: "wikipediaUrl" in company ? company.wikipediaUrl : undefined,
    g2Url: "g2Url" in company ? company.g2Url : undefined,
    capterraUrl: "capterraUrl" in company ? company.capterraUrl : undefined,
    gartnerUrl: "gartnerUrl" in company ? company.gartnerUrl : undefined,
    trustradiusUrl:
      "trustradiusUrl" in company ? company.trustradiusUrl : undefined,
  });
  return {
    name: company.name,
    normalizedName: normalizeCompanyName(company.name),
    description: company.description || "",
    tier: defaultTierFromMentions(mentionCount, company.suggestedTier),
    suggestedTier: company.suggestedTier,
    websiteUrl: company.websiteUrl,
    enrichmentUrls,
    sourceUrls:
      "sourceUrls" in company && company.sourceUrls ? company.sourceUrls : [],
    mentionCount,
  };
}

export async function generateCompetitorPoolViaAssist(params: {
  industry: string;
  focus?: string;
  maxCompetitors: number;
  signal?: AbortSignal;
}): Promise<
  { ok: true; companies: CompetitiveCompany[] } | { ok: false; message: string }
> {
  const response = await assistRemote(
    POOL_GENERATION_SYSTEM_PROMPT,
    [
      {
        role: "user",
        content: buildPoolGenerationUserMessage({
          industry: params.industry,
          focus: params.focus,
          maxCompetitors: params.maxCompetitors,
        }),
      },
    ],
    ["chat"],
    [],
    POOL_GENERATION_CONFIG,
    undefined,
    params.signal
  );
  syncSubscriptionFromAssistResponse(response);

  const content = (response as { content?: unknown }).content;
  const parsed = parsePoolGenerationResult(content);
  if (!parsed?.companies?.length) {
    return {
      ok: false,
      message:
        "I could not generate a competitor pool for this industry. Try a more specific industry phrase and continue.",
    };
  }

  const companies = mergeCompanies(
    parsed.companies.map(company => poolCompanyFromFields(company, 1)),
    params.maxCompetitors
  );
  return { ok: true, companies };
}

export async function mergeDiscoveryIntoPool(params: {
  industry: string;
  focus?: string;
  discoveryTabIds?: number[];
  existingCompanies: CompetitiveCompany[];
  maxCompetitors: number;
  signal?: AbortSignal;
}): Promise<
  { ok: true; companies: CompetitiveCompany[] } | { ok: false; message: string }
> {
  const pool = await extractCompetitorPool({
    industry: params.industry,
    focus: params.focus,
    discoveryTabIds: params.discoveryTabIds,
    maxCompetitors: params.maxCompetitors,
    signal: params.signal,
  });
  if (!pool.ok) {
    return pool;
  }
  const merged = mergeCompanies(
    [...params.existingCompanies, ...pool.companies],
    params.maxCompetitors
  );
  return { ok: true, companies: merged };
}

function defaultTierFromMentions(
  mentionCount: number,
  suggested?: CompetitiveTierId
): CompetitiveTierId {
  if (suggested && DEFAULT_COMPETITIVE_TIERS.includes(suggested)) {
    return suggested;
  }
  if (mentionCount >= 3) return "high";
  if (mentionCount >= 2) return "medium";
  if (mentionCount >= 1) return "low";
  return "adjacent";
}

export function resolveDiscoveryTabs(
  discoveryTabIds: number[] = []
): BrowserTabLike[] {
  const { gBrowser } = getChromeContext();
  const tabs = getTabs(gBrowser);
  if (discoveryTabIds.length > 0) {
    const idSet = new Set(discoveryTabIds);
    return tabs.filter((_, index) => idSet.has(index + 1));
  }
  return tabs.filter(tab => isDiscoveryToolUrl(tabUrl(tab)));
}

export async function extractCompetitorPool(params: {
  industry: string;
  focus?: string;
  discoveryTabIds?: number[];
  maxCompetitors: number;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; companies: CompetitiveCompany[]; digests: TabDigest[] }
  | { ok: false; message: string }
> {
  const tabs = resolveDiscoveryTabs(params.discoveryTabIds);
  if (tabs.length === 0) {
    return {
      ok: false,
      message:
        "I could not find discovery tabs. Open ChatGPT, Perplexity, Claude, Gemini, or Grok and run the discovery query, then continue.",
    };
  }

  const digests = await extractTabDigests(tabs, { signal: params.signal });
  const readable = digests.filter(
    digest => digest.status === "ok" && digest.content.trim().length > 50
  );
  if (readable.length === 0) {
    return {
      ok: false,
      message:
        "Discovery tabs did not have readable content yet. Run the discovery query in the AI tools, wait for answers, then continue.",
    };
  }

  const response = await assistRemote(
    POOL_EXTRACTION_SYSTEM_PROMPT,
    [
      {
        role: "user",
        content: buildPoolExtractionUserMessage({
          industry: params.industry,
          focus: params.focus,
          digests: readable,
        }),
      },
    ],
    ["chat"],
    [],
    POOL_EXTRACTION_CONFIG
  );
  syncSubscriptionFromAssistResponse(response);

  const content = (response as { content?: unknown }).content;
  const parsed = parsePoolExtractionResult(content);
  if (!parsed?.companies?.length) {
    return {
      ok: false,
      message:
        "I could not extract a competitor list from the discovery tabs. Try rerunning the query in more AI tools, then continue.",
    };
  }

  const companies = mergeCompanies(
    parsed.companies.map(company =>
      poolCompanyFromFields(company, company.mentionCount || 1)
    ),
    params.maxCompetitors
  );

  const harvestedCompanies = applyHarvestedUrlsToCompanies(companies, readable);

  return { ok: true, companies: harvestedCompanies, digests };
}

export function buildTierPreviewMarkdown(
  companies: CompetitiveCompany[]
): string {
  const lines = ["## Proposed competitor tiers", ""];
  for (const tier of DEFAULT_COMPETITIVE_TIERS) {
    const label = tier.charAt(0).toUpperCase() + tier.slice(1);
    const group = companies.filter(company => company.tier === tier);
    lines.push(`### ${label} (${group.length})`);
    if (group.length === 0) {
      lines.push("- _(none)_");
    } else {
      for (const company of group) {
        lines.push(
          `- **${company.name}** — ${company.description || "No description"} (${company.mentionCount} mention${company.mentionCount === 1 ? "" : "s"})`
        );
      }
    }
    lines.push("");
  }
  lines.push(
    "Click **Open enrichment tabs** (or **Accept tiers & open enrichment tabs** in the workflow panel) to continue. To edit tiers: `move Soda to Low`. To fix URLs: `set Monte Carlo website to https://...`, `set Monte Carlo wikipedia to https://en.wikipedia.org/wiki/...`."
  );
  return lines.join("\n");
}
