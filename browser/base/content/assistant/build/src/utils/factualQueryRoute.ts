import type { DeterministicRouteDecision, RouteArgs } from "./routerTypes.js";

const BROWSER_CONTEXT_EXCLUDE =
  /\b(?:in\s+this\s+tab|on\s+this\s+page|current\s+tab|this\s+tab|active\s+tab)\b/i;

const FACTUAL_PATTERNS: RegExp[] = [
  /\bwho\s+(?:is|was)\s+(?!in\b)(.+)/i,
  /\bwhat\s+is\s+the\s+(?:capital|population|currency|leader|president)\s+of\b/i,
  /\bwhat\s+(?:year|date)\s+(?:was|did|is)\b/i,
  /\bcurrent\s+(?:president|prime\s+minister|ceo|pope)\b/i,
  /\bhow\s+old\s+is\b/i,
  /\bhow\s+many\s+(?:people|countries|states)\b/i,
  /\bwhen\s+(?:was|did|is)\s+.+\s+(?:born|founded|invented)\b/i,
  /\bwhere\s+(?:is|was)\s+.+\s+(?:located|born)\b/i,
];

function toolDecision(
  next: string,
  reason: string,
  args: RouteArgs
): DeterministicRouteDecision {
  return { type: "tool", next, args, reason };
}

function cleanFactualQuery(input: string): string {
  return String(input || "")
    .trim()
    .replace(/[.!?]+$/g, "")
    .trim();
}

export function resolveFactualQueryRoute(
  input: string
): DeterministicRouteDecision | null {
  const text = cleanFactualQuery(input);
  if (!text || BROWSER_CONTEXT_EXCLUDE.test(text)) {
    return null;
  }
  for (const pattern of FACTUAL_PATTERNS) {
    if (pattern.test(text)) {
      return toolDecision("web_search", "factual-query", { query: text });
    }
  }
  return null;
}
