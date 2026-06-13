import type { CompetitiveCompany } from "../services/competitiveIntelTypes.js";
import type { EnrichmentSourceKind } from "./competitiveIntelEnrichmentSources.js";
import {
  classifyEnrichmentUrl,
  mergeEnrichmentUrlMaps,
  normalizeEnrichmentUrl,
} from "./competitiveIntelEnrichmentSources.js";

const KIND_ALIASES: Record<string, EnrichmentSourceKind> = {
  website: "homepage",
  homepage: "homepage",
  g2: "g2_product",
  g2product: "g2_product",
  trustradius: "trustradius_product",
  capterra: "capterra_product",
  wikipedia: "wikipedia_article",
  gartner: "gartner_reviews",
  crunchbase: "crunchbase_org",
};

export type UrlOverrideCommand = {
  companyName: string;
  kind: EnrichmentSourceKind;
  url: string;
};

function resolveKindAlias(raw: string): EnrichmentSourceKind | null {
  const key = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return KIND_ALIASES[key] || null;
}

function findCompany(
  companies: CompetitiveCompany[],
  needle: string
): CompetitiveCompany | undefined {
  const lower = needle.trim().toLowerCase();
  return companies.find(
    company =>
      company.name.toLowerCase() === lower ||
      company.name.toLowerCase().includes(lower) ||
      lower.includes(company.name.toLowerCase())
  );
}

export function parseUrlOverrideFromText(
  text: string
): UrlOverrideCommand | null {
  const input = String(text || "").trim();
  const setMatch = input.match(
    /\bset\s+(.+?)\s+(website|homepage|g2|g2product|trustradius|capterra|wikipedia|gartner|crunchbase)\s+to\s+(https?:\/\/\S+)/i
  );
  if (setMatch?.[1] && setMatch?.[2] && setMatch?.[3]) {
    const kind = resolveKindAlias(setMatch[2]);
    const url = normalizeEnrichmentUrl(setMatch[3]);
    if (!kind || !url) return null;
    return { companyName: setMatch[1].trim(), kind, url };
  }

  const addMatch = input.match(
    /\badd\s+(website|homepage|g2|g2product|trustradius|capterra|wikipedia|gartner|crunchbase)\s+for\s+(.+?):\s*(https?:\/\/\S+)/i
  );
  if (addMatch?.[1] && addMatch?.[2] && addMatch?.[3]) {
    const kind = resolveKindAlias(addMatch[1]);
    const url = normalizeEnrichmentUrl(addMatch[3]);
    if (!kind || !url) return null;
    return { companyName: addMatch[2].trim(), kind, url };
  }

  return null;
}

export function applyUrlOverrideToCompanies(
  companies: CompetitiveCompany[],
  command: UrlOverrideCommand
): CompetitiveCompany[] {
  const company = findCompany(companies, command.companyName);
  if (!company) {
    return companies;
  }
  const classified = classifyEnrichmentUrl(command.url);
  const kind = classified?.kind === command.kind ? command.kind : command.kind;
  if (
    kind !== "homepage" &&
    kind !== "g2_product" &&
    kind !== "trustradius_product" &&
    kind !== "capterra_product" &&
    kind !== "wikipedia_article" &&
    kind !== "wikipedia_search" &&
    kind !== "gartner_reviews" &&
    kind !== "crunchbase_org"
  ) {
    return companies;
  }

  return companies.map(item => {
    if (item.name !== company.name) {
      return item;
    }
    const enrichmentUrls = mergeEnrichmentUrlMaps(item.enrichmentUrls, {
      [kind]: command.url,
    });
    return {
      ...item,
      enrichmentUrls,
      websiteUrl:
        kind === "homepage"
          ? command.url
          : item.websiteUrl || enrichmentUrls?.homepage,
    };
  });
}

export function looksLikeUrlOverrideText(text: string): boolean {
  return Boolean(parseUrlOverrideFromText(text));
}
