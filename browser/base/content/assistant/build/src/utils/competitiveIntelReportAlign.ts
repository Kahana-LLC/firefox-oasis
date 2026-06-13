import type { CompetitiveIntelReport } from "../services/competitiveIntelTypes.js";
import type { TabDigest } from "../services/researchBriefTypes.js";

function normalizeForMatch(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizeDigestUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`;
  } catch {
    return String(url || "")
      .trim()
      .toLowerCase();
  }
}

export function normalizeCompanyKey(name: string): string {
  return normalizeForMatch(name)
    .replace(/\b(inc|llc|ltd|corp|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function buildDigestUrlIndex(digests: TabDigest[]): {
  normalizedToCanonical: Map<string, string>;
  canonicalUrls: Set<string>;
} {
  const normalizedToCanonical = new Map<string, string>();
  for (const digest of digests) {
    normalizedToCanonical.set(normalizeDigestUrl(digest.url), digest.url);
  }
  return {
    normalizedToCanonical,
    canonicalUrls: new Set(digests.map(digest => digest.url)),
  };
}

export function resolveDigestUrl(
  url: string,
  index: ReturnType<typeof buildDigestUrlIndex>
): string | null {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    return null;
  }
  if (index.canonicalUrls.has(trimmed)) {
    return trimmed;
  }
  const normalized = normalizeDigestUrl(trimmed);
  const direct = index.normalizedToCanonical.get(normalized);
  if (direct) {
    return direct;
  }
  for (const [digestNorm, canonical] of index.normalizedToCanonical) {
    if (digestNorm.includes(normalized) || normalized.includes(digestNorm)) {
      return canonical;
    }
  }
  return null;
}

export function resolveAllowedCompanyName(
  name: string,
  allowedCompanies: string[]
): string | null {
  const key = normalizeCompanyKey(name);
  if (!key) {
    return null;
  }
  for (const candidate of allowedCompanies) {
    const candidateKey = normalizeCompanyKey(candidate);
    if (
      key === candidateKey ||
      key.includes(candidateKey) ||
      candidateKey.includes(key)
    ) {
      return candidate;
    }
  }
  return null;
}

export function quoteMatchesDigestContent(
  quote: string,
  digests: TabDigest[]
): boolean {
  const normalized = normalizeForMatch(quote);
  if (!normalized || normalized.length < 8) {
    return true;
  }
  if (
    digests.some(digest =>
      normalizeForMatch(digest.content).includes(normalized)
    )
  ) {
    return true;
  }
  const words = normalized.split(" ").filter(word => word.length >= 4);
  if (words.length === 0) {
    return true;
  }
  return digests.some(digest => {
    const hay = normalizeForMatch(digest.content);
    const matched = words.filter(word => hay.includes(word)).length;
    return matched / words.length >= 0.6;
  });
}

function resolveUrlList(
  urls: string[] | undefined,
  index: ReturnType<typeof buildDigestUrlIndex>
): string[] {
  const resolved = (urls || [])
    .map(url => resolveDigestUrl(url, index))
    .filter((url): url is string => Boolean(url));
  return [...new Set(resolved)];
}

export function alignCompetitiveIntelReport(
  report: CompetitiveIntelReport,
  digests: TabDigest[],
  allowedCompanies: string[]
): CompetitiveIntelReport {
  const index = buildDigestUrlIndex(digests);
  const competitors = (report.competitors || []).map(competitor => {
    const resolvedName =
      resolveAllowedCompanyName(competitor.name, allowedCompanies) ||
      competitor.name;
    return {
      ...competitor,
      name: resolvedName,
      sourceUrls: resolveUrlList(competitor.sourceUrls, index),
      quotes: (competitor.quotes || []).filter(quote =>
        quoteMatchesDigestContent(quote, digests)
      ),
    };
  });

  const sources = (report.sources || [])
    .map(source => {
      const resolvedUrl = resolveDigestUrl(source.url, index);
      if (!resolvedUrl) {
        return null;
      }
      return {
        ...source,
        url: resolvedUrl,
        quotes: (source.quotes || []).filter(quote =>
          quoteMatchesDigestContent(quote.text, digests)
        ),
      };
    })
    .filter((source): source is NonNullable<typeof source> => Boolean(source));

  const cells = (report.comparisonMatrix?.cells || []).map(cell => ({
    ...cell,
    competitor:
      resolveAllowedCompanyName(cell.competitor, allowedCompanies) ||
      cell.competitor,
    sourceUrls: resolveUrlList(cell.sourceUrls, index),
  }));

  return {
    ...report,
    competitors,
    sources,
    comparisonMatrix: {
      dimensions: report.comparisonMatrix?.dimensions || [],
      cells,
    },
  };
}
