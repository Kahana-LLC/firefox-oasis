import { isRecord } from "../assistant/messageUtils.js";
import { assistRemote } from "../proxyClient.js";
import {
  RELEVANT_TAB_SELECT_GENERATION_CONFIG,
  RELEVANT_TAB_SELECT_SYSTEM_PROMPT,
  buildRelevantTabSelectUserMessage,
  parseRelevantTabSelectResponse,
} from "../prompts/relevantTabSelectPrompt.js";
import { throwIfResearchBriefAborted } from "../utils/researchBriefProgress.js";
import type { ResearchBriefProgressCallback } from "../utils/researchBriefProgress.js";
import { filterExcludedTabs } from "./researchBriefScope.js";
import type { FilterExcludedTabsOptions } from "./researchBriefScope.js";
import { getTabs } from "./firefoxFacade.js";
import { subscriptionService } from "./subscription.js";
import { syncSubscriptionFromAssistResponse } from "./syncAssistUsage.js";
import type { GBrowserLike } from "../types/runtime.js";
import type { ResolveResearchTabsResult } from "./researchBriefTypes.js";
import {
  attachWindowIndices,
  buildTabCatalog,
  enrichCatalogWithSnippets,
} from "./organizeTabs.js";
import {
  buildRelevantTabFocusQuery,
  rankTabsHeuristically,
} from "./relevantTabRank.js";
import type { RelevantTabContext } from "./relevantTabTypes.js";
import {
  consumeRelevantTabSelection,
  peekRelevantTabSelection,
  storeRelevantTabSelection,
} from "./relevantTabSelectionCache.js";
import { assistWithOutputValidationRetry } from "../utils/assistOutputRetry.js";
import { validateRelevantTabSelection } from "../utils/outputValidators.js";

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

async function selectTabsViaAssist(params: {
  context: RelevantTabContext;
  catalog: import("./organizeTabsTypes.js").TabCatalogEntry[];
  maxTabs: number;
  signal?: AbortSignal;
}): Promise<import("./relevantTabTypes.js").RelevantTabSelectionPlan | null> {
  throwIfResearchBriefAborted(params.signal);
  const focusQuery = buildRelevantTabFocusQuery(params.context);
  const userMessage = buildRelevantTabSelectUserMessage({
    focusQuery,
    artifactKind: params.context.kind,
    maxTabs: params.maxTabs,
    catalog: params.catalog,
  });

  try {
    return await assistWithOutputValidationRetry({
      systemPrompt: RELEVANT_TAB_SELECT_SYSTEM_PROMPT,
      userMessage,
      generationConfig: RELEVANT_TAB_SELECT_GENERATION_CONFIG,
      signal: params.signal,
      parse: raw =>
        parseRelevantTabSelectResponse(raw, params.catalog, params.maxTabs),
      validate: plan => validateRelevantTabSelection(plan, params.catalog),
      validationErrorMessage:
        "I couldn't produce a safe tab selection. Please try again.",
    });
  } catch {
    return null;
  }
}

function tabsFromIndices(
  descriptors: ReturnType<typeof attachWindowIndices>,
  indices: number[]
): import("../types/runtime.js").BrowserTabLike[] {
  const byIndex = new Map(
    descriptors.map(descriptor => [descriptor.index, descriptor.tab])
  );
  return indices
    .map(index => byIndex.get(index))
    .filter((tab): tab is import("../types/runtime.js").BrowserTabLike =>
      Boolean(tab)
    );
}

function buildRelevantScopeLabel(
  focusQuery: string,
  rationale?: string
): string {
  const shortFocus =
    focusQuery.length > 60 ? `${focusQuery.slice(0, 57)}…` : focusQuery;
  if (rationale?.trim()) {
    return `Relevant tabs (${shortFocus})`;
  }
  return `Relevant tabs: ${shortFocus}`;
}

export type ResolveRelevantResearchTabsOptions = {
  gBrowser: GBrowserLike | null | undefined;
  context: RelevantTabContext;
  maxTabs: number;
  exclusions?: FilterExcludedTabsOptions;
  useSnippets?: boolean;
  useCachedSelection?: boolean;
  signal?: AbortSignal;
  onProgress?: ResearchBriefProgressCallback;
};

export async function resolveRelevantResearchTabs(
  options: ResolveRelevantResearchTabsOptions
): Promise<ResolveResearchTabsResult> {
  const focusQuery = buildRelevantTabFocusQuery(options.context);
  if (options.useCachedSelection) {
    const cached = peekRelevantTabSelection() || consumeRelevantTabSelection();
    if (cached && cached.focusQuery === focusQuery && cached.tabs.length > 0) {
      return {
        ok: true,
        tabs: cached.tabs,
        scopeLabel: cached.scopeLabel,
        tabsOmittedByLimit: 0,
        totalBeforeCap: cached.tabs.length,
        urlsDeduplicated: 0,
        usedFuzzyGroupMatch: false,
        tabQueriesCount: 0,
        relevanceRationale: cached.rationale,
        relevanceWarnings: cached.warnings,
        usedRelevantSelection: true,
      };
    }
  }

  if (!options.gBrowser) {
    return { ok: false, message: "Browser UI is not available." };
  }

  const allTabs = getTabs(options.gBrowser);
  if (allTabs.length === 0) {
    return { ok: false, message: "There are no open tabs in this window." };
  }

  const descriptors = attachWindowIndices(options.gBrowser, allTabs);
  const { tabs: afterExclude } = filterExcludedTabs(
    descriptors.map(descriptor => ({
      tab: descriptor.tab,
      title: descriptor.title,
      url: descriptor.url,
    })),
    options.exclusions ?? {}
  );
  const excludedKeys = new Set(afterExclude.map(item => item.tab));
  const filteredDescriptors = descriptors.filter(descriptor =>
    excludedKeys.has(descriptor.tab)
  );

  let catalog = buildTabCatalog(filteredDescriptors);
  if (catalog.filter(entry => !entry.pinned).length === 0) {
    return {
      ok: false,
      message:
        "There are no selectable tabs in this window (pinned tabs are skipped).",
    };
  }

  options.onProgress?.({ phase: "ranking", label: "Finding relevant tabs…" });

  const ranked = rankTabsHeuristically(catalog, options.context);
  const candidateIndices = new Set(ranked.map(entry => entry.index));
  catalog = catalog.filter(entry => candidateIndices.has(entry.index));

  if (options.useSnippets !== false) {
    catalog = await enrichCatalogWithSnippets(catalog, filteredDescriptors, {
      useSnippets: true,
      signal: options.signal,
      onProgress: (current, total) =>
        options.onProgress?.({
          phase: "ranking",
          current,
          total,
          label: `Reading page ${current} of ${total}…`,
        }),
    });
  }

  let selectedIndices = ranked
    .slice(0, options.maxTabs)
    .map(entry => entry.index);
  let rationale = `Selected ${selectedIndices.length} tab(s) by title and URL match for "${focusQuery}".`;
  let warnings: string[] = [];

  const assistPlan = await selectTabsViaAssist({
    context: options.context,
    catalog,
    maxTabs: options.maxTabs,
    signal: options.signal,
  });
  if (assistPlan) {
    selectedIndices = assistPlan.selectedIndices;
    rationale = assistPlan.rationale;
    warnings = assistPlan.warnings;
  }

  const tabs = tabsFromIndices(filteredDescriptors, selectedIndices);
  if (tabs.length === 0) {
    return {
      ok: false,
      message:
        "I couldn't find relevant tabs for that request. Try naming tabs by keyword or position.",
    };
  }

  const scopeLabel = buildRelevantScopeLabel(focusQuery, rationale);
  const result: ResolveResearchTabsResult = {
    ok: true,
    tabs,
    scopeLabel,
    tabsOmittedByLimit: Math.max(0, catalog.length - tabs.length),
    totalBeforeCap: catalog.length,
    urlsDeduplicated: 0,
    usedFuzzyGroupMatch: false,
    tabQueriesCount: 0,
    relevanceRationale: rationale,
    relevanceWarnings: warnings,
    usedRelevantSelection: true,
  };

  storeRelevantTabSelection({
    tabs,
    scopeLabel,
    rationale,
    warnings,
    catalog,
    focusQuery,
  });

  return result;
}
