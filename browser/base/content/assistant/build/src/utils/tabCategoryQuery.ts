import {
  findTabsByQuery,
  normalizeName,
  tabTitle,
  tabUrl,
  type BrowserTabLike,
  type GBrowserLike,
} from "../services/firefoxFacade.js";

export const TAB_CATEGORY_KEYWORDS: Readonly<
  Record<string, readonly string[]>
> = {
  gmail: ["gmail", "mail.google", "google.com/mail"],
  outlook: ["outlook", "outlook.live", "office.com/mail"],
  yahoo: ["yahoo.com/mail", "mail.yahoo"],
  shopping: [
    "amazon",
    "ebay",
    "etsy",
    "walmart",
    "target",
    "shopify",
    "bestbuy",
    "cart",
    "checkout",
  ],
  email: [
    "gmail",
    "mail.google",
    "google.com/mail",
    "outlook",
    "mail.yahoo",
    "proton.me",
    "fastmail",
    "icloud.com/mail",
  ],
  work: ["slack", "notion", "jira", "linear", "asana", "teams.microsoft"],
  sports: ["espn", "bleacher", "nfl.com", "nba.com", "sports"],
};

const TAB_CATEGORY_PRIORITY: Readonly<Record<string, readonly string[]>> = {
  shopping: ["amazon"],
  email: ["gmail", "mail.google"],
};

export function expandTabSearchKeywords(query: string): string[] {
  const normalized = normalizeName(query);
  if (!normalized) {
    return [];
  }
  const keywords = new Set<string>([normalized]);
  const aliases = TAB_CATEGORY_KEYWORDS[normalized];
  if (aliases) {
    for (const alias of aliases) {
      keywords.add(alias);
    }
  }
  return [...keywords];
}

export function findTabsByIntentQuery(
  gBrowser: GBrowserLike | null | undefined,
  query: string
): BrowserTabLike[] {
  const keywords = expandTabSearchKeywords(query);
  const seen = new Set<BrowserTabLike>();
  const matches: BrowserTabLike[] = [];
  for (const keyword of keywords) {
    for (const tab of findTabsByQuery(gBrowser, keyword)) {
      if (seen.has(tab)) {
        continue;
      }
      seen.add(tab);
      matches.push(tab);
    }
  }
  return matches;
}

export function pickBestTabForIntentQuery(
  tabs: BrowserTabLike[],
  query: string
): BrowserTabLike | null {
  if (tabs.length === 0) {
    return null;
  }
  if (tabs.length === 1) {
    return tabs[0];
  }
  const priorities =
    TAB_CATEGORY_PRIORITY[normalizeName(query)] ??
    expandTabSearchKeywords(query).slice(1);
  for (const priority of priorities) {
    const hit = tabs.find(tab => {
      const hay = normalizeName(`${tabTitle(tab)} ${tabUrl(tab)}`);
      return hay.includes(normalizeName(priority));
    });
    if (hit) {
      return hit;
    }
  }
  return tabs[0];
}
