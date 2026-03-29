/** Routes "open result #N" or "open the first result" follow-up commands to open_search_result. Parses ordinal and numeric index from user input. */
import type { DeterministicRouteDecision, RouteArgs } from "./routerTypes.js";

type SearchResultRoute = {
  reason: string;
  resolve: (input: string) => RouteArgs | null;
};

function toolDecision(
  next: string,
  reason: string,
  args: RouteArgs
): DeterministicRouteDecision {
  return { type: "tool", next, args, reason };
}

function parseSearchResultIndex(input: string): number | undefined {
  const lower = String(input || "").toLowerCase();
  if (/\b(?:first|1st)\b/.test(lower)) return 1;
  if (/\b(?:second|2nd)\b/.test(lower)) return 2;
  if (/\b(?:third|3rd)\b/.test(lower)) return 3;
  if (/\b(?:fourth|4th)\b/.test(lower)) return 4;
  if (/\b(?:fifth|5th)\b/.test(lower)) return 5;

  const numbered = lower.match(/(?:result\s*|number\s*|#)(\d+)/i);
  if (!numbered?.[1]) {
    return undefined;
  }
  const parsed = Number(numbered[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const SEARCH_RESULT_ROUTES: readonly SearchResultRoute[] = [
  {
    reason: "search-result-explicit-url",
    resolve: input => {
      const match = input.match(
        /(?:open|go\s+to)\s+(?:the\s+)?(?:search\s+)?result(?:\s+url)?\s+(?<url>https?:\/\/[^\s]+|[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i
      );
      const url = match?.groups?.url?.trim();
      return url ? { url } : null;
    },
  },
  {
    reason: "search-result-followup",
    resolve: input => {
      if (!/^(?:open|go\s+to)\b/i.test(input)) {
        return null;
      }
      const index = parseSearchResultIndex(input);
      if (index != null) {
        return { index };
      }
      if (!/\b(?:it|that|this|one|result|last)\b/i.test(input)) {
        return null;
      }
      return {};
    },
  },
];

export function resolveExplicitSearchResultRoute(
  input: string
): DeterministicRouteDecision | null {
  for (const route of SEARCH_RESULT_ROUTES) {
    const args = route.resolve(input);
    if (args) {
      return toolDecision("open_search_result", route.reason, args);
    }
  }
  return null;
}
