import type { CompetitiveIntelWorkflowState } from "./competitiveIntelTypes.js";
import {
  DEFAULT_COMPETITIVE_TIERS,
  DEFAULT_ENRICHMENT_PROFILE,
  DEFAULT_MAX_COMPETITORS,
} from "./competitiveIntelTypes.js";

let activeWorkflow: CompetitiveIntelWorkflowState | null = null;
const CI_WORKFLOW_STORAGE_KEY = "oasis.ci.workflow";

function persistWorkflowSnapshot(): void {
  if (!activeWorkflow) {
    try {
      sessionStorage.removeItem(CI_WORKFLOW_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
    return;
  }
  try {
    sessionStorage.setItem(
      CI_WORKFLOW_STORAGE_KEY,
      JSON.stringify(activeWorkflow)
    );
  } catch {
    // ignore storage failures
  }
}

export function restoreCompetitiveIntelWorkflowFromStorage(): CompetitiveIntelWorkflowState | null {
  if (activeWorkflow) {
    return activeWorkflow;
  }
  try {
    const raw = sessionStorage.getItem(CI_WORKFLOW_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CompetitiveIntelWorkflowState;
    if (!parsed?.step) {
      return null;
    }
    activeWorkflow = {
      ...parsed,
      enrichmentProfile: parsed.enrichmentProfile || DEFAULT_ENRICHMENT_PROFILE,
    };
    return activeWorkflow;
  } catch {
    return null;
  }
}

export function createWorkflowId(): string {
  return `ci_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildDiscoveryQuery(industry: string, focus?: string): string {
  const focusClause = focus?.trim() ? ` Focus on ${focus.trim()}.` : "";
  return `List the key players and secondary/adjacent companies in ${industry.trim()}.${focusClause} For each company include: company name, one-line description, why they matter, official website URL, G2 product URL, Capterra product URL, Wikipedia article URL, and Gartner Peer Insights URL (if known). Prefer direct product or article links, not search pages. Do not include LinkedIn. Group into: market leaders, strong challengers, niche players, adjacent entrants.`;
}

export function getCompetitiveIntelWorkflow(): CompetitiveIntelWorkflowState | null {
  return activeWorkflow;
}

export function setCompetitiveIntelWorkflow(
  state: CompetitiveIntelWorkflowState | null
): void {
  activeWorkflow = state;
  persistWorkflowSnapshot();
}

export function clearCompetitiveIntelWorkflow(): void {
  activeWorkflow = null;
  persistWorkflowSnapshot();
}

export function initCompetitiveIntelWorkflow(params: {
  industry: string;
  focus?: string;
  market?: string;
  maxCompetitors?: number;
}): CompetitiveIntelWorkflowState {
  const industry = String(params.industry || "").trim();
  const workflow: CompetitiveIntelWorkflowState = {
    workflowId: createWorkflowId(),
    industry,
    focus: params.focus?.trim() || undefined,
    market: params.market?.trim() || undefined,
    step: "intro",
    discoveryQuery: buildDiscoveryQuery(industry, params.focus),
    discoveryToolUrls: [],
    discoveryTabIds: [],
    companies: [],
    tierLabels: DEFAULT_COMPETITIVE_TIERS.map(
      tier => tier.charAt(0).toUpperCase() + tier.slice(1)
    ),
    enrichmentPlan: [],
    enrichmentBatchIndex: 0,
    enrichmentProfile: DEFAULT_ENRICHMENT_PROFILE,
    maxCompetitors:
      typeof params.maxCompetitors === "number" &&
      Number.isFinite(params.maxCompetitors)
        ? Math.max(3, Math.min(20, Math.floor(params.maxCompetitors)))
        : DEFAULT_MAX_COMPETITORS,
    createdAt: Date.now(),
  };
  activeWorkflow = workflow;
  persistWorkflowSnapshot();
  return workflow;
}

export function advanceCompetitiveIntelStep(
  step: CompetitiveIntelWorkflowState["step"]
): CompetitiveIntelWorkflowState | null {
  if (!activeWorkflow) {
    return null;
  }
  activeWorkflow = { ...activeWorkflow, step };
  persistWorkflowSnapshot();
  return activeWorkflow;
}

export function updateCompetitiveIntelWorkflow(
  patch: Partial<CompetitiveIntelWorkflowState>
): CompetitiveIntelWorkflowState | null {
  if (!activeWorkflow) {
    return null;
  }
  activeWorkflow = { ...activeWorkflow, ...patch };
  persistWorkflowSnapshot();
  return activeWorkflow;
}

export function isCompetitiveIntelWorkflowActive(): boolean {
  return Boolean(activeWorkflow && activeWorkflow.step !== "done");
}

export function tierIdToLabel(tierId: string): string {
  const normalized = String(tierId || "")
    .trim()
    .toLowerCase();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Medium";
}

export function tierLabelToGroupName(label: string): string {
  return `CI — ${String(label || "").trim()}`;
}
