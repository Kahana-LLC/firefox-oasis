import type { BrowserTabLike } from "../types/runtime.js";
import type { TabCatalogEntry } from "./organizeTabsTypes.js";

export type RelevantTabContext = {
  kind: "brief" | "outreach";
  focusQuery: string;
  topic?: string;
  outlineHint?: string;
  purpose?: string;
  purposeNotes?: string;
  recipientName?: string;
  recipientRole?: string;
};

export type RelevantTabRankedEntry = TabCatalogEntry & {
  score: number;
};

export type RelevantTabSelectionPlan = {
  selectedIndices: number[];
  rationale: string;
  warnings: string[];
};

export type CachedRelevantTabSelection = {
  tabs: BrowserTabLike[];
  scopeLabel: string;
  rationale: string;
  warnings: string[];
  catalog: TabCatalogEntry[];
  focusQuery: string;
};
