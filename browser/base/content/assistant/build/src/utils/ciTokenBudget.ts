import type { ClarificationOption } from "../../../shared/contracts.js";
import type { TabDigest } from "../services/researchBriefTypes.js";
import type { EnrichmentPlanEntry } from "../services/competitiveIntelTypes.js";
import {
  estimateSynthesisTokens,
  truncateDigestsToBudget,
} from "../services/researchBriefFormat.js";
import { suggestTabCountForQuota } from "./researchBriefClarify.js";
import { buildCiQuotaResumePrompt } from "./ciQuotaResume.js";

export type CiQuotaMode = "default" | "compact" | "fewer_tabs" | "truncate";

export type CiTokenBudgetTier = "comfortable" | "tight" | "over_budget";

const ASSUMED_CHARS_PER_TAB_MIN = 4000;
const ASSUMED_CHARS_PER_TAB_MAX = 12000;
const OUTPUT_TOKEN_BUFFER = 4000;
const COMFORTABLE_REMAINING_RATIO = 0.7;
const INPUT_BUDGET_REMAINING_RATIO = 0.8;

const TIER_PRIORITY: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  adjacent: 3,
};

export function normalizeCiQuotaMode(raw: string | undefined): CiQuotaMode {
  if (raw === "compact" || raw === "fewer_tabs" || raw === "truncate") {
    return raw;
  }
  return "default";
}

export function countEnrichmentTabsFromPlan(
  plan: EnrichmentPlanEntry[]
): number {
  if (plan.length === 0) {
    return 0;
  }
  return plan.reduce(
    (sum, entry) => sum + Math.max(1, entry.urls?.length || 0),
    0
  );
}

export function estimateCiTokensFromPlan(
  enrichmentPlan: EnrichmentPlanEntry[],
  _companyCount?: number
): { min: number; max: number; tabCount: number; midpoint: number } {
  const tabCount = countEnrichmentTabsFromPlan(enrichmentPlan);
  const min =
    Math.ceil((tabCount * ASSUMED_CHARS_PER_TAB_MIN) / 4) + OUTPUT_TOKEN_BUFFER;
  const max =
    Math.ceil((tabCount * ASSUMED_CHARS_PER_TAB_MAX) / 4) + OUTPUT_TOKEN_BUFFER;
  return {
    min,
    max,
    tabCount,
    midpoint: Math.round((min + max) / 2),
  };
}

export function classifyTokenBudget(
  estimate: number,
  remaining: number
): CiTokenBudgetTier {
  if (remaining <= 0) {
    return "over_budget";
  }
  if (estimate <= remaining * COMFORTABLE_REMAINING_RATIO) {
    return "comfortable";
  }
  if (estimate <= remaining) {
    return "tight";
  }
  return "over_budget";
}

function tierPriorityFromLabel(tierLabel?: string): number {
  const normalized = String(tierLabel || "")
    .toLowerCase()
    .replace(/^ci\s*[—-]\s*/i, "")
    .trim();
  return TIER_PRIORITY[normalized] ?? 4;
}

export function prioritizeCiDigests<
  T extends TabDigest & { tierLabel?: string },
>(digests: T[]): T[] {
  return [...digests].sort((left, right) => {
    const leftPriority = tierPriorityFromLabel(left.tierLabel);
    const rightPriority = tierPriorityFromLabel(right.tierLabel);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return String(left.title || left.url).localeCompare(
      String(right.title || right.url)
    );
  });
}

export function charsBudgetFromRemaining(remaining: number): number {
  return Math.max(
    0,
    Math.floor(
      (remaining * INPUT_BUDGET_REMAINING_RATIO - OUTPUT_TOKEN_BUFFER) * 4
    )
  );
}

export function fitDigestsToTokenBudget<T extends TabDigest>(params: {
  digests: T[];
  remaining: number;
  mode: CiQuotaMode;
}): {
  digests: T[];
  truncated: boolean;
  tabCountUsed: number;
  totalTabCount: number;
} {
  const { digests, remaining, mode } = params;
  const totalTabCount = digests.length;
  if (mode === "default" || digests.length === 0) {
    return {
      digests,
      truncated: false,
      tabCountUsed: digests.length,
      totalTabCount,
    };
  }

  let working = prioritizeCiDigests(digests);
  let truncated = false;
  const inputBudget = Math.floor(remaining * INPUT_BUDGET_REMAINING_RATIO);

  if (mode === "fewer_tabs" || mode === "compact") {
    const count = suggestTabCountForQuota(working, inputBudget);
    working = working.slice(0, count);
  }

  if (mode === "truncate" || mode === "compact") {
    const maxChars = charsBudgetFromRemaining(remaining);
    const budget = truncateDigestsToBudget(working, maxChars);
    working = budget.digests;
    truncated = budget.truncated || truncated;
  }

  return {
    digests: working,
    truncated,
    tabCountUsed: working.length,
    totalTabCount,
  };
}

export function buildCiBudgetNote(params: {
  reportMode: "full" | "compact";
  tabCountUsed: number;
  totalTabCount: number;
  truncated: boolean;
}): string | undefined {
  if (params.reportMode !== "compact") {
    return undefined;
  }
  const parts: string[] = [];
  if (params.tabCountUsed < params.totalTabCount) {
    parts.push(
      `used ${params.tabCountUsed} of ${params.totalTabCount} enrichment tabs`
    );
  }
  if (params.truncated) {
    parts.push("truncated tab content");
  }
  if (parts.length === 0) {
    return "Compact report — generated with a shorter synthesis profile to fit your daily allowance.";
  }
  return `Compact report — ${parts.join(" and ")} to fit your daily allowance. Regenerate with fewer tabs open for fuller coverage.`;
}

export function buildCiOverQuotaClarification(params: {
  estimate: number;
  remaining: number;
  suggestedTabCount: number;
}): { options: ClarificationOption[]; message: string } {
  const options: ClarificationOption[] = [
    {
      id: "ci_quota_compact",
      label: "Generate compact report (recommended)",
      resolvedPrompt: buildCiQuotaResumePrompt("ci_quota_compact"),
    },
    {
      id: "ci_quota_fewer_tabs",
      label: `Use fewer tabs (first ${params.suggestedTabCount})`,
      resolvedPrompt: buildCiQuotaResumePrompt("ci_quota_fewer_tabs"),
    },
    {
      id: "ci_quota_truncate",
      label: "Truncate tab content",
      resolvedPrompt: buildCiQuotaResumePrompt("ci_quota_truncate"),
    },
    {
      id: "ci_quota_cancel",
      label: "Cancel",
      resolvedPrompt: buildCiQuotaResumePrompt("ci_quota_cancel"),
    },
  ];
  return {
    options,
    message: `This report may need about ${params.estimate.toLocaleString()} tokens, but you have about ${params.remaining.toLocaleString()} remaining today. Choose how to continue.`,
  };
}

export function buildCiReportTokenEstimateBlock(params: {
  enrichmentPlan: EnrichmentPlanEntry[];
  remaining: number;
}): string {
  const { min, max, tabCount } = estimateCiTokensFromPlan(
    params.enrichmentPlan
  );
  const tier = classifyTokenBudget(max, params.remaining);
  const range =
    min === max
      ? `~${min.toLocaleString()}`
      : `~${min.toLocaleString()}–${max.toLocaleString()}`;
  const lines = [
    `**Estimated cost:** ${range} tokens (${tabCount} enrichment tab${tabCount === 1 ? "" : "s"})`,
    `**Your remaining:** ${params.remaining.toLocaleString()} tokens`,
  ];
  if (tier === "comfortable") {
    lines.push(
      "**Recommendation:** A full report should fit comfortably within your allowance."
    );
  } else if (tier === "tight") {
    lines.push(
      "**Recommendation:** A full report may use most of your allowance. A compact report is also available."
    );
  } else {
    lines.push(
      "**Recommendation:** A compact report should fit. A full report may exceed your allowance."
    );
  }
  return lines.join("\n");
}

export function formatCiQuotaStillOverMessage(
  estimate: number,
  remaining: number
): string {
  return [
    `Even a compact report needs about **${estimate.toLocaleString()} tokens**, but you only have about **${remaining.toLocaleString()} remaining** today.`,
    "",
    "Close some enrichment tabs and try again, or wait until your daily allowance resets.",
  ].join("\n");
}
