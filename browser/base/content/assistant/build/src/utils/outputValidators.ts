import { assistantLogger } from "./assistantLogger.js";
import type { TabCatalogEntry } from "../services/organizeTabsTypes.js";
import type { OrganizeTabsClusterPlan } from "../services/organizeTabsTypes.js";
import type { OutreachEmailDraft } from "../services/outreachEmailTypes.js";
import type {
  ResearchBrief,
  TabDigest,
} from "../services/researchBriefTypes.js";
import type { CompetitiveIntelReport } from "../services/competitiveIntelTypes.js";
import type { RelevantTabSelectionPlan } from "../services/relevantTabTypes.js";
import { containsInjectionBoilerplate } from "./untrustedContent.js";
import {
  buildDigestUrlIndex,
  normalizeCompanyKey,
  quoteMatchesDigestContent,
  resolveDigestUrl,
} from "./competitiveIntelReportAlign.js";

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
  return quoteMatchesDigestContent(quote, digests);
}

function companyAllowed(name: string, allowed: Set<string>): boolean {
  const key = normalizeCompanyKey(name);
  if (!key || allowed.size === 0) {
    return allowed.size === 0;
  }
  if (allowed.has(key)) {
    return true;
  }
  for (const candidate of allowed) {
    if (key.includes(candidate) || candidate.includes(key)) {
      return true;
    }
  }
  return false;
}

function digestUrlAllowed(
  url: string,
  index: ReturnType<typeof buildDigestUrlIndex>
): boolean {
  return Boolean(resolveDigestUrl(url, index));
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
  if (
    containsInjectionBoilerplate(body) ||
    containsInjectionBoilerplate(subject)
  ) {
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
    return {
      ok: false,
      reason: "Executive summary contains injection boilerplate",
    };
  }

  return { ok: true };
}

export function validateCompetitiveIntelOutput(
  report: CompetitiveIntelReport,
  options: { digests: TabDigest[]; allowedCompanies: string[] }
): { ok: true } | { ok: false; reason: string } {
  const index = buildDigestUrlIndex(options.digests);
  const allowed = new Set(
    options.allowedCompanies.map(name => normalizeCompanyKey(name))
  );

  for (const source of report.sources || []) {
    if (!digestUrlAllowed(source.url, index)) {
      return { ok: false, reason: "Source URL not in digest set" };
    }
    for (const quote of source.quotes || []) {
      if (!quoteMatchesDigest(quote.text, options.digests)) {
        return { ok: false, reason: "Quote not grounded in digest content" };
      }
    }
  }

  for (const competitor of report.competitors || []) {
    if (!companyAllowed(competitor.name, allowed)) {
      return { ok: false, reason: "Competitor not in confirmed pool" };
    }
    for (const url of competitor.sourceUrls || []) {
      if (url && !digestUrlAllowed(url, index)) {
        return { ok: false, reason: "Competitor source URL not in digest set" };
      }
    }
    for (const quote of competitor.quotes || []) {
      if (!quoteMatchesDigest(quote, options.digests)) {
        return { ok: false, reason: "Competitor quote not grounded" };
      }
    }
  }

  for (const cell of report.comparisonMatrix?.cells || []) {
    for (const url of cell.sourceUrls || []) {
      if (url && !digestUrlAllowed(url, index)) {
        return {
          ok: false,
          reason: "Matrix cell source URL not in digest set",
        };
      }
    }
  }

  if (containsInjectionBoilerplate(report.executiveSummary)) {
    return {
      ok: false,
      reason: "Executive summary contains injection boilerplate",
    };
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
