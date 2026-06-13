import type { DeterministicRouteDecision, RouteArgs } from "./routerTypes.js";

const SITE_SEARCH_BUILDERS: Record<string, (query: string) => string> = {
  github: q =>
    `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`,
  reddit: q => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
  medium: q => `https://medium.com/search?q=${encodeURIComponent(q)}`,
  amazon: q => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  wikipedia: q =>
    `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`,
};

const SITE_SEARCH_RE =
  /\b(?:find|search|look\s+for|look\s+up)\s+(.+?)\s+on\s+(github|reddit|medium|amazon|wikipedia)\b/i;

function toolDecision(
  next: string,
  reason: string,
  args: RouteArgs
): DeterministicRouteDecision {
  return { type: "tool", next, args, reason };
}

export function resolveSiteSearchRoute(
  input: string
): DeterministicRouteDecision | null {
  const match = String(input || "")
    .trim()
    .match(SITE_SEARCH_RE);
  if (!match) {
    return null;
  }
  const query = match[1]
    ?.trim()
    .replace(/[.!?]+$/g, "")
    .trim();
  const site = match[2]?.toLowerCase();
  if (!query || !site) {
    return null;
  }
  const buildUrl = SITE_SEARCH_BUILDERS[site];
  if (!buildUrl) {
    return null;
  }
  return toolDecision("open_url", "site-search", { url: buildUrl(query) });
}
