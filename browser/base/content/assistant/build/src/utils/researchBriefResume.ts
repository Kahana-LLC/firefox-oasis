import type { ClarificationOption } from "../../../shared/contracts.js";
import type { InteractionCommandArgs } from "../services/interactionState.js";

export const RESEARCH_BRIEF_RESUME_SENTINEL = "__RESEARCH_BRIEF_RESUME__";

export type ResearchBriefResumeReason = "ambiguous_group" | "over_quota";

export type ResearchBriefResumeContext = {
  args: InteractionCommandArgs;
  reason: ResearchBriefResumeReason;
  command?: string;
};

let resumeContext: ResearchBriefResumeContext | null = null;

export function setResearchBriefResume(
  context: ResearchBriefResumeContext | null
): void {
  resumeContext = context;
}

export function getResearchBriefResume(): ResearchBriefResumeContext | null {
  return resumeContext;
}

export function peekResearchBriefResumeCommand(): string {
  return resumeContext?.command || "build_research_brief";
}

export function clearResearchBriefResume(): void {
  resumeContext = null;
}

export function buildResearchBriefResumePrompt(optionId: string): string {
  return `${RESEARCH_BRIEF_RESUME_SENTINEL}|${optionId}`;
}

export function parseResearchBriefResumePrompt(
  resolvedPrompt: string
): string | null {
  const raw = String(resolvedPrompt || "").trim();
  if (!raw.startsWith(RESEARCH_BRIEF_RESUME_SENTINEL)) {
    return null;
  }
  const parts = raw.split("|");
  return parts[1]?.trim() || null;
}

export function consumeResearchBriefResume(
  optionId: string
): InteractionCommandArgs | null {
  const ctx = resumeContext;
  if (!ctx) {
    return null;
  }
  clearResearchBriefResume();

  const args: InteractionCommandArgs = {
    ...ctx.args,
    scope_confirmed: true,
  };

  if (ctx.reason === "ambiguous_group") {
    const prefix = "brief_group:";
    if (!optionId.startsWith(prefix)) {
      return null;
    }
    args.name = decodeURIComponent(optionId.slice(prefix.length));
    return args;
  }

  if (optionId === "brief_quota_truncate") {
    args.quota_mode = "truncate";
    return args;
  }
  if (optionId === "brief_quota_fewer_tabs") {
    const maxTabs = args.suggested_max_tabs;
    args.quota_mode = "fewer_tabs";
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

export function buildAmbiguousGroupClarification(
  query: string,
  candidates: GroupClarifyCandidate[]
): { options: ClarificationOption[]; message: string } {
  const options = candidates.map(candidate => ({
    id: candidate.id,
    label: candidate.label,
    resolvedPrompt: buildResearchBriefResumePrompt(candidate.id),
  }));
  return {
    options,
    message: `Several tab groups match "${query}". Pick one to continue.`,
  };
}

export function buildOverQuotaClarification(params: {
  estimate: number;
  remaining: number;
  suggestedTabCount: number;
}): { options: ClarificationOption[]; message: string } {
  const options: ClarificationOption[] = [
    {
      id: "brief_quota_truncate",
      label: "Proceed with truncated content",
      resolvedPrompt: buildResearchBriefResumePrompt("brief_quota_truncate"),
    },
    {
      id: "brief_quota_fewer_tabs",
      label: `Use first ${params.suggestedTabCount} tabs only`,
      resolvedPrompt: buildResearchBriefResumePrompt("brief_quota_fewer_tabs"),
    },
  ];
  return {
    options,
    message: `This brief may need about ${params.estimate.toLocaleString()} tokens, but you have about ${params.remaining.toLocaleString()} remaining today. Choose how to continue.`,
  };
}
