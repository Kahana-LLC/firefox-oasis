/** Deterministic fallback for exact summarize-page commands. */
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

function normalizeExactSummaryInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .trim();
}

const SUMMARIZE_ROUTES: readonly SummarizeRoute[] = [
  {
    reason: "summarize-current-page",
    resolve: input => {
      const normalized = normalizeExactSummaryInput(input);
      return new Set([
        "summarize this page",
        "summarize this tab",
        "summarize current page",
        "summarize current tab",
        "summarize active page",
        "summarize active tab",
      ]).has(normalized)
        ? { query: input.trim() }
        : null;
    },
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
      return { index, query: input.trim() };
    },
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
