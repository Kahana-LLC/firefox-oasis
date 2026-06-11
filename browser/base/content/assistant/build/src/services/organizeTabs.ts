import { QuotaExceededError } from "../awsSignedFetch.js";
import { isRecord } from "../assistant/messageUtils.js";
import { assistRemote } from "../proxyClient.js";
import {
  ORGANIZE_TABS_GENERATION_CONFIG,
  ORGANIZE_TABS_SYSTEM_PROMPT,
  buildOrganizeTabsUserMessage,
} from "../prompts/organizeTabsPrompt.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { formatQuotaExceededMessage } from "../utils/quotaUserMessage.js";
import { assistWithOutputValidationRetry } from "../utils/assistOutputRetry.js";
import { validateOrganizeTabsPlan } from "../utils/outputValidators.js";
import { throwIfResearchBriefAborted } from "../utils/researchBriefProgress.js";
import { extractPageContentFromTab } from "./pageContentExtract.js";
import {
  sanitizeTabCatalog,
  sanitizeUntrustedMetadata,
} from "../utils/untrustedContent.js";
import {
  previewResearchBriefScope,
  type BuildResearchBriefOptions,
} from "./researchBrief.js";
import type { ResearchScope } from "./researchBriefTypes.js";
import { subscriptionService } from "./subscription.js";
import { syncSubscriptionFromAssistResponse } from "./syncAssistUsage.js";
import { getTabs, tabTitle, tabUrl } from "./firefoxFacade.js";
import type { BrowserTabLike, GBrowserLike } from "../types/runtime.js";
import { shouldConfirmOrganizeTabsPlan } from "../utils/organizeTabsScopePreview.js";
import {
  consumeOrganizeTabsPlan,
  peekOrganizeTabsPlan,
  storeOrganizeTabsPlan,
} from "./organizeTabsPlanCache.js";
import type {
  BuildOrganizeTabsOptions,
  OrganizeTabsClusterPlan,
  OrganizeTabsMode,
  OrganizeTabsResult,
  OrganizeTabsScope,
  OrganizeTabsScopePreview,
  TabCatalogEntry,
  TabDescriptorWithIndex,
} from "./organizeTabsTypes.js";
import {
  isAmbiguousTab,
  parseOrganizeTabsClusterPlan,
  validateClusterPlan,
} from "./organizeTabsPlanUtils.js";

export {
  isAmbiguousTab,
  parseOrganizeTabsClusterPlan,
  validateClusterPlan,
} from "./organizeTabsPlanUtils.js";
import { applyRoutingStateMutation } from "../utils/deterministicRouter.js";

export const DEFAULT_MAX_GROUPS = 6;
export const DEFAULT_ORGANIZE_MAX_TABS = 40;
export const SNIPPET_MAX_CHARS = 800;
export const EXTRACT_CONCURRENCY = 3;

function tryJsonParseLoose(str: string): unknown {
  const trimmed = String(str || "").trim();
  if (!trimmed) {
    return null;
  }
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function parseAssistResponseContent(res: unknown): unknown {
  if (!isRecord(res)) {
    return null;
  }
  const content = res.content;
  if (isRecord(content)) {
    return content;
  }
  if (typeof content === "string") {
    return tryJsonParseLoose(content);
  }
  return null;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeOrganizeScope(scope: OrganizeTabsScope): ResearchScope {
  if (scope === "ungrouped_only") {
    return "window";
  }
  return scope;
}

export function buildOrganizeTabsOptionsFromArgs(
  args: Record<string, unknown>,
  gBrowser: GBrowserLike | null
): BuildOrganizeTabsOptions {
  const modeRaw = String(args.mode || "").trim();
  const mode =
    modeRaw === "single_focus" ||
    modeRaw === "multi_topic" ||
    modeRaw === "research_vs_other"
      ? (modeRaw as OrganizeTabsMode)
      : undefined;
  const scopeRaw = String(args.scope || "window").trim();
  const scope: OrganizeTabsScope =
    scopeRaw === "tab-group" ||
    scopeRaw === "tabs" ||
    scopeRaw === "ungrouped_only"
      ? scopeRaw
      : "window";

  return {
    gBrowser,
    mode,
    focus: String(args.focus || "").trim() || undefined,
    name: String(args.name || "").trim() || undefined,
    scope,
    useActiveTabGroup: args.use_active_tab_group === true,
    tabQueries: Array.isArray(args.tab_queries)
      ? (args.tab_queries as string[])
      : [],
    tabIndices: Array.isArray(args.tab_indices)
      ? (args.tab_indices as number[])
      : [],
    maxGroups:
      typeof args.max_groups === "number"
        ? args.max_groups
        : DEFAULT_MAX_GROUPS,
    maxTabs:
      typeof args.max_tabs === "number"
        ? args.max_tabs
        : DEFAULT_ORGANIZE_MAX_TABS,
    excludeIndices: Array.isArray(args.exclude_indices)
      ? (args.exclude_indices as number[])
      : [],
    excludeQueries: Array.isArray(args.exclude_queries)
      ? (args.exclude_queries as string[])
      : [],
    useSnippets: args.use_snippets !== false,
    previewConfirmed: args.preview_confirmed === true,
    confirmed: args.confirmed === true,
  };
}

function toBriefOptions(
  options: BuildOrganizeTabsOptions
): BuildResearchBriefOptions {
  return {
    gBrowser: options.gBrowser,
    scope: normalizeOrganizeScope(options.scope),
    name: options.name,
    tabQueries: options.tabQueries,
    tabIndices: options.tabIndices,
    maxTabs: options.maxTabs ?? DEFAULT_ORGANIZE_MAX_TABS,
    excludeIndices: options.excludeIndices,
    excludeQueries: options.excludeQueries,
    useActiveTabGroup: options.useActiveTabGroup,
  };
}

export function previewOrganizeTabsScope(
  options: BuildOrganizeTabsOptions
): OrganizeTabsScopePreview {
  const resolved = previewResearchBriefScope(toBriefOptions(options));
  if (!resolved.ok) {
    return resolved;
  }

  if (options.scope === "ungrouped_only") {
    const ungrouped = resolved.tabs.filter(tab => !tab.pinned && !tab.group);
    if (ungrouped.length === 0) {
      return {
        ok: false,
        message: "There are no ungrouped tabs to organize in this window.",
      };
    }
    return {
      ok: true,
      tabs: ungrouped,
      scopeLabel: "Ungrouped tabs in current window",
      tabsOmittedByLimit: resolved.tabsOmittedByLimit,
      urlsDeduplicated: resolved.urlsDeduplicated,
      usedFuzzyGroupMatch: resolved.usedFuzzyGroupMatch,
      totalBeforeCap: resolved.totalBeforeCap,
    };
  }

  return resolved;
}

export function attachWindowIndices(
  gBrowser: GBrowserLike | null | undefined,
  tabs: BrowserTabLike[]
): TabDescriptorWithIndex[] {
  const allTabs = getTabs(gBrowser);
  return tabs.map(tab => {
    const windowIndex = allTabs.indexOf(tab);
    return {
      tab,
      index: windowIndex >= 0 ? windowIndex + 1 : 0,
      title: tabTitle(tab),
      url: tabUrl(tab),
    };
  });
}

export function buildTabCatalog(
  descriptors: TabDescriptorWithIndex[]
): TabCatalogEntry[] {
  const domainCounts = new Map<string, number>();
  for (const descriptor of descriptors) {
    const domain = extractDomain(descriptor.url);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
  }

  const catalog = descriptors
    .filter(descriptor => descriptor.index >= 1)
    .map(descriptor => {
      const domain = extractDomain(descriptor.url);
      const entry: TabCatalogEntry = {
        index: descriptor.index,
        title: sanitizeUntrustedMetadata(descriptor.title),
        url: descriptor.url,
        domain,
        currentGroup: descriptor.tab.group?.label || null,
        pinned: !!descriptor.tab.pinned,
      };
      if ((domainCounts.get(domain) || 0) > 2 && isAmbiguousTab(entry)) {
        return entry;
      }
      if (isAmbiguousTab(entry)) {
        return entry;
      }
      return entry;
    });
  return sanitizeTabCatalog(catalog);
}

export async function enrichCatalogWithSnippets(
  catalog: TabCatalogEntry[],
  descriptors: TabDescriptorWithIndex[],
  options: {
    useSnippets: boolean;
    signal?: AbortSignal;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<TabCatalogEntry[]> {
  if (!options.useSnippets) {
    return catalog;
  }

  const descriptorByIndex = new Map(
    descriptors.map(descriptor => [descriptor.index, descriptor])
  );
  const ambiguousIndices = catalog
    .filter(entry => !entry.pinned && isAmbiguousTab(entry))
    .map(entry => entry.index);

  if (ambiguousIndices.length === 0) {
    return catalog;
  }

  const enriched = catalog.map(entry => ({ ...entry }));
  const byIndex = new Map(enriched.map(entry => [entry.index, entry]));
  let completed = 0;
  const total = ambiguousIndices.length;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < ambiguousIndices.length) {
      throwIfResearchBriefAborted(options.signal);
      const idx = ambiguousIndices[next++];
      const descriptor = descriptorByIndex.get(idx);
      if (!descriptor) {
        continue;
      }
      const extracted = await extractPageContentFromTab(descriptor.tab);
      const entry = byIndex.get(idx);
      if (entry && extracted.status === "ok" && extracted.content) {
        entry.snippet = sanitizeUntrustedMetadata(
          extracted.content.slice(0, SNIPPET_MAX_CHARS)
        );
      }
      completed += 1;
      options.onProgress?.(completed, total);
    }
  }

  const workers = Array.from(
    { length: Math.min(EXTRACT_CONCURRENCY, ambiguousIndices.length) },
    () => worker()
  );
  await Promise.all(workers);
  return enriched;
}

function analyzeGroupMoveImpact(tabsToMove: BrowserTabLike[]): {
  affectedGroups: string[];
  emptiedGroups: string[];
} {
  const affectedGroups = new Set<string>();
  const emptiedGroups = new Set<string>();

  for (const tab of tabsToMove) {
    const group = tab.group;
    if (!group) {
      continue;
    }
    const groupName = group.label || "(unnamed)";
    affectedGroups.add(groupName);
    const groupTabs = group.tabs || [];
    const movingTabs = groupTabs.filter(groupTab =>
      tabsToMove.includes(groupTab)
    );
    if (groupTabs.length > 0 && movingTabs.length === groupTabs.length) {
      emptiedGroups.add(groupName);
    }
  }

  return {
    affectedGroups: [...affectedGroups],
    emptiedGroups: [...emptiedGroups],
  };
}

export function tabsAffectedByPlan(
  plan: OrganizeTabsClusterPlan,
  gBrowser: GBrowserLike | null | undefined
): BrowserTabLike[] {
  const allTabs = getTabs(gBrowser);
  const tabs: BrowserTabLike[] = [];
  for (const group of plan.groups) {
    for (const idx of group.tabIndices) {
      const tab = allTabs[idx - 1];
      if (tab && !tab.pinned) {
        tabs.push(tab);
      }
    }
  }
  return tabs;
}

export function countTabsMovingFromExistingGroups(
  plan: OrganizeTabsClusterPlan,
  gBrowser: GBrowserLike | null | undefined
): number {
  return tabsAffectedByPlan(plan, gBrowser).filter(tab => !!tab.group).length;
}

export function applyOrganizeTabsPlan(
  gBrowser: GBrowserLike | null | undefined,
  plan: OrganizeTabsClusterPlan
): {
  groupsCreated: string[];
  tabsGrouped: number;
  tabsSkipped: number;
} {
  if (!gBrowser?.addTabGroup) {
    throw new Error("Tab groups are not available in this browser.");
  }

  const allTabs = getTabs(gBrowser);
  const groupsCreated: string[] = [];
  let tabsGrouped = 0;
  let tabsSkipped = 0;

  for (const groupPlan of plan.groups) {
    const tabsToGroup: BrowserTabLike[] = [];
    for (const idx of groupPlan.tabIndices) {
      const tab = allTabs[idx - 1];
      if (!tab || tab.pinned) {
        tabsSkipped += 1;
        continue;
      }
      tabsToGroup.push(tab);
    }
    if (tabsToGroup.length === 0) {
      continue;
    }
    gBrowser.addTabGroup(tabsToGroup, { label: groupPlan.name });
    groupsCreated.push(groupPlan.name);
    tabsGrouped += tabsToGroup.length;
    applyRoutingStateMutation({
      kind: "upsert",
      entity: "group",
      name: groupPlan.name,
    });
  }

  return { groupsCreated, tabsGrouped, tabsSkipped };
}

export async function clusterTabsViaAssist(params: {
  mode: OrganizeTabsMode;
  focus?: string;
  suggestedGroupName?: string;
  maxGroups: number;
  scopeLabel: string;
  catalog: TabCatalogEntry[];
  signal?: AbortSignal;
}): Promise<OrganizeTabsClusterPlan> {
  throwIfResearchBriefAborted(params.signal);
  const userMessage = buildOrganizeTabsUserMessage({
    mode: params.mode,
    focus: params.focus,
    suggestedGroupName: params.suggestedGroupName,
    maxGroups: params.maxGroups,
    scopeLabel: params.scopeLabel,
    catalog: params.catalog,
  });

  return assistWithOutputValidationRetry({
    systemPrompt: ORGANIZE_TABS_SYSTEM_PROMPT,
    userMessage,
    generationConfig: ORGANIZE_TABS_GENERATION_CONFIG,
    signal: params.signal,
    parse: raw => parseOrganizeTabsClusterPlan(raw, params.mode),
    validate: plan => validateOrganizeTabsPlan(plan, params.catalog),
    validationErrorMessage:
      "I couldn't produce a safe tab grouping plan. Please try again.",
  });
}

function inferMode(options: BuildOrganizeTabsOptions): OrganizeTabsMode {
  if (options.mode) {
    return options.mode;
  }
  if (options.focus) {
    return "single_focus";
  }
  return "multi_topic";
}

function defaultGroupName(
  options: BuildOrganizeTabsOptions
): string | undefined {
  if (options.name) {
    return options.name;
  }
  if (options.focus && options.mode !== "multi_topic") {
    return options.focus.slice(0, 40);
  }
  return undefined;
}

export async function organizeTabs(
  options: BuildOrganizeTabsOptions
): Promise<OrganizeTabsResult> {
  const report = options.onProgress;
  const mode = inferMode(options);

  try {
    report?.({ phase: "resolving", label: "Finding tabs…" });
    throwIfResearchBriefAborted(options.signal);

    const resolved = previewOrganizeTabsScope(options);
    if (!resolved.ok) {
      if (resolved.code === "ambiguous_group" && resolved.candidates) {
        return {
          ok: false,
          message: resolved.message,
          code: "ambiguous_group",
          candidates: resolved.candidates,
        };
      }
      return { ok: false, message: resolved.message };
    }

    const descriptors = attachWindowIndices(options.gBrowser, resolved.tabs);
    let catalog = buildTabCatalog(descriptors);
    if (catalog.filter(entry => !entry.pinned).length === 0) {
      return {
        ok: false,
        message:
          "There are no groupable tabs in that scope (pinned tabs are skipped).",
      };
    }

    report?.({ phase: "extracting", label: "Reading ambiguous tabs…" });
    catalog = await enrichCatalogWithSnippets(catalog, descriptors, {
      useSnippets: options.useSnippets !== false,
      signal: options.signal,
      onProgress: (current, total) =>
        report?.({
          phase: "extracting",
          current,
          total,
          label: `Reading page ${current} of ${total}…`,
        }),
    });

    report?.({ phase: "clustering", label: "Planning tab groups…" });

    let validatedPlan: OrganizeTabsClusterPlan;
    if (options.previewConfirmed) {
      const cached = peekOrganizeTabsPlan() || consumeOrganizeTabsPlan();
      if (cached) {
        const validated = validateClusterPlan(
          cached.plan,
          cached.catalog,
          options.maxGroups ?? DEFAULT_MAX_GROUPS
        );
        if (!validated.ok) {
          return { ok: false, message: validated.message };
        }
        validatedPlan = validated.plan;
        catalog = cached.catalog;
      } else {
        const rawPlan = await clusterTabsViaAssist({
          mode,
          focus: options.focus,
          suggestedGroupName: defaultGroupName({ ...options, mode }),
          maxGroups: options.maxGroups ?? DEFAULT_MAX_GROUPS,
          scopeLabel: resolved.scopeLabel,
          catalog,
          signal: options.signal,
        });
        const validated = validateClusterPlan(
          rawPlan,
          catalog,
          options.maxGroups ?? DEFAULT_MAX_GROUPS
        );
        if (!validated.ok) {
          return { ok: false, message: validated.message };
        }
        validatedPlan = validated.plan;
      }
    } else {
      const rawPlan = await clusterTabsViaAssist({
        mode,
        focus: options.focus,
        suggestedGroupName: defaultGroupName({ ...options, mode }),
        maxGroups: options.maxGroups ?? DEFAULT_MAX_GROUPS,
        scopeLabel: resolved.scopeLabel,
        catalog,
        signal: options.signal,
      });
      const validated = validateClusterPlan(
        rawPlan,
        catalog,
        options.maxGroups ?? DEFAULT_MAX_GROUPS
      );
      if (!validated.ok) {
        return { ok: false, message: validated.message };
      }
      validatedPlan = validated.plan;
    }

    const tabsMoving = countTabsMovingFromExistingGroups(
      validatedPlan,
      options.gBrowser
    );
    const totalAffected = validatedPlan.groups.reduce(
      (sum, group) => sum + group.tabIndices.length,
      0
    );

    if (
      !options.previewConfirmed &&
      shouldConfirmOrganizeTabsPlan({
        plan: validatedPlan,
        tabsMovingFromExistingGroups: tabsMoving,
        totalTabsAffected: totalAffected,
      })
    ) {
      storeOrganizeTabsPlan({
        plan: validatedPlan,
        catalog,
        scopeLabel: resolved.scopeLabel,
      });
      return {
        ok: true,
        needsPreview: true,
        message: "",
        plan: validatedPlan,
        catalog,
        scopeLabel: resolved.scopeLabel,
      };
    }

    if (tabsMoving > 0 && !options.confirmed) {
      storeOrganizeTabsPlan({
        plan: validatedPlan,
        catalog,
        scopeLabel: resolved.scopeLabel,
      });
      const impact = analyzeGroupMoveImpact(
        tabsAffectedByPlan(validatedPlan, options.gBrowser).filter(
          tab => !!tab.group
        )
      );
      return {
        ok: true,
        needsCrossGroupConfirm: true,
        message: "",
        plan: validatedPlan,
        catalog,
        scopeLabel: resolved.scopeLabel,
        affectedGroups: impact.affectedGroups,
        emptiedGroups: impact.emptiedGroups,
      };
    }

    consumeOrganizeTabsPlan();

    report?.({ phase: "applying", label: "Creating tab groups…" });
    const applied = applyOrganizeTabsPlan(options.gBrowser, validatedPlan);
    const groupList = applied.groupsCreated.map(name => `"${name}"`).join(", ");
    const message =
      applied.groupsCreated.length === 0
        ? "No tab groups were created."
        : `I've organized ${applied.tabsGrouped} tab(s) into ${applied.groupsCreated.length} group(s): ${groupList}.` +
          (applied.tabsSkipped > 0
            ? ` ${applied.tabsSkipped} tab(s) were skipped (pinned or unavailable).`
            : "");

    return {
      ok: true,
      message,
      plan: validatedPlan,
      catalog,
      scopeLabel: resolved.scopeLabel,
      groupsCreated: applied.groupsCreated,
      tabsGrouped: applied.tabsGrouped,
      tabsSkipped: applied.tabsSkipped,
    };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return {
        ok: false,
        message: formatQuotaExceededMessage(error),
        code: "over_quota",
      };
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, message: "Tab organize cancelled." };
    }
    assistantLogger.warn("organize-tabs", "Organize tabs failed", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Something went wrong while organizing tabs.",
    };
  }
}
