import type { BrowserTabLike } from "../types/runtime.js";

export type ResearchBriefQuote = {
  text: string;
  context?: string;
};

export type ResearchBriefSource = {
  title: string;
  url: string;
  status: "ok" | "skipped" | "failed";
  failureReason?: string;
  keyClaims: string[];
  quotes: ResearchBriefQuote[];
};

export type ResearchBriefOutlineSection = {
  heading: string;
  bullets: string[];
};

export type ResearchBriefTheme = {
  label: string;
  synthesis: string;
  sourceUrls: string[];
};

export type ResearchScope = "tab-group" | "window" | "tabs" | "relevant";

export type ResolveResearchTabsResult =
  | {
      ok: true;
      tabs: BrowserTabLike[];
      scopeLabel: string;
      tabsOmittedByLimit: number;
      totalBeforeCap: number;
      urlsDeduplicated: number;
      usedFuzzyGroupMatch: boolean;
      tabQueriesCount: number;
      relevanceRationale?: string;
      relevanceWarnings?: string[];
      usedRelevantSelection?: boolean;
    }
  | {
      ok: false;
      message: string;
      code?: "ambiguous_group" | "over_quota";
      candidates?: Array<{ name: string; label: string; tabCount: number }>;
      estimate?: number;
      remaining?: number;
      suggestedTabCount?: number;
    };

export type ResearchBrief = {
  topic: string;
  topicInferred?: boolean;
  synthesisCharCount?: number;
  generatedAt: string;
  scopeLabel: string;
  executiveSummary: string;
  outline: ResearchBriefOutlineSection[];
  themes: ResearchBriefTheme[];
  sources: ResearchBriefSource[];
  gapsAndContradictions: string[];
};

export type InjectionRiskLevel = "low" | "medium" | "high";

export type TabDigest = {
  title: string;
  url: string;
  content: string;
  status: "ok" | "skipped" | "failed";
  failureReason?: string;
  injectionRisk?: InjectionRiskLevel;
};
