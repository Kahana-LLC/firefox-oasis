import { getChromeContext } from "./firefoxFacade.js";
import { openTrustedLinksInBackground } from "./competitiveIntelDiscovery.js";
import type {
  CompetitiveCompany,
  EnrichmentPlanEntry,
  EnrichmentProfile,
} from "./competitiveIntelTypes.js";
import {
  CI_ENRICHMENT_BATCH_DELAY_MS,
  CI_ENRICHMENT_BATCH_SIZE,
  CI_ENRICHMENT_G2_BATCH_DELAY_MS,
  CI_ENRICHMENT_LARGE_TAB_THRESHOLD,
  CI_TAB_GROUP_PREFIX,
  DEFAULT_ENRICHMENT_PROFILE,
} from "./competitiveIntelTypes.js";
import { tierIdToLabel } from "./competitiveIntelWorkflow.js";
import {
  buildEnrichmentUrlsForCompany,
  pickEnrichmentSlots,
} from "../utils/competitiveIntelCompanyUrls.js";
import {
  hostKeyForUrl,
  hostOpenPriority,
} from "../utils/competitiveIntelEnrichmentSources.js";
import { findUnhealthyOpenedTabs } from "./competitiveIntelTabHealth.js";

export function buildEnrichmentUrls(
  company: CompetitiveCompany,
  profile: EnrichmentProfile = DEFAULT_ENRICHMENT_PROFILE
): string[] {
  return buildEnrichmentUrlsForCompany(company, profile);
}

export function buildEnrichmentPlan(
  companies: CompetitiveCompany[],
  profile: EnrichmentProfile = DEFAULT_ENRICHMENT_PROFILE
): EnrichmentPlanEntry[] {
  return companies.map(company => ({
    companyName: company.name,
    tier: company.tier,
    urls: buildEnrichmentUrls(company, profile),
    tabIds: [],
  }));
}

function tabMatchesEnrichmentUrl(tabUrl: string, expectedUrl: string): boolean {
  if (!tabUrl || !expectedUrl) {
    return false;
  }
  if (tabUrl === expectedUrl) {
    return true;
  }
  try {
    const tab = new URL(tabUrl);
    const expected = new URL(expectedUrl);
    if (
      tab.hostname === expected.hostname &&
      tab.pathname === expected.pathname
    ) {
      return true;
    }
    if (
      expected.hostname.includes("g2.com") &&
      tab.hostname.includes("g2.com")
    ) {
      return true;
    }
    if (
      expected.hostname.includes("wikipedia.org") &&
      tab.hostname.includes("wikipedia.org")
    ) {
      return true;
    }
    if (
      expected.hostname.includes("gartner.com") &&
      tab.hostname.includes("gartner.com")
    ) {
      return true;
    }
    if (
      expected.hostname.includes("trustradius.com") &&
      tab.hostname.includes("trustradius.com")
    ) {
      return true;
    }
    if (
      expected.hostname.includes("capterra.com") &&
      tab.hostname.includes("capterra.com")
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function buildHostAwareEnrichmentBatches(
  plan: EnrichmentPlanEntry[],
  batchSize = CI_ENRICHMENT_BATCH_SIZE,
  profile: EnrichmentProfile = DEFAULT_ENRICHMENT_PROFILE
): string[][] {
  const urls = [
    ...new Set(plan.flatMap(entry => entry.urls).filter(Boolean)),
  ].sort((a, b) => hostOpenPriority(a) - hostOpenPriority(b));

  const effectiveBatchSize =
    profile === "review_deepen" ? Math.min(batchSize, 2) : batchSize;

  const batches: string[][] = [];
  let remaining = urls;
  while (remaining.length > 0) {
    const batch: string[] = [];
    const usedHosts = new Set<string>();
    const deferred: string[] = [];
    for (const url of remaining) {
      const host = hostKeyForUrl(url);
      const isG2 = host.includes("g2.com");
      const hostLimit =
        profile === "review_deepen" && isG2
          ? usedHosts.has(host)
          : usedHosts.has(host);
      if (batch.length < effectiveBatchSize && !hostLimit) {
        batch.push(url);
        usedHosts.add(host);
      } else {
        deferred.push(url);
      }
    }
    if (batch.length === 0 && deferred.length > 0) {
      batch.push(deferred.shift()!);
    }
    batches.push(batch);
    remaining = deferred;
  }
  return batches;
}

export function resolveEnrichmentBatchSize(totalUrls: number): number {
  return totalUrls > CI_ENRICHMENT_LARGE_TAB_THRESHOLD
    ? CI_ENRICHMENT_BATCH_SIZE
    : Math.min(CI_ENRICHMENT_BATCH_SIZE, 4);
}

export function getEnrichmentBatch(
  plan: EnrichmentPlanEntry[],
  batchIndex: number,
  batchSize = CI_ENRICHMENT_BATCH_SIZE
): { entries: EnrichmentPlanEntry[]; urls: string[]; done: boolean } {
  const batches = buildHostAwareEnrichmentBatches(plan, batchSize);
  const urls = batches[batchIndex] || [];
  return {
    entries: plan,
    urls,
    done: batchIndex + 1 >= batches.length,
  };
}

export function openEnrichmentBatch(urls: string[]): string[] {
  const { topWin } = getChromeContext();
  return openTrustedLinksInBackground(topWin, urls, urls.length);
}

export function assignEnrichmentTabsToPlan(
  plan: EnrichmentPlanEntry[],
  openedUrls: string[]
): EnrichmentPlanEntry[] {
  const { gBrowser } = getChromeContext();
  const tabs = gBrowser?.tabs || [];
  return plan.map(entry => {
    const tabIds: number[] = [];
    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index];
      const url = String(
        tab?.linkedBrowser?.currentURI?.spec ||
          tab?.linkedBrowser?.documentURI?.spec ||
          ""
      );
      if (!url) continue;
      if (
        openedUrls.includes(url) ||
        entry.urls.some(expected => tabMatchesEnrichmentUrl(url, expected))
      ) {
        tabIds.push(index + 1);
      }
    }
    return {
      ...entry,
      tabIds: [...new Set([...(entry.tabIds || []), ...tabIds])],
    };
  });
}

export function tierGroupLabel(tier: string): string {
  return `${CI_TAB_GROUP_PREFIX}${tierIdToLabel(tier)}`;
}

function batchDelayForUrl(url: string, profile: EnrichmentProfile): number {
  if (profile === "review_deepen" && /g2\.com/i.test(url)) {
    return CI_ENRICHMENT_G2_BATCH_DELAY_MS;
  }
  return CI_ENRICHMENT_BATCH_DELAY_MS;
}

export async function openAllEnrichmentBatches(
  plan: EnrichmentPlanEntry[],
  profile: EnrichmentProfile = DEFAULT_ENRICHMENT_PROFILE
): Promise<{
  plan: EnrichmentPlanEntry[];
  openedCount: number;
  batchCount: number;
  unhealthyCount: number;
}> {
  const totalUrls = plan.reduce((count, entry) => count + entry.urls.length, 0);
  const batchSize = resolveEnrichmentBatchSize(totalUrls);
  const batches = buildHostAwareEnrichmentBatches(plan, batchSize, profile);
  let currentPlan = plan;
  let openedCount = 0;
  let unhealthyCount = 0;

  for (const batch of batches) {
    if (batch.length === 0) {
      continue;
    }
    const opened = openEnrichmentBatch(batch);
    openedCount += opened.length;
    currentPlan = assignEnrichmentTabsToPlan(currentPlan, opened);
    const unhealthy = findUnhealthyOpenedTabs(opened);
    unhealthyCount += unhealthy.length;
    const delay = Math.max(
      ...batch.map(url => batchDelayForUrl(url, profile)),
      CI_ENRICHMENT_BATCH_DELAY_MS
    );
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  return {
    plan: currentPlan,
    openedCount,
    batchCount: batches.length,
    unhealthyCount,
  };
}

function formatCompanyEnrichmentLine(
  company: CompetitiveCompany,
  profile: EnrichmentProfile
): string {
  const slots = pickEnrichmentSlots(company, undefined, profile);
  if (slots.length === 0) {
    return `- ${company.name} · _(no direct URLs yet — Wikipedia search may apply)_`;
  }
  return `- ${company.name} · ${slots.map(slot => slot.label).join(" · ")}`;
}

export function buildEnrichmentProgressMarkdown(
  companies: CompetitiveCompany[],
  openedCount: number,
  batchCount: number,
  profile: EnrichmentProfile = DEFAULT_ENRICHMENT_PROFILE,
  unhealthyCount = 0
): string {
  const withWebsite = companies.filter(
    company => company.websiteUrl || company.enrichmentUrls?.homepage
  ).length;
  const withWikipedia = companies.filter(
    company =>
      company.enrichmentUrls?.wikipedia_article ||
      company.enrichmentUrls?.wikipedia_search
  ).length;

  const profileLine =
    profile === "oasis_first"
      ? "Phase 1 enrichment opens **homepage + Wikipedia** only (no G2/Capterra auto-open)."
      : "Review enrichment opens cited G2/Capterra pages with slower G2 batching.";

  const lines = [
    "## Opening enrichment tabs",
    "",
    `Opened **${openedCount}** tabs across **${batchCount}** host-aware batch${batchCount === 1 ? "" : "es"}.`,
    "",
    profileLine,
    "",
    `Coverage: **${withWebsite}** homepages, **${withWikipedia}** Wikipedia (of **${companies.length}** companies).`,
    "",
  ];

  if (unhealthyCount > 0) {
    lines.push(
      `**${unhealthyCount}** tab(s) looked unhealthy (404, verification, or bot-check) and will be skipped during synthesis.`,
      ""
    );
  }

  lines.push(
    "Login-walled or bot-check pages are marked **skipped** during synthesis; confidence is downgraded accordingly.",
    ""
  );

  for (const tier of ["high", "medium", "low", "adjacent"] as const) {
    const group = companies.filter(company => company.tier === tier);
    if (group.length === 0) {
      continue;
    }
    const label = tier.charAt(0).toUpperCase() + tier.slice(1);
    lines.push(`### ${label}`);
    for (const company of group) {
      lines.push(formatCompanyEnrichmentLine(company, profile));
    }
    lines.push("");
  }

  if (openedCount === 0) {
    lines.push(
      "I could not open enrichment tabs in this browser window. Try `open https://www.g2.com` in Oasis to verify tab opening works, then say **continue** to retry."
    );
  } else {
    lines.push(
      "Review the enrichment tabs when ready, then click **Group tabs & generate report** below."
    );
  }

  return lines.join("\n");
}
