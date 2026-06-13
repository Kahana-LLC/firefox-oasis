import type { ResearchBriefSource } from "./researchBriefTypes.js";

export type CompetitiveTierId = "high" | "medium" | "low" | "adjacent";

export type CompetitiveIntelStep =
  | "intro"
  | "pool"
  | "discovery"
  | "tiers"
  | "enrich"
  | "groups"
  | "report"
  | "done"
  | "expand";

export type EnrichmentProfile = "oasis_first" | "review_deepen";

export type CiQuotaMode = "default" | "compact" | "fewer_tabs" | "truncate";
export type CiReportMode = "full" | "compact";

export type ConfidenceLevel = "high" | "medium" | "low";

export type EnrichmentSourceKind =
  | "homepage"
  | "g2_product"
  | "g2_search"
  | "trustradius_product"
  | "capterra_product"
  | "wikipedia_article"
  | "wikipedia_search"
  | "gartner_reviews"
  | "crunchbase_org";

export type CompetitiveCompany = {
  name: string;
  normalizedName: string;
  description: string;
  tier: CompetitiveTierId;
  suggestedTier?: CompetitiveTierId;
  websiteUrl?: string;
  enrichmentUrls?: Partial<Record<EnrichmentSourceKind, string>>;
  sourceUrls: string[];
  mentionCount: number;
};

export type EnrichmentPlanEntry = {
  companyName: string;
  tier: CompetitiveTierId;
  urls: string[];
  tabIds?: number[];
};

export type CompetitiveIntelWorkflowState = {
  workflowId: string;
  industry: string;
  focus?: string;
  market?: string;
  step: CompetitiveIntelStep;
  discoveryQuery: string;
  discoveryToolUrls: string[];
  discoveryTabIds: number[];
  companies: CompetitiveCompany[];
  tierLabels: string[];
  enrichmentPlan: EnrichmentPlanEntry[];
  enrichmentBatchIndex: number;
  enrichmentProfile: EnrichmentProfile;
  reportId?: string;
  quotaMode?: CiQuotaMode;
  maxCompetitors: number;
  createdAt: number;
};

export type ComparisonMatrixCell = {
  competitor: string;
  dimension: string;
  assessment: string;
  confidence: ConfidenceLevel;
  sourceUrls: string[];
};

export type CompetitiveIntelReport = {
  industry: string;
  generatedAt: string;
  executiveSummary: string;
  overallConfidence: ConfidenceLevel;
  confidenceRationale: string;
  confidenceRefinementEligible: boolean;
  competitors: Array<{
    name: string;
    tier: string;
    sizeSignal: string;
    differentiators: string[];
    customerFeedback: string[];
    verticalFocus: string[];
    confidence: ConfidenceLevel;
    sourceUrls: string[];
    quotes?: string[];
  }>;
  comparisonMatrix: {
    dimensions: string[];
    cells: ComparisonMatrixCell[];
  };
  tierRationale: Array<{
    tier: string;
    whyRelevant: string;
    tabGroupLabel: string;
  }>;
  sources: ResearchBriefSource[];
  gapsAndContradictions: string[];
};

export const DEFAULT_COMPETITIVE_TIERS: CompetitiveTierId[] = [
  "high",
  "medium",
  "low",
  "adjacent",
];

export const DEFAULT_MAX_COMPETITORS = 12;
export const CI_TAB_GROUP_PREFIX = "CI — ";
export const CI_MAX_ENRICHMENT_TABS_PER_COMPANY = 3;
export const CI_ENRICHMENT_BATCH_SIZE = 3;
export const CI_ENRICHMENT_BATCH_DELAY_MS = 700;
export const CI_ENRICHMENT_G2_BATCH_DELAY_MS = 3000;
export const CI_ENRICHMENT_LARGE_TAB_THRESHOLD = 24;
export const DEFAULT_ENRICHMENT_PROFILE: EnrichmentProfile = "oasis_first";
