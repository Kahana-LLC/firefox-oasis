import type { CompetitiveCompany } from "../services/competitiveIntelTypes.js";
import {
  BLOCKED_ENRICHMENT_HOSTS,
  classifyEnrichmentUrl,
  isBlockedEnrichmentHost,
  mergeEnrichmentUrlMaps,
  normalizeEnrichmentUrl,
  pickEnrichmentSlots,
  pickEnrichmentUrls,
} from "./competitiveIntelEnrichmentSources.js";

export {
  BLOCKED_ENRICHMENT_HOSTS,
  classifyEnrichmentUrl,
  mergeEnrichmentUrlMaps,
  normalizeEnrichmentUrl,
  pickEnrichmentSlots,
  pickEnrichmentUrls,
  enrichmentUrlsFromPoolFields,
  buildG2SearchUrl,
  enrichmentUrlLabel,
} from "./competitiveIntelEnrichmentSources.js";

export function isUsableEnrichmentUrl(url: string): boolean {
  const normalized = normalizeEnrichmentUrl(url);
  if (!normalized) {
    return false;
  }
  return !isBlockedEnrichmentHost(normalized);
}

export function pickBestWebsiteUrl(
  current: string | undefined,
  candidate: string | undefined
): string | undefined {
  const next = normalizeEnrichmentUrl(candidate || "");
  if (!next || !isUsableEnrichmentUrl(next)) {
    return current;
  }
  const classified = classifyEnrichmentUrl(next);
  if (!classified || classified.kind !== "homepage") {
    return current;
  }
  return current || next;
}

export function pickBestUrlForKind(
  kind: keyof NonNullable<CompetitiveCompany["enrichmentUrls"]>,
  current: string | undefined,
  candidate: string | undefined
): string | undefined {
  const next = normalizeEnrichmentUrl(candidate || "");
  if (!next) {
    return current;
  }
  const classified = classifyEnrichmentUrl(next);
  if (!classified || classified.kind !== kind) {
    return current;
  }
  if (!current) {
    return next;
  }
  if (kind === "g2_product" && classified.kind === "g2_product") {
    return current;
  }
  return current;
}

export function mergeCompanyEnrichmentFields(
  existing: CompetitiveCompany,
  incoming: Partial<CompetitiveCompany>
): CompetitiveCompany {
  const enrichmentUrls = mergeEnrichmentUrlMaps(
    existing.enrichmentUrls,
    incoming.enrichmentUrls
  );
  const websiteUrl = pickBestWebsiteUrl(
    existing.websiteUrl || enrichmentUrls?.homepage,
    incoming.websiteUrl || incoming.enrichmentUrls?.homepage
  );
  const mergedUrls = mergeEnrichmentUrlMaps(enrichmentUrls, {
    ...(websiteUrl ? { homepage: websiteUrl } : {}),
    ...incoming.enrichmentUrls,
  });
  return {
    ...existing,
    ...incoming,
    websiteUrl,
    enrichmentUrls: mergedUrls,
  };
}

export function buildEnrichmentUrlsForCompany(
  company: CompetitiveCompany,
  profile: import("./competitiveIntelTypes.js").EnrichmentProfile = "oasis_first"
): string[] {
  return pickEnrichmentUrls(company, undefined, profile);
}
