import { QuotaExceededError } from "../awsSignedFetch.js";
import {
  OUTREACH_EMAIL_GENERATION_CONFIG,
  OUTREACH_EMAIL_SYSTEM_PROMPT,
  buildOutreachEmailUserMessage,
} from "../prompts/outreachEmailPrompt.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { formatQuotaExceededMessage } from "../utils/quotaUserMessage.js";
import {
  mergeDigestSourcesIntoOutreachEmail,
  outreachEmailToMarkdown,
  outreachEmailToPlainText,
  parseOutreachEmailFromAssistContent,
} from "../utils/outreachEmailFormat.js";
import {
  createResearchBriefProgressReporter,
  throwIfResearchBriefAborted,
  type ResearchBriefProgressCallback,
} from "../utils/researchBriefProgress.js";
import { suggestTabCountForQuota } from "../utils/researchBriefClarify.js";
import { subscriptionService } from "./subscription.js";
import type { GBrowserLike } from "../types/runtime.js";
import type { ResearchScope } from "./researchBriefTypes.js";
import {
  DEFAULT_MAX_TABS,
  estimateSynthesisTokens,
  formatUnreadableDigestsMessage,
  truncateDigestsToBudget,
} from "./researchBriefFormat.js";
import { MAX_TOTAL_CHARS, extractTabDigests } from "./researchBrief.js";
import type {
  OutreachEmailPurpose,
  OutreachEmailTone,
} from "./outreachEmailTypes.js";
import { resolveTabsForOutreachEmail } from "./researchTabSelection.js";
import { assistWithOutputValidationRetry } from "../utils/assistOutputRetry.js";
import { validateOutreachEmailOutput } from "../utils/outputValidators.js";

export type BuildOutreachEmailOptions = {
  gBrowser: GBrowserLike | null | undefined;
  scope: ResearchScope;
  name?: string;
  purpose: OutreachEmailPurpose;
  purposeNotes?: string;
  recipientName?: string;
  recipientRole?: string;
  tone?: OutreachEmailTone;
  tabQueries?: string[];
  tabIndices?: number[];
  maxTabs?: number;
  excludeIndices?: number[];
  excludeQueries?: string[];
  scopeConfirmed?: boolean;
  quotaMode?: "default" | "truncate" | "fewer_tabs";
  useActiveTabGroup?: boolean;
  onProgress?: ResearchBriefProgressCallback;
  signal?: AbortSignal;
};

export type BuildOutreachEmailResult =
  | {
      ok: true;
      markdown: string;
      plainEmail: string;
      draftId: string;
      draft: import("./outreachEmailTypes.js").OutreachEmailDraft;
    }
  | {
      ok: false;
      message: string;
      code?: "over_quota";
      estimate?: number;
      remaining?: number;
      suggestedTabCount?: number;
    };

export async function buildOutreachEmail(
  options: BuildOutreachEmailOptions
): Promise<BuildOutreachEmailResult> {
  const report =
    options.onProgress ?? createResearchBriefProgressReporter(options.signal);

  try {
    report({ phase: "resolving" });
    throwIfResearchBriefAborted(options.signal);

    const resolved = await resolveTabsForOutreachEmail(options, {
      signal: options.signal,
      onProgress: report,
    });

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
        message: formatUnreadableDigestsMessage(digests, resolved.scopeLabel),
      };
    }

    let budgetDigests = digests;
    if (options.quotaMode === "fewer_tabs") {
      const half = Math.max(1, Math.floor(readable.length / 2));
      budgetDigests = digests.slice(0, half);
    } else {
      const budget = truncateDigestsToBudget(digests, MAX_TOTAL_CHARS);
      budgetDigests = budget.digests;
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
        message: `This outreach email may need about ${estimate.toLocaleString()} tokens, but you have about ${display.remaining.toLocaleString()} remaining today.`,
        estimate,
        remaining: display.remaining,
        suggestedTabCount,
      };
    }

    report({
      phase: "synthesizing",
      label: "Drafting your outreach email…",
    });

    const userMessage = buildOutreachEmailUserMessage({
      purpose: options.purpose,
      purposeNotes: options.purposeNotes,
      recipientName: options.recipientName,
      recipientRole: options.recipientRole,
      tone: options.tone,
      scopeLabel: resolved.scopeLabel,
      digests: budgetDigests,
    });

    let draft: import("./outreachEmailTypes.js").OutreachEmailDraft;
    try {
      draft = await assistWithOutputValidationRetry({
        systemPrompt: OUTREACH_EMAIL_SYSTEM_PROMPT,
        userMessage,
        generationConfig: OUTREACH_EMAIL_GENERATION_CONFIG,
        signal: options.signal,
        parse: raw =>
          parseOutreachEmailFromAssistContent(raw, {
            purpose: options.purpose,
            scopeLabel: resolved.scopeLabel,
            recipientName: options.recipientName,
            recipientRole: options.recipientRole,
          }),
        validate: value =>
          validateOutreachEmailOutput(value, options.recipientName),
        validationErrorMessage:
          "I couldn't produce a safe outreach email draft. Please try again.",
      });
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "I couldn't draft the outreach email. Please try again.",
      };
    }

    draft = mergeDigestSourcesIntoOutreachEmail(draft, digests);
    const markdown = outreachEmailToMarkdown(draft);
    const plainEmail = outreachEmailToPlainText(draft);
    const draftId = crypto.randomUUID?.() || String(Date.now());

    return { ok: true, markdown, plainEmail, draftId, draft };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, message: "Outreach email draft cancelled." };
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
    assistantLogger.warn("outreachEmail", "Build failed", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "I couldn't draft the outreach email. Please try again.",
    };
  }
}
