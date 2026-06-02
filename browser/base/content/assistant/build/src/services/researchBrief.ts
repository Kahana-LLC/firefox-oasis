import { QuotaExceededError } from "../awsSignedFetch.js";
import { isRecord } from "../assistant/messageUtils.js";
import { assistRemote } from "../proxyClient.js";
import {
  clampMaxTabs,
  DEFAULT_MAX_TABS,
  estimateSynthesisTokens,
  parseResearchBriefFromAssistContent,
  researchBriefToMarkdown,
  truncateDigestsToBudget,
} from "./researchBriefFormat.js";
import {
  RESEARCH_BRIEF_GENERATION_CONFIG,
  RESEARCH_BRIEF_SYSTEM_PROMPT,
  buildResearchBriefUserMessage,
} from "../prompts/researchBriefPrompt.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { formatQuotaExceededMessage } from "../utils/quotaUserMessage.js";
import { inferResearchBriefTopicFromDigests } from "../utils/researchBriefTopic.js";
import {
  createResearchBriefProgressReporter,
  throwIfResearchBriefAborted,
  type ResearchBriefProgressCallback,
} from "../utils/researchBriefProgress.js";
import { extractPageContentFromTab } from "./pageContentExtract.js";
import { subscriptionService } from "./subscription.js";
import { syncSubscriptionFromAssistResponse } from "./syncAssistUsage.js";
import {
  findGroupByNameFuzzy,
  getTabs,
  resolveActiveTabGroup,
  tabTitle,
  tabUrl,
} from "./firefoxFacade.js";
import type { BrowserTabLike, GBrowserLike } from "../types/runtime.js";
import type {
  ResearchBrief,
  ResearchScope,
  ResolveResearchTabsResult,
  TabDigest,
} from "./researchBriefTypes.js";
import type { FilterExcludedTabsOptions } from "./researchBriefScope.js";
import { resolveTabsScope } from "./researchBriefTabResolve.js";
import { finalizeResolvedTabList } from "./researchBriefResolve.js";
import { storeResearchBriefRun } from "./researchBriefDigestCache.js";
import { suggestTabCountForQuota } from "../utils/researchBriefClarify.js";

export type {
  ResearchBrief,
  TabDigest,
  ResearchScope,
  ResolveResearchTabsResult,
} from "./researchBriefTypes.js";
export {
  clampMaxTabs,
  DEFAULT_MAX_TABS,
  HARD_MAX_TABS,
  estimateSynthesisTokens,
  parseResearchBriefFromAssistContent,
  researchBriefToMarkdown,
  truncateDigestsToBudget,
} from "./researchBriefFormat.js";

export const MAX_TOTAL_CHARS = 80000;
export const EXTRACT_CONCURRENCY = 3;

export function resolveResearchTabs(
  gBrowser: GBrowserLike | null | undefined,
  scope: ResearchScope,
  name: string | undefined,
  maxTabs: number,
  exclusions: FilterExcludedTabsOptions = {},
  tabQueries: string[] = [],
  tabIndices: number[] = []
): ResolveResearchTabsResult {
  if (!gBrowser) {
    return { ok: false, message: "Browser UI is not available." };
  }

  if (scope === "tabs") {
    return resolveTabsScope(
      gBrowser,
      tabQueries,
      tabIndices,
      maxTabs,
      exclusions
    );
  }

  let baseLabel = "";
  let allTabs: BrowserTabLike[] = [];
  let usedFuzzyGroupMatch = false;

  if (scope === "tab-group") {
    const groupName = String(name || "").trim();
    if (!groupName) {
      return {
        ok: false,
        message:
          "Which tab group should I use? Name the group in your request.",
      };
    }
    const fuzzy = findGroupByNameFuzzy(gBrowser, groupName);
    if (fuzzy.alternatives.length > 1 && !fuzzy.group) {
      return {
        ok: false,
        code: "ambiguous_group",
        message: `Several tab groups match "${groupName}".`,
        candidates: fuzzy.alternatives.map(g => ({
          name: String(g.label || "Untitled").trim(),
          label: `Tab group: ${g.label || "Untitled"}`,
          tabCount: Array.from(g.tabs || []).length,
        })),
      };
    }
    if (!fuzzy.group) {
      const hint = fuzzy.closestLabel
        ? ` Did you mean "${fuzzy.closestLabel}"?`
        : "";
      return {
        ok: false,
        message: `I couldn't find a tab group named "${groupName}".${hint}`,
      };
    }
    usedFuzzyGroupMatch = fuzzy.matchKind !== "exact";
    allTabs = Array.from(fuzzy.group.tabs || []);
    baseLabel = `Tab group: ${fuzzy.group.label || groupName}`;
    if (allTabs.length === 0) {
      return {
        ok: false,
        message: `Tab group "${fuzzy.group.label || groupName}" has no tabs.`,
      };
    }
  } else {
    allTabs = getTabs(gBrowser);
    baseLabel = "Current window";
    if (allTabs.length === 0) {
      return { ok: false, message: "There are no open tabs in this window." };
    }
  }

  const tabDescriptors = allTabs.map(tab => ({
    tab,
    title: tabTitle(tab),
    url: tabUrl(tab),
  }));

  return finalizeResolvedTabList({
    tabDescriptors,
    exclusions,
    maxTabs,
    baseLabel,
    usedFuzzyGroupMatch,
    tabQueriesCount: 0,
  });
}

export function resolveActiveTabGroupScope(
  gBrowser: GBrowserLike | null | undefined,
  maxTabs: number,
  exclusions: FilterExcludedTabsOptions = {}
): ResolveResearchTabsResult {
  if (!gBrowser) {
    return { ok: false, message: "Browser UI is not available." };
  }
  const group = resolveActiveTabGroup(gBrowser);
  if (!group) {
    return {
      ok: false,
      message:
        "I couldn't find an active tab group. Name a tab group or use tabs by title.",
    };
  }
  const allTabs = Array.from(group.tabs || []);
  if (allTabs.length === 0) {
    return {
      ok: false,
      message: `Tab group "${group.label || "Untitled"}" has no tabs.`,
    };
  }
  const tabDescriptors = allTabs.map(tab => ({
    tab,
    title: tabTitle(tab),
    url: tabUrl(tab),
  }));
  return finalizeResolvedTabList({
    tabDescriptors,
    exclusions,
    maxTabs,
    baseLabel: `Tab group: ${group.label || "current"}`,
    usedFuzzyGroupMatch: false,
    tabQueriesCount: 0,
  });
}

export async function extractTabDigests(
  tabs: BrowserTabLike[],
  options: {
    concurrency?: number;
    onProgress?: (current: number, total: number) => void;
    signal?: AbortSignal;
    retryOnce?: boolean;
  } = {}
): Promise<TabDigest[]> {
  const concurrency = options.concurrency ?? EXTRACT_CONCURRENCY;
  const total = tabs.length;
  const results: TabDigest[] = new Array(total);
  let completed = 0;

  async function extractOne(tab: BrowserTabLike): Promise<TabDigest> {
    let extracted = await extractPageContentFromTab(tab);
    const retriable =
      extracted.status === "failed" &&
      /loading|timeout|not accessible/i.test(
        String(extracted.failureReason || "")
      );
    if (options.retryOnce !== false && retriable) {
      extracted = await extractPageContentFromTab(tab);
    }
    return {
      title: extracted.title,
      url: extracted.url,
      content: extracted.content,
      status: extracted.status,
      failureReason: extracted.failureReason,
    };
  }

  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < total) {
      throwIfResearchBriefAborted(options.signal);
      const i = nextIndex++;
      const tab = tabs[i];
      results[i] = await extractOne(tab);
      completed += 1;
      options.onProgress?.(completed, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

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

function mergeDigestSourcesIntoBrief(
  brief: ResearchBrief,
  digests: TabDigest[]
): ResearchBrief {
  const byUrl = new Map(brief.sources.map(s => [s.url, s]));
  for (const digest of digests) {
    if (byUrl.has(digest.url)) {
      continue;
    }
    byUrl.set(digest.url, {
      title: digest.title,
      url: digest.url,
      status: digest.status,
      failureReason: digest.failureReason,
      keyClaims: [],
      quotes: [],
    });
  }
  return { ...brief, sources: Array.from(byUrl.values()) };
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

function appendSourceQualityNote(
  brief: ResearchBrief,
  digests: TabDigest[]
): ResearchBrief {
  const failed = digests.filter(
    d => d.status === "failed" || d.status === "skipped"
  ).length;
  if (failed === 0) {
    return brief;
  }
  const note = `${failed} source(s) had limited or unreadable text.`;
  if (brief.executiveSummary.includes(note)) {
    return brief;
  }
  return {
    ...brief,
    executiveSummary: `${brief.executiveSummary.trim()}\n\n${note}`.trim(),
  };
}

export async function synthesizeResearchBrief(params: {
  topic: string;
  outlineHint?: string;
  scopeLabel: string;
  digests: TabDigest[];
  signal?: AbortSignal;
}): Promise<ResearchBrief> {
  throwIfResearchBriefAborted(params.signal);
  const userMessage = buildResearchBriefUserMessage({
    topic: params.topic,
    outlineHint: params.outlineHint,
    scopeLabel: params.scopeLabel,
    digests: params.digests,
  });

  const res = await assistRemote(
    RESEARCH_BRIEF_SYSTEM_PROMPT,
    [{ role: "user", content: userMessage }],
    ["chat"],
    [],
    RESEARCH_BRIEF_GENERATION_CONFIG,
    undefined,
    params.signal
  );

  throwIfResearchBriefAborted(params.signal);

  if (res.quota) {
    subscriptionService.updateFromQuota(res.quota);
  }
  syncSubscriptionFromAssistResponse(res);

  const parsed = parseResearchBriefFromAssistContent(
    parseAssistResponseContent(res)
  );
  if (!parsed) {
    throw new Error(
      "I couldn't parse the research brief from the AI response."
    );
  }

  parsed.topic = params.topic;
  parsed.scopeLabel = params.scopeLabel;
  if (!parsed.generatedAt) {
    parsed.generatedAt = new Date().toISOString();
  }
  parsed.synthesisCharCount = params.digests.reduce(
    (sum, d) => sum + String(d.content || "").length,
    0
  );

  return mergeDigestSourcesIntoBrief(parsed, params.digests);
}

export type BuildResearchBriefResult =
  | { ok: true; brief: ResearchBrief; markdown: string; briefId: string }
  | {
      ok: false;
      message: string;
      code?: "over_quota";
      estimate?: number;
      remaining?: number;
      suggestedTabCount?: number;
    };

export type BuildResearchBriefOptions = {
  gBrowser: GBrowserLike | null | undefined;
  scope: ResearchScope;
  name?: string;
  topic?: string;
  inferTopicFromContent?: boolean;
  tabQueries?: string[];
  tabIndices?: number[];
  outlineHint?: string;
  maxTabs?: number;
  excludeIndices?: number[];
  excludeQueries?: string[];
  scopeConfirmed?: boolean;
  quotaMode?: "default" | "truncate" | "fewer_tabs";
  useActiveTabGroup?: boolean;
  onProgress?: ResearchBriefProgressCallback;
  signal?: AbortSignal;
};

export function previewResearchBriefScope(
  options: BuildResearchBriefOptions
): ResolveResearchTabsResult {
  if (options.useActiveTabGroup) {
    return resolveActiveTabGroupScope(
      options.gBrowser,
      options.maxTabs ?? DEFAULT_MAX_TABS,
      {
        excludeIndices: options.excludeIndices,
        excludeQueries: options.excludeQueries,
      }
    );
  }
  return resolveResearchTabs(
    options.gBrowser,
    options.scope,
    options.name,
    options.maxTabs ?? DEFAULT_MAX_TABS,
    {
      excludeIndices: options.excludeIndices,
      excludeQueries: options.excludeQueries,
    },
    options.tabQueries ?? [],
    options.tabIndices ?? []
  );
}

export async function buildResearchBrief(
  options: BuildResearchBriefOptions
): Promise<BuildResearchBriefResult> {
  const report =
    options.onProgress ?? createResearchBriefProgressReporter(options.signal);

  let topic = String(options.topic || "").trim();
  const inferTopicFromContent = options.inferTopicFromContent === true;

  if (!topic && !inferTopicFromContent) {
    return {
      ok: false,
      message: "Please provide a topic for the research brief.",
    };
  }

  try {
    report({ phase: "resolving" });
    throwIfResearchBriefAborted(options.signal);

    const resolved = options.useActiveTabGroup
      ? resolveActiveTabGroupScope(
          options.gBrowser,
          options.maxTabs ?? DEFAULT_MAX_TABS,
          {
            excludeIndices: options.excludeIndices,
            excludeQueries: options.excludeQueries,
          }
        )
      : resolveResearchTabs(
          options.gBrowser,
          options.scope,
          options.name,
          options.maxTabs ?? DEFAULT_MAX_TABS,
          {
            excludeIndices: options.excludeIndices,
            excludeQueries: options.excludeQueries,
          },
          options.tabQueries ?? [],
          options.tabIndices ?? []
        );

    if (!resolved.ok) {
      return { ok: false, message: resolved.message };
    }

    const digests = await extractTabDigests(resolved.tabs, {
      onProgress: (current, total) =>
        report({ phase: "extracting", current, total }),
      signal: options.signal,
    });

    const readable = digests.filter(d => d.status === "ok" && d.content);
    if (readable.length === 0) {
      return {
        ok: false,
        message:
          "I couldn't read any web pages in that scope. Try a tab group with loaded articles.",
      };
    }

    let topicInferred = false;
    if (inferTopicFromContent || !topic) {
      report({ phase: "topic", label: "Choosing topic from page content…" });
      topic = await inferResearchBriefTopicFromDigests(readable);
      topicInferred = true;
      report({ phase: "topic", label: `Topic: ${topic}` });
    }

    let budgetDigests = digests;
    let truncated = false;
    if (options.quotaMode === "fewer_tabs") {
      const half = Math.max(1, Math.floor(readable.length / 2));
      budgetDigests = digests.slice(0, half);
    } else {
      const budget = truncateDigestsToBudget(digests, MAX_TOTAL_CHARS);
      budgetDigests = budget.digests;
      truncated = budget.truncated || options.quotaMode === "truncate";
    }

    const estimate = estimateSynthesisTokens(budgetDigests);
    const display = subscriptionService.getDailyTokenUsageForDisplay();
    if (
      display.remaining > 0 &&
      estimate > display.remaining &&
      options.quotaMode === "default"
    ) {
      const suggestedTabCount = suggestTabCountForQuota(
        budgetDigests,
        display.remaining
      );
      return {
        ok: false,
        code: "over_quota",
        message: `This research brief may need about ${estimate.toLocaleString()} tokens, but you have about ${display.remaining.toLocaleString()} remaining today.`,
        estimate,
        remaining: display.remaining,
        suggestedTabCount,
      };
    }

    report({ phase: "synthesizing" });
    const { synthesizeResearchBriefWithBudget } = await import(
      "./researchBriefMapReduce.js"
    );
    const synth = await synthesizeResearchBriefWithBudget({
      topic,
      outlineHint: options.outlineHint,
      scopeLabel: resolved.scopeLabel,
      digests: budgetDigests,
      maxTotalChars: MAX_TOTAL_CHARS,
      signal: options.signal,
    });

    let brief = synth.brief;
    truncated = truncated || synth.truncated;
    budgetDigests = synth.digests;

    brief = { ...brief, topic, topicInferred };
    brief = appendSourceQualityNote(brief, digests);
    brief.synthesisCharCount = budgetDigests.reduce(
      (sum, d) => sum + String(d.content || "").length,
      0
    );

    const gapNotes: string[] = [...brief.gapsAndContradictions];
    if (truncated) {
      gapNotes.push(
        "Some page content was truncated to fit processing limits; consider fewer tabs for fuller coverage."
      );
    }
    if (resolved.tabsOmittedByLimit > 0) {
      gapNotes.push(
        `${resolved.tabsOmittedByLimit} tab(s) in scope were not included due to the tab limit.`
      );
    }
    if (gapNotes.length !== brief.gapsAndContradictions.length) {
      brief = { ...brief, gapsAndContradictions: gapNotes };
    }

    const markdown = researchBriefToMarkdown(brief);
    const briefId = crypto.randomUUID?.() || String(Date.now());
    storeResearchBriefRun({
      briefId,
      brief,
      digests,
      markdown,
    });

    return { ok: true, brief, markdown, briefId };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, message: "Research brief cancelled." };
    }
    if (
      error instanceof QuotaExceededError ||
      (error as { isQuotaError?: boolean }).isQuotaError
    ) {
      const quota = (error as QuotaExceededError).quota;
      if (quota) {
        subscriptionService.updateFromQuota(quota);
      }
      return {
        ok: false,
        message: formatQuotaExceededMessage((error as Error).message),
      };
    }
    assistantLogger.warn("researchBrief", "Build failed", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "I couldn't build the research brief. Please try again.",
    };
  }
}
