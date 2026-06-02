import type { ClarificationOption } from "../../../shared/contracts.js";
import type { InteractionCommandArgs } from "../services/interactionState.js";

export const ORGANIZE_TABS_RESUME_SENTINEL = "__ORGANIZE_TABS_RESUME__";

export type OrganizeTabsResumeReason = "ambiguous_group" | "over_quota";

export type OrganizeTabsResumeContext = {
  args: InteractionCommandArgs;
  reason: OrganizeTabsResumeReason;
};

let resumeContext: OrganizeTabsResumeContext | null = null;

export function setOrganizeTabsResume(
  context: OrganizeTabsResumeContext | null
): void {
  resumeContext = context;
}

export function getOrganizeTabsResume(): OrganizeTabsResumeContext | null {
  return resumeContext;
}

export function clearOrganizeTabsResume(): void {
  resumeContext = null;
}

export function buildOrganizeTabsResumePrompt(optionId: string): string {
  return `${ORGANIZE_TABS_RESUME_SENTINEL}|${optionId}`;
}

export function parseOrganizeTabsResumePrompt(
  resolvedPrompt: string
): string | null {
  const raw = String(resolvedPrompt || "").trim();
  if (!raw.startsWith(ORGANIZE_TABS_RESUME_SENTINEL)) {
    return null;
  }
  const parts = raw.split("|");
  return parts[1]?.trim() || null;
}

export function consumeOrganizeTabsResume(
  optionId: string
): InteractionCommandArgs | null {
  const ctx = resumeContext;
  if (!ctx) {
    return null;
  }
  clearOrganizeTabsResume();

  const args: InteractionCommandArgs = {
    ...ctx.args,
    preview_confirmed: true,
  };

  if (ctx.reason === "ambiguous_group") {
    const prefix = "organize_group:";
    if (!optionId.startsWith(prefix)) {
      return null;
    }
    args.name = decodeURIComponent(optionId.slice(prefix.length));
    return args;
  }

  if (optionId === "organize_quota_fewer_tabs") {
    const maxTabs = args.suggested_max_tabs;
    if (typeof maxTabs === "number" && Number.isFinite(maxTabs)) {
      args.max_tabs = maxTabs;
    }
    return args;
  }

  return null;
}

export type GroupClarifyCandidate = {
  id: string;
  label: string;
  name: string;
  tabCount: number;
};

export function buildAmbiguousGroupOrganizeClarification(
  query: string,
  candidates: GroupClarifyCandidate[]
): { options: ClarificationOption[]; message: string } {
  const options = candidates.map(candidate => ({
    id: candidate.id,
    label: candidate.label,
    resolvedPrompt: buildOrganizeTabsResumePrompt(candidate.id),
  }));
  return {
    options,
    message: `Several tab groups match "${query}". Pick one to organize.`,
  };
}

export function buildOrganizeOverQuotaClarification(params: {
  suggestedTabCount: number;
}): { options: ClarificationOption[]; message: string } {
  const options: ClarificationOption[] = [
    {
      id: "organize_quota_fewer_tabs",
      label: `Organize first ${params.suggestedTabCount} tabs only`,
      resolvedPrompt: buildOrganizeTabsResumePrompt(
        "organize_quota_fewer_tabs"
      ),
    },
  ];
  return {
    options,
    message: `There are many tabs in scope. Choose how many to include in this organize pass.`,
  };
}
