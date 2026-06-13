import {
  getChromeContext,
  findGroupByNameFuzzy,
  getTabGroups,
  getTabs,
  tabUrl,
  tabTitle,
} from "./firefoxFacade.js";
import type { BrowserTabLike } from "../types/runtime.js";
import type { TabDigest } from "./researchBriefTypes.js";
import type {
  CompetitiveCompany,
  EnrichmentPlanEntry,
} from "./competitiveIntelTypes.js";
import {
  CI_TAB_GROUP_PREFIX,
  DEFAULT_COMPETITIVE_TIERS,
} from "./competitiveIntelTypes.js";
import { tierGroupLabel } from "./competitiveIntelEnrichment.js";

export type CiReportTabSource = "tab_groups" | "enrichment_plan";

export type CiReportTabsResolved = {
  tabs: BrowserTabLike[];
  scopeLabel: string;
  source: CiReportTabSource;
  groupLabels: string[];
};

export function resolveCompetitiveIntelTabs(plan: EnrichmentPlanEntry[]): {
  tabs: BrowserTabLike[];
  scopeLabel: string;
} {
  const { gBrowser } = getChromeContext();
  const tabs = getTabs(gBrowser);
  const tabSet = new Set<BrowserTabLike>();
  for (const entry of plan) {
    for (const tabId of entry.tabIds || []) {
      const tab = tabs[tabId - 1];
      if (tab) tabSet.add(tab);
    }
    const needle = entry.companyName.toLowerCase();
    for (const tab of tabs) {
      const url = tabUrl(tab).toLowerCase();
      if (url.includes(needle.replace(/\s+/g, "")) || url.includes(needle)) {
        tabSet.add(tab);
      }
    }
  }
  const resolved = [...tabSet];
  return {
    tabs: resolved,
    scopeLabel: `competitive intelligence (${resolved.length} enrichment tabs)`,
  };
}

export function resolveCompetitiveIntelTabGroups(tiers: string[]): {
  tabs: BrowserTabLike[];
  scopeLabel: string;
  groupLabels: string[];
} {
  const { gBrowser } = getChromeContext();
  const tabs: BrowserTabLike[] = [];
  const labels: string[] = [];
  for (const tier of tiers) {
    const label = tierGroupLabel(tier);
    const match = findGroupByNameFuzzy(gBrowser, label);
    if (match.group?.tabs?.length) {
      labels.push(label);
      tabs.push(...match.group.tabs);
    }
  }
  const unique = [...new Set(tabs)];
  return {
    tabs: unique,
    scopeLabel:
      labels.length > 0
        ? labels.join(", ")
        : "competitive intelligence tab groups",
    groupLabels: labels,
  };
}

export function resolveCompetitiveIntelTabGroupByName(groupName: string): {
  tabs: BrowserTabLike[];
  scopeLabel: string;
  groupLabels: string[];
} {
  const { gBrowser } = getChromeContext();
  const match = findGroupByNameFuzzy(gBrowser, groupName);
  if (!match.group?.tabs?.length) {
    return { tabs: [], scopeLabel: groupName, groupLabels: [] };
  }
  const label = String(match.group.label || groupName).trim();
  const tabs = [...match.group.tabs];
  return {
    tabs,
    scopeLabel: label,
    groupLabels: [label],
  };
}

export function resolveCiReportTabs(params: {
  tierLabels?: string[];
  enrichmentPlan: EnrichmentPlanEntry[];
  groupName?: string;
}): CiReportTabsResolved {
  const tiers = params.tierLabels?.length
    ? params.tierLabels
    : [...DEFAULT_COMPETITIVE_TIERS];

  if (params.groupName?.trim()) {
    const single = resolveCompetitiveIntelTabGroupByName(
      params.groupName.trim()
    );
    if (single.tabs.length > 0) {
      return {
        tabs: single.tabs,
        scopeLabel: single.scopeLabel,
        source: "tab_groups",
        groupLabels: single.groupLabels,
      };
    }
  }

  const fromGroups = resolveCompetitiveIntelTabGroups(tiers);
  if (fromGroups.tabs.length > 0) {
    return {
      tabs: fromGroups.tabs,
      scopeLabel: fromGroups.scopeLabel,
      source: "tab_groups",
      groupLabels: fromGroups.groupLabels,
    };
  }

  const fallback = resolveCompetitiveIntelTabs(params.enrichmentPlan);
  return {
    tabs: fallback.tabs,
    scopeLabel: fallback.scopeLabel,
    source: "enrichment_plan",
    groupLabels: [],
  };
}

function findCiGroupForTab(
  tab: BrowserTabLike
): { tierLabel: string; groupLabel: string } | null {
  const { gBrowser } = getChromeContext();
  for (const group of getTabGroups(gBrowser)) {
    const label = String(group.label || "").trim();
    if (!label.startsWith(CI_TAB_GROUP_PREFIX)) {
      continue;
    }
    const tabs = Array.from(group.tabs || []);
    if (!tabs.includes(tab)) {
      continue;
    }
    return { tierLabel: label, groupLabel: label };
  }
  return null;
}

function matchCompanyForDigest(
  digest: TabDigest,
  companies: CompetitiveCompany[]
): CompetitiveCompany | undefined {
  const url = digest.url.toLowerCase();
  const title = digest.title.toLowerCase();
  return companies.find(company => {
    const needle = company.name.toLowerCase();
    const compact = needle.replace(/\s+/g, "");
    return (
      url.includes(compact) ||
      url.includes(needle) ||
      title.includes(needle) ||
      title.includes(compact)
    );
  });
}

export function tagDigestsWithCiTabGroups(
  digests: TabDigest[],
  companies: CompetitiveCompany[],
  tabs: BrowserTabLike[]
): Array<TabDigest & { tierLabel?: string; companyName?: string }> {
  const tabByUrl = new Map<string, BrowserTabLike>();
  for (const tab of tabs) {
    tabByUrl.set(tabUrl(tab).toLowerCase(), tab);
  }

  return digests.map(digest => {
    const tab =
      tabByUrl.get(digest.url.toLowerCase()) ||
      tabs.find(candidate => tabUrl(candidate) === digest.url);
    const group = tab ? findCiGroupForTab(tab) : null;
    const company = matchCompanyForDigest(digest, companies);
    return {
      ...digest,
      tierLabel:
        group?.tierLabel ||
        (company ? tierGroupLabel(company.tier) : undefined),
      companyName: company?.name,
    };
  });
}

export function tagDigestsWithCompanies(
  digests: TabDigest[],
  plan: EnrichmentPlanEntry[]
): Array<TabDigest & { tierLabel?: string; companyName?: string }> {
  return digests.map(digest => {
    const url = digest.url.toLowerCase();
    const match = plan.find(entry => {
      const needle = entry.companyName.toLowerCase();
      return (
        url.includes(needle.replace(/\s+/g, "")) ||
        url.includes(needle) ||
        digest.title.toLowerCase().includes(needle)
      );
    });
    return {
      ...digest,
      tierLabel: match ? tierGroupLabel(match.tier) : undefined,
      companyName: match?.companyName,
    };
  });
}

export function inferCompaniesFromCiGroups(
  companies: CompetitiveCompany[],
  tabs: BrowserTabLike[]
): CompetitiveCompany[] {
  if (companies.length > 0) {
    return companies;
  }
  const names = new Set<string>();
  for (const tab of tabs) {
    const title = tabTitle(tab).trim();
    if (title && title.length > 2) {
      names.add(title);
    }
  }
  return [...names].slice(0, 24).map(name => ({
    name,
    normalizedName: name.toLowerCase(),
    description: "",
    tier: "medium" as const,
    sourceUrls: [
      tabUrl(tabs.find(t => tabTitle(t) === name) || tabs[0]),
    ].filter(Boolean),
    mentionCount: 1,
  }));
}
