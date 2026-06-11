import { assistantLogger } from "./assistantLogger.js";
import type { TabCatalogEntry } from "../services/organizeTabsTypes.js";
import type { OrganizeTabsClusterPlan } from "../services/organizeTabsTypes.js";
import type { OutreachEmailDraft } from "../services/outreachEmailTypes.js";
import type {
  ResearchBrief,
  TabDigest,
} from "../services/researchBriefTypes.js";
import type { RelevantTabSelectionPlan } from "../services/relevantTabTypes.js";
import { containsInjectionBoilerplate } from "./untrustedContent.js";

let validatorRetryCount = 0;
let validatorFailedCount = 0;

export function recordValidatorRetry(): void {
  validatorRetryCount += 1;
  assistantLogger.info("security", "validator_retry");
}

export function recordValidatorFailed(): void {
  validatorFailedCount += 1;
  assistantLogger.info("security", "validator_failed");
}

export function getValidatorRetryCount(): number {
  return validatorRetryCount;
}

export function getValidatorFailedCount(): number {
  return validatorFailedCount;
}

function normalizeForQuoteMatch(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function quoteMatchesDigest(quote: string, digests: TabDigest[]): boolean {
  const normalized = normalizeForQuoteMatch(quote);
  if (!normalized || normalized.length < 8) {
    return true;
  }
  return digests.some(digest => {
    const hay = normalizeForQuoteMatch(digest.content);
    return hay.includes(normalized);
  });
}

export function validateOutreachEmailOutput(
  draft: OutreachEmailDraft,
  trustedRecipientName?: string
): { ok: true } | { ok: false; reason: string } {
  const body = draft.body || "";
  const subject = draft.subject || "";

  if (/https?:\/\//i.test(body) || /https?:\/\//i.test(subject)) {
    return { ok: false, reason: "Body or subject contains URLs" };
  }
  if (/\[[^\]]+\]\([^)]*\)/.test(body) || /\[[^\]]+\]\([^)]*\)/.test(subject)) {
    return { ok: false, reason: "Body or subject contains markdown links" };
  }
  if (/\bwww\.[a-z0-9]/i.test(body) || /\bwww\.[a-z0-9]/i.test(subject)) {
    return { ok: false, reason: "Body or subject contains URLs" };
  }
  if (/[\u2014\u2013]/.test(body) || /[\u2014\u2013]/.test(subject)) {
    return { ok: false, reason: "Body or subject contains em/en dashes" };
  }
  if (containsInjectionBoilerplate(body) || containsInjectionBoilerplate(subject)) {
    return { ok: false, reason: "Output contains injection-like boilerplate" };
  }
  if (
    trustedRecipientName?.trim() &&
    draft.recipientName?.trim() &&
    normalizeForQuoteMatch(draft.recipientName) !==
      normalizeForQuoteMatch(trustedRecipientName)
  ) {
    return { ok: false, reason: "Recipient name does not match trusted input" };
  }
  return { ok: true };
}

export function validateResearchBriefOutput(
  brief: ResearchBrief,
  digests: TabDigest[],
  options: { trustedTopic?: string; topicInferred?: boolean }
): { ok: true } | { ok: false; reason: string } {
  const digestUrls = new Set(digests.map(d => d.url));

  for (const source of brief.sources) {
    if (!digestUrls.has(source.url)) {
      return { ok: false, reason: "Source URL not in digest set" };
    }
    for (const quote of source.quotes) {
      if (!quoteMatchesDigest(quote.text, digests)) {
        return { ok: false, reason: "Quote not grounded in digest content" };
      }
    }
  }

  if (
    options.trustedTopic?.trim() &&
    !options.topicInferred &&
    normalizeForQuoteMatch(brief.topic) !==
      normalizeForQuoteMatch(options.trustedTopic)
  ) {
    return { ok: false, reason: "Topic does not match trusted input" };
  }

  if (containsInjectionBoilerplate(brief.executiveSummary)) {
    return { ok: false, reason: "Executive summary contains injection boilerplate" };
  }

  return { ok: true };
}

export function validateOrganizeTabsPlan(
  plan: OrganizeTabsClusterPlan,
  catalog: TabCatalogEntry[]
): { ok: true } | { ok: false; reason: string } {
  const validIndices = new Set(
    catalog.map(entry => entry.index).filter(index => index >= 1)
  );

  for (const group of plan.groups) {
    if (containsInjectionBoilerplate(group.name)) {
      return { ok: false, reason: "Group name contains injection-like text" };
    }
    for (const index of group.tabIndices) {
      if (!validIndices.has(index)) {
        return { ok: false, reason: "Plan references unknown tab index" };
      }
    }
  }

  for (const index of plan.ungroupedIndices) {
    if (!validIndices.has(index)) {
      return { ok: false, reason: "Ungrouped index not in catalog" };
    }
  }

  return { ok: true };
}

export function validateRelevantTabSelection(
  plan: RelevantTabSelectionPlan,
  catalog: TabCatalogEntry[]
): { ok: true } | { ok: false; reason: string } {
  const validIndices = new Set(
    catalog.map(entry => entry.index).filter(index => index >= 1)
  );

  for (const index of plan.selectedIndices) {
    if (!validIndices.has(index)) {
      return { ok: false, reason: "Selection references unknown tab index" };
    }
  }

  if (/https?:\/\//i.test(plan.rationale)) {
    return { ok: false, reason: "Rationale contains URLs" };
  }
  if (containsInjectionBoilerplate(plan.rationale)) {
    return { ok: false, reason: "Rationale contains injection-like text" };
  }

  return { ok: true };
}
