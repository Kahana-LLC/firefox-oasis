import { QuotaExceededError } from "../awsSignedFetch.js";
import { assistWithOutputValidationRetry } from "../utils/assistOutputRetry.js";
import { validateCompetitiveIntelOutput } from "../utils/outputValidators.js";
import {
  competitiveIntelToMarkdown,
  parseCompetitiveIntelFromAssistContent,
} from "../utils/competitiveIntelFormat.js";
import {
  COMPETITIVE_INTEL_GENERATION_CONFIG,
  COMPETITIVE_INTEL_SYSTEM_PROMPT,
  buildCompetitiveIntelUserMessage,
} from "../prompts/competitiveIntelPrompt.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { subscriptionService } from "./subscription.js";
import { formatQuotaExceededMessage } from "../utils/quotaUserMessage.js";
import {
  DEFAULT_MAX_TABS,
  formatUnreadableDigestsMessage,
} from "./researchBriefFormat.js";
import { extractTabDigests } from "./researchBrief.js";
import type { CiReportMode } from "./competitiveIntelTypes.js";
import type { CompetitiveCompany } from "./competitiveIntelTypes.js";
import type { EnrichmentPlanEntry } from "./competitiveIntelTypes.js";
import {
  resolveCiReportTabs,
  tagDigestsWithCiTabGroups,
  tagDigestsWithCompanies,
} from "./competitiveIntelResolve.js";
import { applyEnrichmentDigestHints } from "./competitiveIntelDigest.js";
import { tierGroupLabel } from "./competitiveIntelEnrichment.js";
import { alignCompetitiveIntelReport } from "../utils/competitiveIntelReportAlign.js";
import {
  createResearchBriefProgressReporter,
  throwIfResearchBriefAborted,
} from "../utils/researchBriefProgress.js";
import {
  type CiQuotaMode,
  buildCiBudgetNote,
  formatCiQuotaStillOverMessage,
} from "../utils/ciTokenBudget.js";
import {
  applyQuotaBudget,
  TAB_DIGEST_MAX_TOTAL_CHARS,
} from "./tabDigestPipeline.js";

export type { CiQuotaMode } from "../utils/ciTokenBudget.js";

export type BuildCompetitiveIntelResult =
  | {
      ok: true;
      markdown: string;
      reportId: string;
      report: import("./competitiveIntelTypes.js").CompetitiveIntelReport;
      reportMode: CiReportMode;
      budgetNote?: string;
    }
  | {
      ok: false;
      message: string;
      code?: "over_quota";
      estimate?: number;
      remaining?: number;
      suggestedTabCount?: number;
    };

export async function buildCompetitiveIntelReport(params: {
  industry: string;
  focus?: string;
  companies: CompetitiveCompany[];
  enrichmentPlan: EnrichmentPlanEntry[];
  tierLabels?: string[];
  groupName?: string;
  quotaMode?: CiQuotaMode;
  signal?: AbortSignal;
}): Promise<BuildCompetitiveIntelResult> {
  const quotaMode = params.quotaMode || "default";
  const buildStartedAt = Date.now();
  assistantLogger.debug("competitiveIntel", "ci_build_start", {
    companies: params.companies.length,
    enrichmentEntries: params.enrichmentPlan.length,
    quotaMode,
  });
  const report = params.signal
    ? createResearchBriefProgressReporter(params.signal)
    : undefined;

  try {
    const display = subscriptionService.getDailyTokenUsageForDisplay();
    if (display.remaining <= 0) {
      return {
        ok: false,
        message: formatQuotaExceededMessage("daily_limit_exceeded"),
      };
    }

    report?.({
      phase: "resolving",
      context: "competitive_intel",
      label: "Reading CI tier tab groups…",
    });
    throwIfResearchBriefAborted(params.signal);

    const resolved = resolveCiReportTabs({
      tierLabels: params.tierLabels,
      enrichmentPlan: params.enrichmentPlan,
      groupName: params.groupName,
    });

    if (resolved.tabs.length === 0) {
      return {
        ok: false,
        message:
          "No tabs found in your CI tier tab groups. Open enrichment pages, create CI — High / Medium / Low / Adjacent groups, then try again.",
      };
    }

    const resolveLabel =
      resolved.source === "tab_groups"
        ? `Matched ${resolved.tabs.length} tab${resolved.tabs.length === 1 ? "" : "s"} from ${resolved.scopeLabel}…`
        : `Matched ${resolved.tabs.length} enrichment tab${resolved.tabs.length === 1 ? "" : "s"} by URL (CI groups not found)…`;

    report?.({
      phase: "resolving",
      context: "competitive_intel",
      label: resolveLabel,
    });

    const cappedTabs = resolved.tabs.slice(0, DEFAULT_MAX_TABS + 5);
    const digests = await extractTabDigests(cappedTabs, {
      signal: params.signal,
      onProgress: (current, total) =>
        report?.({
          phase: "extracting",
          current,
          total,
          context: "competitive_intel",
          label:
            resolved.source === "tab_groups"
              ? `Reading tab group content (${current} of ${total})…`
              : `Reading tab content (${current} of ${total})…`,
        }),
    });
    const hinted = applyEnrichmentDigestHints(digests);
    const tagged =
      resolved.source === "tab_groups"
        ? tagDigestsWithCiTabGroups(hinted, params.companies, cappedTabs)
        : tagDigestsWithCompanies(hinted, params.enrichmentPlan);

    const readable = tagged.filter(
      digest => digest.status === "ok" && digest.content.trim().length > 20
    );
    if (readable.length === 0) {
      return {
        ok: false,
        message: formatUnreadableDigestsMessage(digests, resolved.scopeLabel),
      };
    }

    const budget = applyQuotaBudget({
      digests: tagged,
      readable,
      quotaMode,
      profile: "competitive_intel",
      maxTotalChars: TAB_DIGEST_MAX_TOTAL_CHARS,
      remaining: display.remaining,
    });

    if (budget.overQuota) {
      return {
        ok: false,
        code: "over_quota",
        message: formatCiQuotaStillOverMessage(
          budget.overQuota.estimate,
          budget.overQuota.remaining
        ),
        estimate: budget.overQuota.estimate,
        remaining: budget.overQuota.remaining,
        suggestedTabCount: budget.overQuota.suggestedTabCount,
      };
    }

    const synthesisDigests = budget.digests;
    const contentTruncated = budget.truncated;
    const estimate = budget.estimate;
    const usage = subscriptionService.getDailyTokenUsageForDisplay();
    if (quotaMode !== "default" && estimate > usage.remaining) {
      return {
        ok: false,
        message: formatCiQuotaStillOverMessage(estimate, usage.remaining),
      };
    }

    const reportMode: CiReportMode =
      quotaMode === "default" &&
      !contentTruncated &&
      resolved.source === "tab_groups"
        ? "full"
        : "compact";

    let budgetNote = buildCiBudgetNote({
      reportMode,
      tabCountUsed: synthesisDigests.length,
      totalTabCount: readable.length,
      truncated: contentTruncated,
    });
    if (resolved.source === "enrichment_plan") {
      const fallbackNote =
        "Tabs were matched by URL because CI tier tab groups were not found.";
      budgetNote = budgetNote ? `${budgetNote} ${fallbackNote}` : fallbackNote;
    }

    report?.({
      phase: "synthesizing",
      context: "competitive_intel",
      label: `Writing report from ${synthesisDigests.length} readable tab${synthesisDigests.length === 1 ? "" : "s"}…`,
    });
    const groupLabels =
      resolved.groupLabels.length > 0
        ? resolved.groupLabels
        : [
            ...new Set(
              params.companies.map(company => tierGroupLabel(company.tier))
            ),
          ];
    let reportData;
    let lastValidationReason = "";
    const compact = quotaMode === "compact" || reportMode === "compact";
    try {
      reportData = await assistWithOutputValidationRetry({
        systemPrompt: COMPETITIVE_INTEL_SYSTEM_PROMPT,
        userMessage: buildCompetitiveIntelUserMessage({
          industry: params.industry,
          focus: params.focus,
          companies: params.companies,
          groupLabels,
          digests: synthesisDigests,
          compact,
        }),
        generationConfig: COMPETITIVE_INTEL_GENERATION_CONFIG,
        signal: params.signal,
        maxAttempts: compact ? 2 : 4,
        onAttempt: (attempt, maxAttempts) => {
          report?.({
            phase: attempt <= 1 ? "synthesizing" : "validating",
            context: "competitive_intel",
            attempt,
            maxAttempts,
            label:
              attempt <= 1
                ? compact
                  ? "Writing compact competitive intelligence report…"
                  : "Writing competitive intelligence report…"
                : `Validating report grounding (attempt ${attempt} of ${maxAttempts})…`,
          });
        },
        parse: parseCompetitiveIntelFromAssistContent,
        validate: parsed => {
          const aligned = alignCompetitiveIntelReport(
            parsed,
            synthesisDigests,
            params.companies.map(company => company.name)
          );
          const validation = validateCompetitiveIntelOutput(aligned, {
            digests: synthesisDigests,
            allowedCompanies: params.companies.map(company => company.name),
          });
          if (!validation.ok) {
            lastValidationReason = validation.reason;
            assistantLogger.warn(
              "competitiveIntel",
              "Report validation failed",
              validation.reason
            );
          }
          if (validation.ok) {
            Object.assign(parsed, aligned);
          }
          return validation;
        },
        validationErrorMessage:
          "I couldn't produce a grounded competitive intelligence report. Please try again.",
      });
    } catch (error) {
      const suffix = lastValidationReason ? ` (${lastValidationReason})` : "";
      return {
        ok: false,
        message:
          (error instanceof Error
            ? error.message
            : "I couldn't produce a grounded competitive intelligence report.") +
          suffix +
          " Reply **continue** to retry report synthesis — your enrichment tabs are still open.",
      };
    }

    reportData.generatedAt = reportData.generatedAt || new Date().toISOString();
    reportData.industry = reportData.industry || params.industry;
    if (reportData.confidenceRefinementEligible === undefined) {
      reportData.confidenceRefinementEligible = true;
    }

    let markdown = competitiveIntelToMarkdown(reportData);
    if (budgetNote) {
      markdown = `${markdown}\n\n---\n\n*${budgetNote}*`;
    }
    const reportId = `ci_${Date.now()}`;
    assistantLogger.debug("competitiveIntel", "ci_build_done", {
      ms: Date.now() - buildStartedAt,
      readableTabs: readable.length,
      synthesisTabs: synthesisDigests.length,
      reportMode,
      tabSource: resolved.source,
      payloadBytes: markdown.length,
    });
    return {
      ok: true,
      markdown,
      reportId,
      report: reportData,
      reportMode,
      budgetNote,
    };
  } catch (error) {
    assistantLogger.warn("competitiveIntel", "Build failed", error);
    if (
      error instanceof QuotaExceededError ||
      (error as { isQuotaError?: boolean }).isQuotaError
    ) {
      return {
        ok: false,
        message: formatQuotaExceededMessage(
          error instanceof Error ? error.message : "Quota exceeded"
        ),
      };
    }
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "I couldn't build the competitive intelligence report.",
    };
  }
}
