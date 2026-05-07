/** Routes "summarize this page" / "summarize tab N" commands to summarize_page. Supports current tab, tab index, tab query, and generic summarize patterns. */
import type { DeterministicRouteDecision, RouteArgs } from "./routerTypes.js";

type SummarizeRoute = {
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

function numberArg(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const SUMMARIZE_ROUTES: readonly SummarizeRoute[] = [
  {
    reason: "summarize-current-tab",
    resolve: input =>
      /summarize\s+(?:the\s+)?(?:current|this|active)\s+tab/i.test(input)
        ? {}
        : null,
  },
  {
    reason: "summarize-tab-index",
    resolve: input => {
      const match =
        input.match(/summarize\s+(?:the\s+)?tab\s+(?<index>\d+)/i) ||
        input.match(/summarize\s+(?:the\s+)?(?:first|1st)\s+tab/i);
      if (!match) {
        return null;
      }
      const index = numberArg(match.groups?.index) ?? 1;
      return { index };
    },
  },
  {
    reason: "summarize-tab-query",
    resolve: input => {
      const match = input.match(
        /summarize\s+(?:the\s+)?"?(?<query>[^"\d][^"]+?)"?\s*tab/i
      );
      const query = match?.groups?.query?.trim();
      if (!query || /^(?:current|this|active)$/i.test(query)) {
        return null;
      }
      return { query };
    },
  },
  {
    reason: "summarize-page",
    resolve: input =>
      /summarize\s+(?:this\s+)?(?:page|article|website|site)?|(?:what\s+is|tell\s+me\s+about)\s+this\s+(?:page|article|website|site)|give\s+(?:me\s+)?(?:a\s+)?summary/i.test(
        input
      )
        ? {}
        : null,
  },
];

export function resolveExplicitSummarizeRoute(
  input: string
): DeterministicRouteDecision | null {
  for (const route of SUMMARIZE_ROUTES) {
    const args = route.resolve(input);
    if (args) {
      return toolDecision("summarize_page", route.reason, args);
    }
  }
  return null;
}
