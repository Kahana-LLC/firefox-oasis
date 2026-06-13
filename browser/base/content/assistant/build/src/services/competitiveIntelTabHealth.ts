import { getChromeContext, getTabs, tabUrl } from "./firefoxFacade.js";

export type TabHealthResult = {
  healthy: boolean;
  reason?: string;
};

const UNHEALTHY_TITLE_PATTERNS = [
  /page not found/i,
  /not found/i,
  /404/i,
  /verification required/i,
  /\bretry\b/i,
  /automated bot activity/i,
  /access denied/i,
  /we couldn't find/i,
];

const UNHEALTHY_URL_PATTERNS = [/g2\.com\/search/i];

export function assessTabHealth(url: string, title: string): TabHealthResult {
  const lowerTitle = String(title || "")
    .trim()
    .toLowerCase();
  const lowerUrl = String(url || "")
    .trim()
    .toLowerCase();

  if (!lowerUrl || lowerUrl === "about:blank") {
    return { healthy: false, reason: "Blank or missing URL" };
  }

  for (const pattern of UNHEALTHY_URL_PATTERNS) {
    if (pattern.test(lowerUrl) && /g2\.com/.test(lowerUrl)) {
      return { healthy: false, reason: "G2 search page (skipped)" };
    }
  }

  for (const pattern of UNHEALTHY_TITLE_PATTERNS) {
    if (pattern.test(lowerTitle)) {
      return { healthy: false, reason: `Unhealthy page title: ${title}` };
    }
  }

  return { healthy: true };
}

export function findUnhealthyOpenedTabs(
  openedUrls: string[]
): Array<{ url: string; title: string; reason: string }> {
  const { gBrowser } = getChromeContext();
  const tabs = getTabs(gBrowser);
  const unhealthy: Array<{ url: string; title: string; reason: string }> = [];
  const openedSet = new Set(openedUrls);

  for (const tab of tabs) {
    const url = tabUrl(tab);
    if (
      !openedSet.has(url) &&
      !openedUrls.some(opened => url.startsWith(opened))
    ) {
      continue;
    }
    const title = String(tab?.label || tab?.linkedBrowser?.contentTitle || "");
    const health = assessTabHealth(url, title);
    if (!health.healthy) {
      unhealthy.push({
        url,
        title,
        reason: health.reason || "Unhealthy tab",
      });
    }
  }
  return unhealthy;
}
