import type { TabDigest } from "../services/researchBriefTypes.js";
import type { CompetitiveCompany } from "../services/competitiveIntelTypes.js";
import {
  classifyEnrichmentUrl,
  mergeEnrichmentUrlMaps,
  normalizeEnrichmentUrl,
} from "./competitiveIntelEnrichmentSources.js";

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"\]]+/gi;

const KNOWN_HOST_RE =
  /(?:g2\.com\/products\/|trustradius\.com\/products\/|capterra\.com\/(?:software|p)\/|wikipedia\.org\/wiki\/|gartner\.com\/reviews\/(?:product|market)\/|crunchbase\.com\/organization\/)/i;

function normalizeCompanyNeedle(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co)\b\.?/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function trimTrailingUrlPunctuation(url: string): string {
  let result = url.replace(/[.,;:!?]+$/g, "");
  while (result.endsWith(")")) {
    const open = (result.match(/\(/g) || []).length;
    const close = (result.match(/\)/g) || []).length;
    if (close > open) {
      result = result.slice(0, -1);
    } else {
      break;
    }
  }
  return result;
}

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_IN_TEXT_RE) || [];
  const cleaned = matches.map(raw => trimTrailingUrlPunctuation(raw.trim()));
  const seen = new Set<string>();
  return cleaned.filter(url => {
    const normalized = normalizeEnrichmentUrl(url);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function isKnownEnrichmentHost(url: string): boolean {
  return KNOWN_HOST_RE.test(url) || Boolean(classifyEnrichmentUrl(url));
}

function proximityScore(
  text: string,
  companyName: string,
  urlIndex: number
): number {
  const needle = normalizeCompanyNeedle(companyName);
  if (!needle) return 0;
  const tokens = needle.split(/\s+/).filter(Boolean);
  const windowStart = Math.max(0, urlIndex - 180);
  const windowEnd = Math.min(text.length, urlIndex + 220);
  const window = text.slice(windowStart, windowEnd).toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (window.includes(token)) {
      score += token.length;
    }
  }
  if (window.includes(needle)) {
    score += needle.length * 2;
  }
  return score;
}

export function harvestUrlsForCompanyFromDigests(
  companyName: string,
  digests: TabDigest[]
): CompetitiveCompany["enrichmentUrls"] {
  const candidates: Array<{ url: string; score: number }> = [];

  for (const digest of digests) {
    const text = `${digest.title || ""}\n${digest.content || ""}`;
    const urls = extractUrlsFromText(text);
    for (const url of urls) {
      if (!isKnownEnrichmentHost(url)) {
        continue;
      }
      const index = text.indexOf(url);
      const score = proximityScore(text, companyName, index >= 0 ? index : 0);
      if (score <= 0) {
        continue;
      }
      candidates.push({ url, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  let merged: CompetitiveCompany["enrichmentUrls"];
  for (const candidate of candidates) {
    const classified = classifyEnrichmentUrl(candidate.url);
    if (!classified || classified.kind === "g2_search") {
      continue;
    }
    const key = classified.kind;
    if (
      key === "homepage" ||
      key === "g2_product" ||
      key === "trustradius_product" ||
      key === "capterra_product" ||
      key === "wikipedia_article" ||
      key === "gartner_reviews" ||
      key === "crunchbase_org"
    ) {
      merged = mergeEnrichmentUrlMaps(merged, { [key]: candidate.url });
    }
  }
  return merged;
}

export function applyHarvestedUrlsToCompanies(
  companies: CompetitiveCompany[],
  digests: TabDigest[]
): CompetitiveCompany[] {
  return companies.map(company => {
    const harvested = harvestUrlsForCompanyFromDigests(company.name, digests);
    const enrichmentUrls = mergeEnrichmentUrlMaps(
      company.enrichmentUrls,
      harvested
    );
    return {
      ...company,
      enrichmentUrls,
      websiteUrl: enrichmentUrls?.homepage || company.websiteUrl,
    };
  });
}
