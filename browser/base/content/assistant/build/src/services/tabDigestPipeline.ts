import type { TabDigest } from "./researchBriefTypes.js";
import {
  estimateSynthesisTokens,
  truncateDigestsToBudget,
} from "./researchBriefFormat.js";
import { suggestTabCountForQuota } from "../utils/researchBriefClarify.js";
import {
  type CiQuotaMode,
  fitDigestsToTokenBudget,
  normalizeCiQuotaMode,
} from "../utils/ciTokenBudget.js";

export const TAB_DIGEST_MAX_TOTAL_CHARS = 80000;

export type QuotaBudgetMode = "default" | "truncate" | "fewer_tabs" | "compact";

export type QuotaProfile = "research_brief" | "competitive_intel";

export type ApplyQuotaBudgetResult = {
  digests: TabDigest[];
  truncated: boolean;
  estimate: number;
  overQuota?: {
    estimate: number;
    remaining: number;
    suggestedTabCount: number;
  };
};

export function applyQuotaBudget(params: {
  digests: TabDigest[];
  readable: TabDigest[];
  quotaMode?: QuotaBudgetMode | CiQuotaMode;
  profile?: QuotaProfile;
  maxTotalChars?: number;
  remaining: number;
}): ApplyQuotaBudgetResult {
  const profile = params.profile || "research_brief";
  const quotaMode = normalizeCiQuotaMode(params.quotaMode);
  const maxTotalChars = params.maxTotalChars ?? TAB_DIGEST_MAX_TOTAL_CHARS;
  const remaining = params.remaining;

  if (profile === "competitive_intel" && quotaMode !== "default") {
    const fitted = fitDigestsToTokenBudget({
      digests: params.readable,
      remaining,
      mode: quotaMode,
    });
    const estimate = estimateSynthesisTokens(fitted.digests);
    if (remaining > 0 && estimate > remaining) {
      return {
        digests: fitted.digests,
        truncated: fitted.truncated,
        estimate,
      };
    }
    return {
      digests: fitted.digests,
      truncated: fitted.truncated,
      estimate,
    };
  }

  let budgetDigests = params.digests;
  let truncated = false;

  if (quotaMode === "fewer_tabs") {
    const half = Math.max(1, Math.floor(params.readable.length / 2));
    budgetDigests = params.digests.slice(0, half);
  } else {
    const budget = truncateDigestsToBudget(params.digests, maxTotalChars);
    budgetDigests = budget.digests;
    truncated = budget.truncated || quotaMode === "truncate";
  }

  const estimate = estimateSynthesisTokens(budgetDigests);
  if (remaining > 0 && estimate > remaining && quotaMode === "default") {
    const suggestedTabCount = suggestTabCountForQuota(budgetDigests, remaining);
    return {
      digests: budgetDigests,
      truncated,
      estimate,
      overQuota: {
        estimate,
        remaining,
        suggestedTabCount,
      },
    };
  }

  if (profile === "competitive_intel" && quotaMode === "default") {
    const baseline = truncateDigestsToBudget(params.readable, maxTotalChars);
    const baselineEstimate = estimateSynthesisTokens(baseline.digests);
    if (remaining > 0 && baselineEstimate > remaining) {
      const suggestedTabCount = suggestTabCountForQuota(
        baseline.digests,
        remaining
      );
      return {
        digests: baseline.digests,
        truncated: baseline.truncated,
        estimate: baselineEstimate,
        overQuota: {
          estimate: baselineEstimate,
          remaining,
          suggestedTabCount,
        },
      };
    }
    return {
      digests: baseline.digests,
      truncated: baseline.truncated,
      estimate: baselineEstimate,
    };
  }

  return {
    digests: budgetDigests,
    truncated,
    estimate,
  };
}
