import type { CommandArgs, CmdResult } from "../commands.js";
import {
  advanceCompetitiveIntelStep,
  clearCompetitiveIntelWorkflow,
  getCompetitiveIntelWorkflow,
  initCompetitiveIntelWorkflow,
  updateCompetitiveIntelWorkflow,
  restoreCompetitiveIntelWorkflowFromStorage,
} from "./competitiveIntelWorkflow.js";
import {
  collectDiscoveryTabIds,
  openDiscoveryToolTabs,
  DISCOVERY_TOOLS,
} from "./competitiveIntelDiscovery.js";
import {
  buildTierPreviewMarkdown,
  extractCompetitorPool,
  generateCompetitorPoolViaAssist,
  mergeDiscoveryIntoPool,
} from "./competitiveIntelPool.js";
import {
  assignEnrichmentTabsToPlan,
  buildEnrichmentPlan,
  buildEnrichmentProgressMarkdown,
  getEnrichmentBatch,
  openAllEnrichmentBatches,
  openEnrichmentBatch,
} from "./competitiveIntelEnrichment.js";
import {
  buildGroupPreviewMarkdown,
  createCompetitiveIntelTabGroups,
} from "./competitiveIntelGrouping.js";
import { buildCompetitiveIntelReport } from "./competitiveIntel.js";
import { buildCompetitiveIntelToolMessage } from "../utils/competitiveIntelRequest.js";
import { storeCompetitiveIntelReportCache } from "./competitiveIntelReportCache.js";
import { buildCompetitiveIntelWorkflowMessage } from "../utils/competitiveIntelWorkflowRequest.js";
import {
  CI_REPORT_COMPACT_SENTINEL,
  CI_WORKFLOW_CANCEL_SENTINEL,
} from "../utils/competitiveIntelResume.js";
import type {
  CiQuotaMode,
  CompetitiveCompany,
  CompetitiveTierId,
} from "./competitiveIntelTypes.js";
import { DEFAULT_COMPETITIVE_TIERS } from "./competitiveIntelTypes.js";
import {
  beginResearchBriefRun,
  emitResearchBriefProgress,
  endResearchBriefRun,
} from "../utils/researchBriefProgress.js";
import {
  applyUrlOverrideToCompanies,
  parseUrlOverrideFromText,
} from "../utils/competitiveIntelUrlOverrides.js";
import { OASIS_EVENT_CI_WORKFLOW_UPDATE } from "../../../shared/contracts.js";
import { subscriptionService } from "./subscription.js";
import {
  clearPendingClarification,
  setPendingClarification,
} from "./interactionState.js";
import {
  buildCiOverQuotaClarification,
  buildCiReportTokenEstimateBlock,
  normalizeCiQuotaMode,
} from "../utils/ciTokenBudget.js";
import { setCiQuotaResume } from "../utils/ciQuotaResume.js";

function buildReportTokenEstimateSection(
  workflow: NonNullable<ReturnType<typeof getCompetitiveIntelWorkflow>>
): string {
  const display = subscriptionService.getDailyTokenUsageForDisplay();
  if (display.remaining <= 0) {
    return "\n\n**Token note:** Your daily allowance is used up. The report cannot be generated until it resets.";
  }
  return `\n\n${buildCiReportTokenEstimateBlock({
    enrichmentPlan: workflow.enrichmentPlan,
    remaining: display.remaining,
  })}`;
}

function stringArg(args: CommandArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function boolArg(args: CommandArgs, key: string): boolean {
  return args[key] === true;
}

function buildIntroMarkdown(industry: string, focus?: string): string {
  const focusLine = focus?.trim() ? `\n**Focus:** ${focus.trim()}` : "";
  return [
    `# Competitive intelligence workflow`,
    "",
    `**Industry:** ${industry}${focusLine}`,
    "",
    "I'll guide you through:",
    "",
    "1. Build a competitor pool with Oasis AI",
    "2. Assign competitors to tiers (High / Medium / Low / Adjacent)",
    "3. Open enrichment tabs (company homepage + Wikipedia)",
    "4. Group tabs into tier tab groups",
    "5. Generate a grounded competitive intelligence report",
    "",
    "After the report, you can optionally expand with external AI tools (ChatGPT, Perplexity, etc.) or add review-site enrichment (G2/Capterra).",
    "",
    "Reply **continue** when you're ready to start.",
  ].join("\n");
}

function buildPoolProgressMarkdown(): string {
  return [
    "## Building competitor pool",
    "",
    "Oasis is generating a competitor list for your industry. Reply **continue** when ready to review tiers.",
  ].join("\n");
}

function buildExpandIntroMarkdown(
  discoveryQuery: string,
  toolNames: string[]
): string {
  return [
    "## Expand with external AI research",
    "",
    "Optional Phase 2: deepen the report using external AI tools.",
    "",
    "I opened these AI tools in new tabs:",
    "",
    ...toolNames.map(name => `- ${name}`),
    "",
    "**Copy this query and run it in each tool:**",
    "",
    "```",
    discoveryQuery,
    "```",
    "",
    "When every tool has answered, reply **continue** (or click **I've run the queries** in the workflow panel).",
  ].join("\n");
}

function emitCiWorkflowUpdate(
  status: "awaiting_continue" | "in_progress" | "awaiting_user" | "complete"
): void {
  const workflow = getCompetitiveIntelWorkflow();
  if (!workflow) {
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent(OASIS_EVENT_CI_WORKFLOW_UPDATE, {
        detail: {
          step: workflow.step,
          industry: workflow.industry,
          discoveryQuery: workflow.discoveryQuery,
          openedUrls: workflow.discoveryToolUrls,
          status,
        },
      })
    );
  } catch {
    // ignore UI bridge failures
  }
}

function workflowMessage(
  markdown: string,
  status: "awaiting_continue" | "in_progress" | "awaiting_user" | "complete"
): string {
  const workflow = getCompetitiveIntelWorkflow();
  if (!workflow) {
    return markdown;
  }
  emitCiWorkflowUpdate(status);
  return buildCompetitiveIntelWorkflowMessage({
    markdown,
    workflow,
    discoveryQuery: workflow.discoveryQuery,
    discoveryTools: DISCOVERY_TOOLS.map(tool => tool.name),
    status,
  });
}

function applyTierEditFromText(
  companies: CompetitiveCompany[],
  text: string
): CompetitiveCompany[] {
  const match = String(text || "").match(
    /\bmove\s+(.+?)\s+to\s+(high|medium|low|adjacent)\b/i
  );
  if (!match?.[1] || !match?.[2]) {
    return companies;
  }
  const nameNeedle = match[1].trim().toLowerCase();
  const tier = match[2].toLowerCase() as CompetitiveTierId;
  return companies.map(company =>
    company.name.toLowerCase().includes(nameNeedle) ||
    nameNeedle.includes(company.name.toLowerCase())
      ? { ...company, tier }
      : company
  );
}

function applyWorkflowEditsFromText(
  companies: CompetitiveCompany[],
  text: string
): CompetitiveCompany[] {
  let updated = applyTierEditFromText(companies, text);
  const override = parseUrlOverrideFromText(text);
  if (override) {
    updated = applyUrlOverrideToCompanies(updated, override);
  }
  return updated;
}

async function synthesizeCompetitiveIntelReport(
  workflow: NonNullable<ReturnType<typeof getCompetitiveIntelWorkflow>>,
  groupPreview?: string,
  options?: { quotaMode?: CiQuotaMode }
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const quotaMode = options?.quotaMode || workflow.quotaMode || "default";
  const signal = beginResearchBriefRun();
  try {
    emitResearchBriefProgress({
      phase: "resolving",
      context: "competitive_intel",
      label: "Starting competitive intelligence report…",
    });
    const built = await buildCompetitiveIntelReport({
      industry: workflow.industry,
      focus: workflow.focus,
      companies: workflow.companies,
      enrichmentPlan: workflow.enrichmentPlan,
      tierLabels: DEFAULT_COMPETITIVE_TIERS,
      quotaMode,
      signal,
    });
    if (!built.ok) {
      if (
        built.code === "over_quota" &&
        built.estimate != null &&
        built.remaining != null &&
        built.suggestedTabCount != null
      ) {
        const stashArgs: CommandArgs = {
          industry: workflow.industry,
          workflow_confirmed: true,
          suggested_max_tabs: built.suggestedTabCount,
        };
        if (workflow.focus) {
          stashArgs.focus = workflow.focus;
        }
        const { options: clarifyOptions, message } =
          buildCiOverQuotaClarification({
            estimate: built.estimate,
            remaining: built.remaining,
            suggestedTabCount: built.suggestedTabCount,
          });
        setCiQuotaResume({
          args: stashArgs,
          command: "run_competitive_intel",
        });
        setPendingClarification({
          originalMessage: `competitive intelligence report for ${workflow.industry}`,
          options: clarifyOptions,
        });
        return {
          ok: false,
          message: workflowMessage(
            [groupPreview || "## Report synthesis", "", message].join("\n"),
            "awaiting_continue"
          ),
        };
      }
      return {
        ok: false,
        message: workflowMessage(
          [groupPreview || "## Report synthesis", "", built.message].join("\n"),
          "awaiting_continue"
        ),
      };
    }
    clearPendingClarification();
    updateCompetitiveIntelWorkflow({
      step: "done",
      reportId: built.reportId,
      quotaMode,
    });
    const reportBody = buildCompetitiveIntelToolMessage({
      markdown: built.markdown,
      report: built.report,
      reportId: built.reportId,
      reportMode: built.reportMode,
      budgetNote: built.budgetNote,
    });
    storeCompetitiveIntelReportCache(built.reportId, {
      markdown: built.markdown,
      report: built.report,
      reportId: built.reportId,
      reportMode: built.reportMode,
      budgetNote: built.budgetNote,
    });
    const expandCta = [
      "",
      "---",
      "",
      "**Optional next steps:**",
      "- Say **expand with external AI** to open ChatGPT, Perplexity, and other tools for deeper research",
      "- Say **add review enrichment** to open G2/Capterra tabs (slower; G2 may block bots)",
      "- Say **regenerate report** after expanding or adding review tabs",
    ].join("\n");
    return {
      ok: true,
      message: groupPreview
        ? `${groupPreview}\n\n${reportBody}${expandCta}`
        : `${reportBody}${expandCta}`,
    };
  } finally {
    endResearchBriefRun();
  }
}

export async function executeCompetitiveIntelWorkflow(
  args: CommandArgs
): Promise<CmdResult> {
  const workflowAction = stringArg(args, "workflow_action");
  if (workflowAction === CI_WORKFLOW_CANCEL_SENTINEL) {
    clearCompetitiveIntelWorkflow();
    return { message: "Cancelled the competitive intelligence workflow." };
  }

  let workflow = getCompetitiveIntelWorkflow();
  if (!workflow) {
    workflow = restoreCompetitiveIntelWorkflowFromStorage();
  }
  const industry = stringArg(args, "industry");
  const focus = stringArg(args, "focus");
  const workflowConfirmed = boolArg(args, "workflow_confirmed");

  if (!workflow && industry) {
    workflow = initCompetitiveIntelWorkflow({
      industry,
      focus,
      market: stringArg(args, "market"),
      maxCompetitors:
        typeof args.max_competitors === "number"
          ? (args.max_competitors as number)
          : undefined,
    });
  }

  if (!workflow) {
    return {
      message:
        "Tell me the industry, for example: `I want a competitive intelligence report on enterprise CRM`.",
    };
  }

  if (workflow.step === "intro") {
    if (!workflowConfirmed) {
      return {
        message: workflowMessage(
          buildIntroMarkdown(workflow.industry, workflow.focus),
          "awaiting_continue"
        ),
        requiresConfirmation: false,
      };
    }
    advanceCompetitiveIntelStep("pool");
    workflow = getCompetitiveIntelWorkflow();
    if (!workflow) {
      return {
        message: "Workflow state was lost. Start again with your industry.",
      };
    }
  }

  if (workflow.step === "pool") {
    if (!workflowConfirmed) {
      return {
        message: workflowMessage(buildPoolProgressMarkdown(), "in_progress"),
      };
    }
    const signal = beginResearchBriefRun();
    try {
      const pool = await generateCompetitorPoolViaAssist({
        industry: workflow.industry,
        focus: workflow.focus,
        maxCompetitors: workflow.maxCompetitors,
        signal,
      });
      if (!pool.ok) {
        advanceCompetitiveIntelStep("intro");
        return { message: pool.message };
      }
      updateCompetitiveIntelWorkflow({
        step: "tiers",
        companies: pool.companies,
      });
      const preview = buildTierPreviewMarkdown(pool.companies);
      return {
        message: workflowMessage(preview, "awaiting_continue"),
        requiresConfirmation: true,
      };
    } finally {
      endResearchBriefRun();
    }
  }

  if (workflow.step === "expand") {
    if (!workflowConfirmed) {
      return {
        message: workflowMessage(
          buildExpandIntroMarkdown(
            workflow.discoveryQuery,
            DISCOVERY_TOOLS.map(t => t.name)
          ),
          "awaiting_user"
        ),
      };
    }
    const signal = beginResearchBriefRun();
    try {
      const merged = await mergeDiscoveryIntoPool({
        industry: workflow.industry,
        focus: workflow.focus,
        discoveryTabIds: workflow.discoveryTabIds,
        existingCompanies: workflow.companies,
        maxCompetitors: workflow.maxCompetitors,
        signal,
      });
      if (!merged.ok) {
        return { message: merged.message };
      }
      updateCompetitiveIntelWorkflow({
        companies: merged.companies,
        step: "done",
      });
      return {
        message: workflowMessage(
          [
            "## External AI research merged",
            "",
            `Updated competitor pool with **${merged.companies.length}** companies.`,
            "Say **regenerate report** to rebuild the report with expanded sources, or **add review enrichment** for G2/Capterra tabs.",
          ].join("\n"),
          "complete"
        ),
      };
    } finally {
      endResearchBriefRun();
    }
  }

  if (workflow.step === "discovery") {
    if (!workflowConfirmed) {
      return {
        message: workflowMessage(
          buildExpandIntroMarkdown(
            workflow.discoveryQuery,
            DISCOVERY_TOOLS.map(t => t.name)
          ),
          "awaiting_user"
        ),
      };
    }

    advanceCompetitiveIntelStep("pool");
    const signal = beginResearchBriefRun();
    try {
      const pool = await extractCompetitorPool({
        industry: workflow.industry,
        focus: workflow.focus,
        discoveryTabIds: workflow.discoveryTabIds,
        maxCompetitors: workflow.maxCompetitors,
        signal,
      });
      if (!pool.ok) {
        advanceCompetitiveIntelStep("discovery");
        return { message: pool.message };
      }
      updateCompetitiveIntelWorkflow({
        step: "tiers",
        companies: pool.companies,
      });
      const preview = buildTierPreviewMarkdown(pool.companies);
      return {
        message: workflowMessage(preview, "awaiting_continue"),
        requiresConfirmation: true,
      };
    } finally {
      endResearchBriefRun();
    }
  }

  if (workflow.step === "tiers") {
    let companies = workflow.companies;
    const editText = stringArg(args, "tier_edit");
    if (editText) {
      companies = applyWorkflowEditsFromText(companies, editText);
      updateCompetitiveIntelWorkflow({ companies });
    }
    if (!workflowConfirmed) {
      return {
        message: workflowMessage(
          buildTierPreviewMarkdown(companies),
          "awaiting_continue"
        ),
        requiresConfirmation: true,
      };
    }

    const enrichmentPlan = buildEnrichmentPlan(
      companies,
      workflow.enrichmentProfile
    );
    const openedAll = await openAllEnrichmentBatches(
      enrichmentPlan,
      workflow.enrichmentProfile
    );
    updateCompetitiveIntelWorkflow({
      step: "enrich",
      companies,
      enrichmentPlan: openedAll.plan,
      enrichmentBatchIndex: openedAll.batchCount,
    });
    const progress = buildEnrichmentProgressMarkdown(
      companies,
      openedAll.openedCount,
      openedAll.batchCount,
      workflow.enrichmentProfile,
      openedAll.unhealthyCount
    );
    if (openedAll.openedCount === 0) {
      return {
        message: workflowMessage(progress, "awaiting_continue"),
      };
    }
    return {
      message: workflowMessage(progress, "awaiting_continue"),
    };
  }

  if (workflow.step === "enrich") {
    if (!workflowConfirmed) {
      const progress = buildEnrichmentProgressMarkdown(
        workflow.companies,
        workflow.enrichmentPlan.reduce(
          (count, entry) => count + (entry.tabIds?.length || 0),
          0
        ),
        workflow.enrichmentBatchIndex,
        workflow.enrichmentProfile
      );
      return {
        message: workflowMessage(progress, "awaiting_continue"),
      };
    }
    const batch = getEnrichmentBatch(
      workflow.enrichmentPlan,
      workflow.enrichmentBatchIndex
    );
    if (!batch.done && batch.urls.length > 0) {
      const opened = openEnrichmentBatch(batch.urls);
      const updatedPlan = assignEnrichmentTabsToPlan(
        workflow.enrichmentPlan,
        opened
      );
      updateCompetitiveIntelWorkflow({
        enrichmentPlan: updatedPlan,
        enrichmentBatchIndex: workflow.enrichmentBatchIndex + 1,
      });
      const progress = buildEnrichmentProgressMarkdown(
        workflow.companies,
        updatedPlan.reduce(
          (count, entry) => count + (entry.tabIds?.length || 0),
          0
        ),
        workflow.enrichmentBatchIndex + 1,
        workflow.enrichmentProfile
      );
      return {
        message: workflowMessage(progress, "awaiting_continue"),
      };
    }
    advanceCompetitiveIntelStep("groups");
  }

  workflow = getCompetitiveIntelWorkflow();
  if (!workflow) {
    return {
      message: "Workflow state was lost. Start again with your industry.",
    };
  }

  if (workflow.step === "groups") {
    const grouped = createCompetitiveIntelTabGroups(workflow.enrichmentPlan);
    if (!grouped.ok) {
      return { message: grouped.message };
    }
    const preview = buildGroupPreviewMarkdown(grouped.groups);
    updateCompetitiveIntelWorkflow({ step: "report" });
    return {
      message: workflowMessage(preview, "awaiting_continue"),
    };
  }

  if (workflow.step === "report") {
    if (!workflowConfirmed) {
      return {
        message: workflowMessage(
          [
            "## Ready to generate your report",
            "",
            "Competitor tiers, enrichment tabs, and tab groups are set.",
            "",
            "This report reads your **CI — High / Medium / Low / Adjacent** tab groups (same pipeline as research brief).",
            "",
            "Click **Generate report** below to build your grounded competitive intelligence report.",
            buildReportTokenEstimateSection(workflow),
          ].join("\n"),
          "awaiting_continue"
        ),
      };
    }
    const quotaFromArgs = normalizeCiQuotaMode(stringArg(args, "quota_mode"));
    const workflowAction = stringArg(args, "workflow_action");
    const quotaMode =
      quotaFromArgs !== "default"
        ? quotaFromArgs
        : workflowAction === CI_REPORT_COMPACT_SENTINEL
          ? "compact"
          : workflow.quotaMode || "default";
    updateCompetitiveIntelWorkflow({ quotaMode });
    const built = await synthesizeCompetitiveIntelReport(workflow, undefined, {
      quotaMode,
    });
    if (!built.ok) {
      return { message: built.message };
    }
    return { message: built.message };
  }

  if (workflow.step === "done") {
    const expandAction = stringArg(args, "workflow_action");
    if (expandAction === "expand_external_ai" && workflowConfirmed) {
      const { openedUrls, toolNames } = openDiscoveryToolTabs();
      const discoveryTabIds = collectDiscoveryTabIds([], openedUrls);
      updateCompetitiveIntelWorkflow({
        step: "expand",
        discoveryToolUrls: openedUrls,
        discoveryTabIds,
      });
      return {
        message: workflowMessage(
          buildExpandIntroMarkdown(workflow.discoveryQuery, toolNames),
          "awaiting_user"
        ),
      };
    }
    if (expandAction === "review_deepen" && workflowConfirmed) {
      updateCompetitiveIntelWorkflow({ enrichmentProfile: "review_deepen" });
      const enrichmentPlan = buildEnrichmentPlan(
        workflow.companies,
        "review_deepen"
      );
      const openedAll = await openAllEnrichmentBatches(
        enrichmentPlan,
        "review_deepen"
      );
      updateCompetitiveIntelWorkflow({
        step: "enrich",
        enrichmentPlan: openedAll.plan,
        enrichmentBatchIndex: openedAll.batchCount,
      });
      const progress = buildEnrichmentProgressMarkdown(
        workflow.companies,
        openedAll.openedCount,
        openedAll.batchCount,
        "review_deepen"
      );
      return {
        message: workflowMessage(
          [
            "## Review site enrichment",
            "",
            "Opening G2/Capterra tabs with slower batching. G2 may show verification prompts — those tabs will be skipped during synthesis.",
            "",
            progress,
          ].join("\n"),
          "in_progress"
        ),
      };
    }
    if (expandAction === "regenerate_report" && workflowConfirmed) {
      updateCompetitiveIntelWorkflow({ step: "report" });
      const refreshed = getCompetitiveIntelWorkflow();
      if (!refreshed) {
        return {
          message: "Workflow state was lost. Start again with your industry.",
        };
      }
      const built = await synthesizeCompetitiveIntelReport(
        refreshed,
        undefined,
        {
          quotaMode: refreshed.quotaMode || "default",
        }
      );
      if (!built.ok) {
        return { message: built.message };
      }
      return { message: built.message };
    }
    return {
      message:
        "The competitive intelligence workflow is complete. Say **expand with external AI** to deepen research, **add review enrichment** for G2/Capterra, or start a new report anytime.",
    };
  }

  return {
    message: workflowMessage(
      "Something went wrong in the workflow. Reply **continue** to retry the current step, or start a new report.",
      "awaiting_continue"
    ),
  };
}
