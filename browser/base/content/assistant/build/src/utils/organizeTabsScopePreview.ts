import { tabTitle } from "../services/firefoxFacade.js";
import type { BrowserTabLike } from "../types/runtime.js";
import type {
  OrganizeTabsClusterPlan,
  OrganizeTabsGroupPlan,
  TabCatalogEntry,
} from "../services/organizeTabsTypes.js";

const PREVIEW_TAB_THRESHOLD = 3;
const PREVIEW_GROUP_THRESHOLD = 1;

export function shouldConfirmOrganizeTabsPlan(params: {
  plan: OrganizeTabsClusterPlan;
  tabsMovingFromExistingGroups: number;
  totalTabsAffected: number;
}): boolean {
  if (params.tabsMovingFromExistingGroups > 0) {
    return true;
  }
  if (params.plan.groups.length > PREVIEW_GROUP_THRESHOLD) {
    return true;
  }
  if (params.totalTabsAffected > PREVIEW_TAB_THRESHOLD) {
    return true;
  }
  return false;
}

export function formatGroupPreview(
  group: OrganizeTabsGroupPlan,
  catalogByIndex: Map<number, TabCatalogEntry>
): string {
  const titles = group.tabIndices
    .map(idx => catalogByIndex.get(idx)?.title || `Tab ${idx}`)
    .filter(Boolean);
  const shown = titles.slice(0, 4);
  const suffix =
    titles.length > shown.length
      ? `, +${titles.length - shown.length} more`
      : "";
  return `"${group.name}" (${group.tabIndices.length} tabs): ${shown.join(", ")}${suffix}`;
}

export function buildOrganizeTabsPreviewDescription(params: {
  scopeLabel: string;
  plan: OrganizeTabsClusterPlan;
  catalog: TabCatalogEntry[];
  tabsMovingFromExistingGroups: number;
}): string {
  const catalogByIndex = new Map(
    params.catalog.map(entry => [entry.index, entry])
  );
  const lines = [
    `I'll organize tabs in ${params.scopeLabel} into ${params.plan.groups.length} group(s):`,
  ];
  for (const group of params.plan.groups) {
    lines.push(`- ${formatGroupPreview(group, catalogByIndex)}`);
  }
  if (params.plan.ungroupedIndices.length > 0) {
    lines.push(
      `- ${params.plan.ungroupedIndices.length} tab(s) will stay ungrouped`
    );
  }
  if (params.tabsMovingFromExistingGroups > 0) {
    lines.push(
      `${params.tabsMovingFromExistingGroups} tab(s) will move from existing group(s).`
    );
  }
  if (params.plan.warnings.length > 0) {
    lines.push(params.plan.warnings[0]);
  }
  lines.push("Continue?");
  return lines.join("\n");
}

export function buildCrossGroupMoveDescription(params: {
  affectedGroups: string[];
  emptiedGroups: string[];
}): string {
  let msg = `Some tabs will move from existing group(s): ${params.affectedGroups.join(", ")}.`;
  if (params.emptiedGroups.length > 0) {
    msg += ` Empty group(s) will be removed: ${params.emptiedGroups.join(", ")}.`;
  }
  msg += " Proceed?";
  return msg;
}

export function formatTabTitlesForOrganizePreview(
  tabs: BrowserTabLike[],
  maxShown = 5
): string {
  const titles = tabs.map(tab => tabTitle(tab)).filter(Boolean);
  const shown = titles.slice(0, maxShown);
  const suffix =
    titles.length > maxShown ? `, +${titles.length - maxShown} more` : "";
  return `${shown.join(", ")}${suffix}`;
}
