import type { ResearchBriefProgressCallback } from "../utils/researchBriefProgress.js";
import { DEFAULT_MAX_TABS } from "./researchBriefFormat.js";
import {
  previewResearchBriefScope as previewResearchBriefScopeSync,
  resolveActiveTabGroupScope,
  resolveResearchTabs,
} from "./researchBrief.js";
import type { BuildResearchBriefOptions } from "./researchBrief.js";
import type { BuildOutreachEmailOptions } from "./outreachEmail.js";
import type { ResolveResearchTabsResult } from "./researchBriefTypes.js";
import {
  buildRelevantTabContextFromBrief,
  buildRelevantTabContextFromOutreach,
} from "./relevantTabRank.js";
import { effectiveResearchScope } from "./relevantTabScope.js";
import type { EffectiveResearchScopeOptions } from "./relevantTabScope.js";

export { effectiveResearchScope } from "./relevantTabScope.js";
import { resolveRelevantResearchTabs } from "./relevantTabResolve.js";

type SharedTabSelectionOptions = EffectiveResearchScopeOptions & {
  maxTabs?: number;
  excludeIndices?: number[];
  excludeQueries?: string[];
};

async function resolveWithEffectiveScope(
  options: SharedTabSelectionOptions & {
    relevantContext: ReturnType<typeof buildRelevantTabContextFromBrief>;
    useCachedSelection?: boolean;
    signal?: AbortSignal;
    onProgress?: ResearchBriefProgressCallback;
  }
): Promise<ResolveResearchTabsResult> {
  const scope = effectiveResearchScope(options);
  const maxTabs = options.maxTabs ?? DEFAULT_MAX_TABS;
  const exclusions = {
    excludeIndices: options.excludeIndices,
    excludeQueries: options.excludeQueries,
  };

  if (options.useActiveTabGroup) {
    return resolveActiveTabGroupScope(options.gBrowser, maxTabs, exclusions);
  }

  if (scope === "relevant") {
    options.onProgress?.({ phase: "ranking" });
    return resolveRelevantResearchTabs({
      gBrowser: options.gBrowser,
      context: options.relevantContext,
      maxTabs,
      exclusions,
      useCachedSelection: options.useCachedSelection === true,
      signal: options.signal,
      onProgress: options.onProgress,
    });
  }

  return resolveResearchTabs(
    options.gBrowser,
    scope,
    options.name,
    maxTabs,
    exclusions,
    options.tabQueries ?? [],
    options.tabIndices ?? []
  );
}

function resolveBriefTopicForSelection(
  options: BuildResearchBriefOptions
): string | undefined {
  const explicit = String(options.topic || "").trim();
  if (explicit) {
    return explicit;
  }
  if ((options.tabQueries?.length ?? 0) === 1) {
    return String(options.tabQueries[0] || "").trim() || undefined;
  }
  return undefined;
}

export async function resolveTabsForResearchBrief(
  options: BuildResearchBriefOptions,
  params?: {
    useCachedSelection?: boolean;
    signal?: AbortSignal;
    onProgress?: ResearchBriefProgressCallback;
  }
): Promise<ResolveResearchTabsResult> {
  const topic = resolveBriefTopicForSelection(options);
  return resolveWithEffectiveScope({
    ...options,
    topic,
    relevantContext: buildRelevantTabContextFromBrief({
      topic,
      outlineHint: options.outlineHint,
    }),
    useCachedSelection: params?.useCachedSelection,
    signal: params?.signal,
    onProgress: params?.onProgress,
  });
}

export async function resolveTabsForOutreachEmail(
  options: BuildOutreachEmailOptions,
  params?: {
    useCachedSelection?: boolean;
    signal?: AbortSignal;
    onProgress?: ResearchBriefProgressCallback;
  }
): Promise<ResolveResearchTabsResult> {
  return resolveWithEffectiveScope({
    ...options,
    relevantContext: buildRelevantTabContextFromOutreach({
      purpose: options.purpose,
      purposeNotes: options.purposeNotes,
      recipientName: options.recipientName,
      recipientRole: options.recipientRole,
    }),
    useCachedSelection: params?.useCachedSelection,
    signal: params?.signal,
    onProgress: params?.onProgress,
  });
}

export async function previewResearchBriefScopeAsync(
  options: BuildResearchBriefOptions
): Promise<ResolveResearchTabsResult> {
  const scope = effectiveResearchScope(options);
  if (scope === "relevant") {
    return resolveTabsForResearchBrief(options);
  }
  return previewResearchBriefScopeSync(options);
}

export async function previewOutreachEmailScopeAsync(
  options: BuildOutreachEmailOptions
): Promise<ResolveResearchTabsResult> {
  const scope = effectiveResearchScope(options);
  if (scope === "relevant") {
    return resolveTabsForOutreachEmail(options);
  }
  return previewResearchBriefScopeSync(options);
}
