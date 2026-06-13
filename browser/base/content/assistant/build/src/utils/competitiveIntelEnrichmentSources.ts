import type { CompetitiveCompany } from "../services/competitiveIntelTypes.js";
import { CI_MAX_ENRICHMENT_TABS_PER_COMPANY } from "../services/competitiveIntelTypes.js";
import type { EnrichmentProfile } from "../services/competitiveIntelTypes.js";

export type EnrichmentSourceKind =
  | "homepage"
  | "g2_product"
  | "g2_search"
  | "trustradius_product"
  | "capterra_product"
  | "wikipedia_article"
  | "wikipedia_search"
  | "gartner_reviews"
  | "crunchbase_org";

export type EnrichmentSourceRisk = "low" | "medium" | "high";

export type EnrichmentLinkCandidate = {
  kind: EnrichmentSourceKind;
  url: string;
  risk: EnrichmentSourceRisk;
  cited: boolean;
};

export type EnrichmentSlot = {
  kind: EnrichmentSourceKind;
  url: string;
  label: string;
};

export const BLOCKED_ENRICHMENT_HOSTS = [
  "google.com",
  "duckduckgo.com",
  "bing.com",
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "claude.ai",
  "gemini.google.com",
  "grok.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "youtube.com",
  "linkedin.com",
];

const REVIEW_HEAVY_PRIORITY: EnrichmentSourceKind[] = [
  "homepage",
  "g2_product",
  "capterra_product",
  "wikipedia_article",
  "gartner_reviews",
  "trustradius_product",
  "g2_search",
];

const SLOT_LABELS: Record<EnrichmentSourceKind, string> = {
  homepage: "homepage",
  g2_product: "G2 product",
  g2_search: "G2 search",
  trustradius_product: "TrustRadius",
  capterra_product: "Capterra",
  wikipedia_article: "Wikipedia",
  wikipedia_search: "Wikipedia search",
  gartner_reviews: "Gartner",
  crunchbase_org: "Crunchbase",
};

function encodeQuery(value: string): string {
  return encodeURIComponent(String(value || "").trim());
}

export function normalizeEnrichmentUrl(url: string): string | null {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export function isBlockedEnrichmentHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return BLOCKED_ENRICHMENT_HOSTS.some(
      blocked => host === blocked || host.endsWith(`.${blocked}`)
    );
  } catch {
    return true;
  }
}

export function classifyEnrichmentUrl(url: string): {
  kind: EnrichmentSourceKind;
  risk: EnrichmentSourceRisk;
} | null {
  const normalized = normalizeEnrichmentUrl(url);
  if (!normalized || isBlockedEnrichmentHost(normalized)) {
    return null;
  }
  const lower = normalized.toLowerCase();

  if (/linkedin\.com/i.test(lower)) {
    return null;
  }
  if (/g2\.com\/search/i.test(lower)) {
    return { kind: "g2_search", risk: "high" };
  }
  if (/g2\.com\/products\//i.test(lower)) {
    return { kind: "g2_product", risk: "high" };
  }
  if (/trustradius\.com\/products\//i.test(lower)) {
    return { kind: "trustradius_product", risk: "low" };
  }
  if (/capterra\.com\/(software|p)\//i.test(lower)) {
    return { kind: "capterra_product", risk: "high" };
  }
  if (/wikipedia\.org\/wiki\//i.test(lower) && !/special:/i.test(lower)) {
    return { kind: "wikipedia_article", risk: "low" };
  }
  if (/wikipedia\.org\/w\/index\.php\?search=/i.test(lower)) {
    return { kind: "wikipedia_search", risk: "low" };
  }
  if (/gartner\.com\/reviews\/(product|market)\//i.test(lower)) {
    return { kind: "gartner_reviews", risk: "high" };
  }
  if (/crunchbase\.com\/organization\//i.test(lower)) {
    return { kind: "crunchbase_org", risk: "medium" };
  }
  if (
    /g2\.com|trustradius\.com|capterra\.com|crunchbase\.com|wikipedia\.org|gartner\.com/i.test(
      lower
    )
  ) {
    return null;
  }
  return { kind: "homepage", risk: "low" };
}

export function buildG2SearchUrl(companyName: string): string {
  return `https://www.g2.com/search?query=${encodeQuery(companyName)}`;
}

export function buildWikipediaSearchUrl(companyName: string): string {
  return `https://en.wikipedia.org/w/index.php?search=${encodeQuery(`${companyName} company`)}`;
}

export function enrichmentUrlLabel(kind: EnrichmentSourceKind): string {
  return SLOT_LABELS[kind] || kind;
}

export function companyToEnrichmentCandidates(
  company: CompetitiveCompany,
  cited = true
): EnrichmentLinkCandidate[] {
  const candidates: EnrichmentLinkCandidate[] = [];
  const add = (url: string | undefined, forceKind?: EnrichmentSourceKind) => {
    if (!url) return;
    const classified = classifyEnrichmentUrl(url);
    if (!classified) return;
    candidates.push({
      kind: forceKind || classified.kind,
      url: normalizeEnrichmentUrl(url)!,
      risk: classified.risk,
      cited,
    });
  };

  const urls = company.enrichmentUrls || {};
  add(urls.homepage || company.websiteUrl);
  add(urls.g2_product);
  add(urls.g2_search);
  add(urls.trustradius_product);
  add(urls.capterra_product);
  add(urls.wikipedia_article);
  add(urls.gartner_reviews);
  add(urls.crunchbase_org);

  return candidates;
}

export function rankEnrichmentCandidates(
  candidates: EnrichmentLinkCandidate[],
  priority: EnrichmentSourceKind[] = REVIEW_HEAVY_PRIORITY
): EnrichmentLinkCandidate[] {
  const byKind = new Map<EnrichmentSourceKind, EnrichmentLinkCandidate>();
  for (const candidate of candidates) {
    const existing = byKind.get(candidate.kind);
    if (!existing) {
      byKind.set(candidate.kind, candidate);
      continue;
    }
    if (candidate.cited && !existing.cited) {
      byKind.set(candidate.kind, candidate);
    }
  }

  const ranked: EnrichmentLinkCandidate[] = [];
  for (const kind of priority) {
    const match = byKind.get(kind);
    if (match) {
      ranked.push(match);
      byKind.delete(kind);
    }
  }
  for (const leftover of byKind.values()) {
    ranked.push(leftover);
  }
  return ranked;
}

const OASIS_FIRST_PRIORITY: EnrichmentSourceKind[] = [
  "homepage",
  "wikipedia_article",
  "wikipedia_search",
];

export function pickEnrichmentSlots(
  company: CompetitiveCompany,
  maxSlots = CI_MAX_ENRICHMENT_TABS_PER_COMPANY,
  profile: EnrichmentProfile = "oasis_first"
): EnrichmentSlot[] {
  if (profile === "oasis_first") {
    return pickOasisFirstSlots(company, Math.min(maxSlots, 2));
  }
  return pickReviewDeepenSlots(company, maxSlots);
}

function pickOasisFirstSlots(
  company: CompetitiveCompany,
  maxSlots: number
): EnrichmentSlot[] {
  const candidates = companyToEnrichmentCandidates(company, true).filter(
    candidate =>
      candidate.kind === "homepage" ||
      candidate.kind === "wikipedia_article" ||
      candidate.kind === "wikipedia_search"
  );
  const ranked = rankEnrichmentCandidates(candidates, OASIS_FIRST_PRIORITY);
  const slots: EnrichmentSlot[] = [];
  const usedKinds = new Set<EnrichmentSourceKind>();
  const usedUrls = new Set<string>();

  for (const candidate of ranked) {
    if (slots.length >= maxSlots) break;
    if (usedKinds.has(candidate.kind) || usedUrls.has(candidate.url)) continue;
    slots.push({
      kind: candidate.kind,
      url: candidate.url,
      label: enrichmentUrlLabel(candidate.kind),
    });
    usedKinds.add(candidate.kind);
    usedUrls.add(candidate.url);
  }

  const hasHomepage = slots.some(slot => slot.kind === "homepage");
  if (slots.length < maxSlots && !hasHomepage && company.websiteUrl) {
    const classified = classifyEnrichmentUrl(company.websiteUrl);
    if (classified?.kind === "homepage") {
      slots.unshift({
        kind: "homepage",
        url: normalizeEnrichmentUrl(company.websiteUrl)!,
        label: enrichmentUrlLabel("homepage"),
      });
    }
  }

  const hasWikipedia = slots.some(
    slot =>
      slot.kind === "wikipedia_article" || slot.kind === "wikipedia_search"
  );
  if (slots.length < maxSlots && !hasWikipedia) {
    const wikiSearch = buildWikipediaSearchUrl(company.name);
    slots.push({
      kind: "wikipedia_search",
      url: wikiSearch,
      label: enrichmentUrlLabel("wikipedia_search"),
    });
  }

  return slots.slice(0, maxSlots);
}

function pickReviewDeepenSlots(
  company: CompetitiveCompany,
  maxSlots: number
): EnrichmentSlot[] {
  const candidates = companyToEnrichmentCandidates(company, true);
  const ranked = rankEnrichmentCandidates(candidates);
  const slots: EnrichmentSlot[] = [];
  const usedKinds = new Set<EnrichmentSourceKind>();
  const usedUrls = new Set<string>();

  for (const candidate of ranked) {
    if (slots.length >= maxSlots) break;
    if (candidate.kind === "g2_search") continue;
    if (usedKinds.has(candidate.kind) || usedUrls.has(candidate.url)) continue;
    slots.push({
      kind: candidate.kind,
      url: candidate.url,
      label: enrichmentUrlLabel(candidate.kind),
    });
    usedKinds.add(candidate.kind);
    usedUrls.add(candidate.url);
  }

  const hasG2Product = slots.some(slot => slot.kind === "g2_product");
  if (slots.length < maxSlots && !hasG2Product && !usedKinds.has("g2_search")) {
    const g2Search = buildG2SearchUrl(company.name);
    slots.push({
      kind: "g2_search",
      url: g2Search,
      label: enrichmentUrlLabel("g2_search"),
    });
    usedKinds.add("g2_search");
    usedUrls.add(g2Search);
  }

  const hasWikipedia = slots.some(
    slot =>
      slot.kind === "wikipedia_article" || slot.kind === "wikipedia_search"
  );
  if (slots.length < maxSlots && !hasWikipedia) {
    const wikiSearch = buildWikipediaSearchUrl(company.name);
    slots.push({
      kind: "wikipedia_search",
      url: wikiSearch,
      label: enrichmentUrlLabel("wikipedia_search"),
    });
  }

  return slots.slice(0, maxSlots);
}

export function pickEnrichmentUrls(
  company: CompetitiveCompany,
  maxSlots = CI_MAX_ENRICHMENT_TABS_PER_COMPANY,
  profile: EnrichmentProfile = "oasis_first"
): string[] {
  return pickEnrichmentSlots(company, maxSlots, profile).map(slot => slot.url);
}

export function mergeEnrichmentUrlMaps(
  current: CompetitiveCompany["enrichmentUrls"],
  patch: CompetitiveCompany["enrichmentUrls"]
): CompetitiveCompany["enrichmentUrls"] {
  const merged = { ...(current || {}) };
  if (!patch) return merged;
  for (const [kind, url] of Object.entries(patch)) {
    if (!url) continue;
    const classified = classifyEnrichmentUrl(url);
    if (!classified) continue;
    const key = classified.kind as keyof NonNullable<
      CompetitiveCompany["enrichmentUrls"]
    >;
    if (
      key === "g2_product" ||
      key === "g2_search" ||
      key === "homepage" ||
      key === "trustradius_product" ||
      key === "capterra_product" ||
      key === "wikipedia_article" ||
      key === "wikipedia_search" ||
      key === "gartner_reviews" ||
      key === "crunchbase_org"
    ) {
      const existing = merged[key];
      if (!existing) {
        merged[key] = normalizeEnrichmentUrl(url)!;
      }
    }
  }
  return merged;
}

export function enrichmentUrlsFromPoolFields(company: {
  websiteUrl?: string;
  g2Url?: string;
  trustradiusUrl?: string;
  capterraUrl?: string;
  wikipediaUrl?: string;
  gartnerUrl?: string;
}): CompetitiveCompany["enrichmentUrls"] {
  const map: NonNullable<CompetitiveCompany["enrichmentUrls"]> = {};
  const add = (url: string | undefined) => {
    if (!url) return;
    const classified = classifyEnrichmentUrl(url);
    if (!classified) return;
    const key = classified.kind;
    if (key === "g2_search") {
      return;
    }
    if (
      key === "homepage" ||
      key === "g2_product" ||
      key === "trustradius_product" ||
      key === "capterra_product" ||
      key === "wikipedia_article" ||
      key === "wikipedia_search" ||
      key === "gartner_reviews" ||
      key === "crunchbase_org"
    ) {
      map[key] = normalizeEnrichmentUrl(url)!;
    }
  };
  add(company.websiteUrl);
  add(company.g2Url);
  add(company.trustradiusUrl);
  add(company.capterraUrl);
  add(company.wikipediaUrl);
  add(company.gartnerUrl);
  return Object.keys(map).length > 0 ? map : undefined;
}

export function hostKeyForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function hostOpenPriority(url: string): number {
  const classified = classifyEnrichmentUrl(url);
  if (!classified) return 99;
  switch (classified.kind) {
    case "homepage":
      return 0;
    case "g2_product":
    case "g2_search":
      return 1;
    case "trustradius_product":
    case "capterra_product":
      return 2;
    case "wikipedia_article":
    case "wikipedia_search":
      return 3;
    case "gartner_reviews":
    case "crunchbase_org":
      return 4;
    default:
      return 4;
  }
}
