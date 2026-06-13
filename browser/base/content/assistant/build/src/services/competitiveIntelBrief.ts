import {
  DEFAULT_COMPETITIVE_TIERS,
  type CompetitiveCompany,
} from "./competitiveIntelTypes.js";
import {
  inferCompaniesFromCiGroups,
  resolveCiReportTabs,
} from "./competitiveIntelResolve.js";
import { getCompetitiveIntelWorkflow } from "./competitiveIntelWorkflow.js";
import { tabTitle, tabUrl } from "./firefoxFacade.js";

export type CiBriefScope = "ci_tab_groups" | "ci_tab_group";

export function previewCiBriefScope(params: {
  scope?: string;
  groupName?: string;
  enrichmentPlan?: Array<{ companyName: string; tier: string; urls: string[] }>;
}):
  | {
      ok: true;
      scopeLabel: string;
      tabCount: number;
      groupLabels: string[];
      companies: CompetitiveCompany[];
    }
  | { ok: false; message: string } {
  const scope =
    params.scope === "ci_tab_group" ? "ci_tab_group" : "ci_tab_groups";
  const resolved = resolveCiReportTabs({
    tierLabels: DEFAULT_COMPETITIVE_TIERS,
    enrichmentPlan: params.enrichmentPlan || [],
    groupName: scope === "ci_tab_group" ? params.groupName : undefined,
  });

  if (resolved.tabs.length === 0) {
    return {
      ok: false,
      message:
        "No tabs found in CI tier tab groups. Create **CI — High / Medium / Low / Adjacent** groups or run the competitive intelligence workflow first.",
    };
  }

  const workflow = getCompetitiveIntelWorkflow();
  const companies = workflow?.companies?.length
    ? workflow.companies
    : inferCompaniesFromCiGroups([], resolved.tabs);

  return {
    ok: true,
    scopeLabel: resolved.scopeLabel,
    tabCount: resolved.tabs.length,
    groupLabels: resolved.groupLabels,
    companies,
  };
}

export function buildCiBriefScopePreviewDescription(preview: {
  scopeLabel: string;
  tabCount: number;
  groupLabels: string[];
  companies: CompetitiveCompany[];
}): string {
  const companyLines = preview.companies
    .slice(0, 12)
    .map(company => `- ${company.name}`)
    .join("\n");
  const groups =
    preview.groupLabels.length > 0
      ? preview.groupLabels.join(", ")
      : preview.scopeLabel;
  return [
    "## Competitive intelligence brief scope",
    "",
    `**Tab groups:** ${groups}`,
    `**Tabs:** ${preview.tabCount}`,
    `**Competitors tracked:** ${preview.companies.length}`,
    companyLines ? `\n${companyLines}` : "",
    "",
    "Proceed to build a grounded competitive intelligence battle card from these tab groups?",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ciBriefTabLines(
  tabs: ReturnType<typeof resolveCiReportTabs>["tabs"]
): string[] {
  return tabs.slice(0, 8).map(tab => `- ${tabTitle(tab)} (${tabUrl(tab)})`);
}
