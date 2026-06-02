import { isRecord } from "../assistant/messageUtils.js";
import type {
  OrganizeTabsClusterPlan,
  OrganizeTabsGroupPlan,
  OrganizeTabsMode,
  TabCatalogEntry,
} from "./organizeTabsTypes.js";

const GENERIC_TITLE_RE =
  /^(new tab|\(untitled\)|untitled|about:blank|loading…?|mozilla firefox)$/i;

export function isAmbiguousTab(entry: {
  title: string;
  url: string;
  domain: string;
}): boolean {
  const title = String(entry.title || "").trim();
  if (!title || GENERIC_TITLE_RE.test(title)) {
    return true;
  }
  if (title.length < 12 && entry.domain) {
    return true;
  }
  if (title.toLowerCase() === entry.domain.toLowerCase()) {
    return true;
  }
  return false;
}

export function parseOrganizeTabsClusterPlan(
  raw: unknown,
  mode: OrganizeTabsMode
): OrganizeTabsClusterPlan | null {
  if (!isRecord(raw)) {
    return null;
  }
  const groupsRaw = Array.isArray(raw.groups) ? raw.groups : [];
  const groups: OrganizeTabsGroupPlan[] = [];
  for (const item of groupsRaw) {
    if (!isRecord(item)) {
      continue;
    }
    const name = String(item.name || "").trim();
    const tabIndices = Array.isArray(item.tabIndices)
      ? item.tabIndices
          .map(value => Number(value))
          .filter(value => Number.isFinite(value) && value >= 1)
      : [];
    if (!name || tabIndices.length === 0) {
      continue;
    }
    groups.push({
      name,
      tabIndices: [...new Set(tabIndices)],
      rationale: String(item.rationale || "").trim() || undefined,
    });
  }
  const ungroupedIndices = Array.isArray(raw.ungroupedIndices)
    ? [
        ...new Set(
          raw.ungroupedIndices
            .map(value => Number(value))
            .filter(value => Number.isFinite(value) && value >= 1)
        ),
      ]
    : [];
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.map(value => String(value)).filter(Boolean)
    : [];

  if (groups.length === 0) {
    return null;
  }

  return {
    mode: (String(raw.mode || mode) as OrganizeTabsMode) || mode,
    groups,
    ungroupedIndices,
    warnings,
  };
}

export function validateClusterPlan(
  plan: OrganizeTabsClusterPlan,
  catalog: TabCatalogEntry[],
  maxGroups: number
):
  | { ok: true; plan: OrganizeTabsClusterPlan }
  | { ok: false; message: string } {
  const validIndices = new Set(
    catalog.filter(entry => !entry.pinned).map(entry => entry.index)
  );
  const seen = new Set<number>();
  const sanitizedGroups: OrganizeTabsGroupPlan[] = [];

  for (const group of plan.groups.slice(0, maxGroups)) {
    const indices = group.tabIndices.filter(idx => {
      if (!validIndices.has(idx) || seen.has(idx)) {
        return false;
      }
      seen.add(idx);
      return true;
    });
    if (indices.length === 0) {
      continue;
    }
    sanitizedGroups.push({ ...group, tabIndices: indices });
  }

  if (sanitizedGroups.length === 0) {
    return {
      ok: false,
      message:
        "I couldn't find any tabs to group from that plan. Try naming a focus topic or opening more related tabs.",
    };
  }

  const ungroupedIndices = plan.ungroupedIndices.filter(
    idx => validIndices.has(idx) && !seen.has(idx)
  );

  return {
    ok: true,
    plan: {
      ...plan,
      groups: sanitizedGroups,
      ungroupedIndices,
    },
  };
}
