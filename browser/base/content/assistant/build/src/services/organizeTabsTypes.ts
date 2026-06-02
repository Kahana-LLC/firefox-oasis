import type { BrowserTabLike } from "../types/runtime.js";
import type { ResolveResearchTabsResult } from "./researchBriefTypes.js";

export type OrganizeTabsMode =
  | "single_focus"
  | "multi_topic"
  | "research_vs_other";

export type OrganizeTabsScope =
  | "window"
  | "tab-group"
  | "tabs"
  | "ungrouped_only";

export type TabCatalogEntry = {
  index: number;
  title: string;
  url: string;
  domain: string;
  currentGroup: string | null;
  pinned: boolean;
  snippet?: string;
};

export type OrganizeTabsGroupPlan = {
  name: string;
  tabIndices: number[];
  rationale?: string;
};

export type OrganizeTabsClusterPlan = {
  mode: OrganizeTabsMode;
  groups: OrganizeTabsGroupPlan[];
  ungroupedIndices: number[];
  warnings: string[];
};

export type BuildOrganizeTabsOptions = {
  gBrowser: import("../types/runtime.js").GBrowserLike | null | undefined;
  mode?: OrganizeTabsMode;
  focus?: string;
  name?: string;
  scope: OrganizeTabsScope;
  useActiveTabGroup?: boolean;
  tabQueries?: string[];
  tabIndices?: number[];
  maxGroups?: number;
  maxTabs?: number;
  excludeIndices?: number[];
  excludeQueries?: string[];
  useSnippets?: boolean;
  previewConfirmed?: boolean;
  confirmed?: boolean;
  onProgress?: (detail: {
    phase: "resolving" | "extracting" | "clustering" | "applying";
    label?: string;
    current?: number;
    total?: number;
  }) => void;
  signal?: AbortSignal;
};

export type OrganizeTabsScopePreview = ResolveResearchTabsResult & {
  scopeLabel?: string;
};

export type OrganizeTabsResult =
  | {
      ok: true;
      message: string;
      plan: OrganizeTabsClusterPlan;
      catalog: TabCatalogEntry[];
      scopeLabel: string;
      groupsCreated: string[];
      tabsGrouped: number;
      tabsSkipped: number;
    }
  | {
      ok: true;
      needsPreview: true;
      message: string;
      plan: OrganizeTabsClusterPlan;
      catalog: TabCatalogEntry[];
      scopeLabel: string;
    }
  | {
      ok: true;
      needsCrossGroupConfirm: true;
      message: string;
      plan: OrganizeTabsClusterPlan;
      catalog: TabCatalogEntry[];
      scopeLabel: string;
      affectedGroups: string[];
      emptiedGroups: string[];
    }
  | {
      ok: false;
      message: string;
      code?: "ambiguous_group" | "over_quota";
      candidates?: Array<{ name: string; label: string; tabCount: number }>;
    };

export type TabDescriptorWithIndex = {
  tab: BrowserTabLike;
  index: number;
  title: string;
  url: string;
};
