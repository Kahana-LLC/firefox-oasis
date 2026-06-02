import type {
  OrganizeTabsClusterPlan,
  TabCatalogEntry,
} from "./organizeTabsTypes.js";

let cachedPlan: {
  plan: OrganizeTabsClusterPlan;
  catalog: TabCatalogEntry[];
  scopeLabel: string;
} | null = null;

export function storeOrganizeTabsPlan(params: {
  plan: OrganizeTabsClusterPlan;
  catalog: TabCatalogEntry[];
  scopeLabel: string;
}): void {
  cachedPlan = params;
}

export function consumeOrganizeTabsPlan(): {
  plan: OrganizeTabsClusterPlan;
  catalog: TabCatalogEntry[];
  scopeLabel: string;
} | null {
  const value = cachedPlan;
  cachedPlan = null;
  return value;
}

export function peekOrganizeTabsPlan(): typeof cachedPlan {
  return cachedPlan;
}

export function clearOrganizeTabsPlanCache(): void {
  cachedPlan = null;
}
