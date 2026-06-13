import { getChromeContext, getTabs, tabUrl } from "./firefoxFacade.js";
import type { EnrichmentPlanEntry } from "./competitiveIntelTypes.js";
import { tierGroupLabel } from "./competitiveIntelEnrichment.js";

export type TierGroupResult = {
  tier: string;
  groupLabel: string;
  tabCount: number;
  companies: string[];
};

export function createCompetitiveIntelTabGroups(
  plan: EnrichmentPlanEntry[]
): { ok: true; groups: TierGroupResult[] } | { ok: false; message: string } {
  const { gBrowser } = getChromeContext();
  if (!gBrowser?.addTabGroup) {
    return {
      ok: false,
      message: "Tab groups are not available in this window.",
    };
  }

  const tabs = getTabs(gBrowser);
  const tierBuckets = new Map<string, EnrichmentPlanEntry[]>();
  for (const entry of plan) {
    const tier = String(entry.tier || "medium");
    const bucket = tierBuckets.get(tier) || [];
    bucket.push(entry);
    tierBuckets.set(tier, bucket);
  }

  const groups: TierGroupResult[] = [];
  for (const [tier, entries] of tierBuckets.entries()) {
    const tabSet = new Set<number>();
    for (const entry of entries) {
      for (const tabId of entry.tabIds || []) {
        tabSet.add(tabId);
      }
      const companyNeedle = entry.companyName.toLowerCase();
      tabs.forEach((tab, index) => {
        const hay = `${tabUrl(tab)}`.toLowerCase();
        if (
          hay.includes(companyNeedle.replace(/\s+/g, "")) ||
          hay.includes(companyNeedle)
        ) {
          tabSet.add(index + 1);
        }
      });
    }
    const groupTabs = [...tabSet].map(id => tabs[id - 1]).filter(Boolean);
    if (groupTabs.length === 0) {
      continue;
    }
    const label = tierGroupLabel(tier);
    gBrowser.addTabGroup(groupTabs, { label });
    groups.push({
      tier,
      groupLabel: label,
      tabCount: groupTabs.length,
      companies: entries.map(entry => entry.companyName),
    });
  }

  if (groups.length === 0) {
    return {
      ok: false,
      message:
        "I could not match enrichment tabs to competitors for grouping. Open a few company pages, then say continue.",
    };
  }

  return { ok: true, groups };
}

export function buildGroupPreviewMarkdown(groups: TierGroupResult[]): string {
  const lines = ["## Tab groups created", ""];
  for (const group of groups) {
    lines.push(
      `- **${group.groupLabel}** — ${group.tabCount} tab(s): ${group.companies.join(", ")}`
    );
  }
  lines.push(
    "",
    "Click **Create tab groups** below when you are ready to organize enrichment tabs and generate your report."
  );
  return lines.join("\n");
}
