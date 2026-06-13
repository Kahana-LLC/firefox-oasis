import type { InteractionCommandArgs } from "../services/interactionState.js";

export const CI_QUOTA_RESUME_SENTINEL = "__CI_QUOTA_RESUME__";

export type CiQuotaResumeContext = {
  args: InteractionCommandArgs;
  command: string;
};

let resumeContext: CiQuotaResumeContext | null = null;

export function setCiQuotaResume(context: CiQuotaResumeContext | null): void {
  resumeContext = context;
}

export function getCiQuotaResume(): CiQuotaResumeContext | null {
  return resumeContext;
}

export function peekCiQuotaResumeCommand(): string {
  return resumeContext?.command || "run_competitive_intel";
}

export function clearCiQuotaResume(): void {
  resumeContext = null;
}

export function buildCiQuotaResumePrompt(optionId: string): string {
  return `${CI_QUOTA_RESUME_SENTINEL}|${optionId}`;
}

export function parseCiQuotaResumePrompt(
  resolvedPrompt: string
): string | null {
  const raw = String(resolvedPrompt || "").trim();
  if (!raw.startsWith(CI_QUOTA_RESUME_SENTINEL)) {
    return null;
  }
  const parts = raw.split("|");
  return parts[1]?.trim() || null;
}

export function consumeCiQuotaResume(
  optionId: string
): InteractionCommandArgs | null {
  const ctx = resumeContext;
  if (!ctx) {
    return null;
  }
  clearCiQuotaResume();

  if (optionId === "ci_quota_cancel") {
    return null;
  }

  const args: InteractionCommandArgs = {
    ...ctx.args,
    workflow_confirmed: true,
  };

  if (optionId === "ci_quota_compact") {
    args.quota_mode = "compact";
    return args;
  }
  if (optionId === "ci_quota_truncate") {
    args.quota_mode = "truncate";
    return args;
  }
  if (optionId === "ci_quota_fewer_tabs") {
    args.quota_mode = "fewer_tabs";
    const maxTabs = ctx.args.suggested_max_tabs;
    if (typeof maxTabs === "number" && Number.isFinite(maxTabs)) {
      args.max_tabs = maxTabs;
    }
    return args;
  }

  return null;
}
