import type { DeterministicRouteDecision, RouteArgs } from "./routerTypes.js";

const INDUSTRY_PATTERNS: RegExp[] = [
  /\bcompetitive\s+intelligence\s+report\s+on\s+(.+)$/i,
  /\bcompetitive\s+analysis\s+of\s+(.+)$/i,
  /\bbattle\s+card\s+for\s+(?:the\s+)?(.+?)(?:\s+space|\s+market|\s+industry)?$/i,
  /\bwho\s+are\s+the\s+key\s+players\s+in\s+(.+)$/i,
  /\bcompetitive\s+intel(?:ligence)?\s+(?:for|on)\s+(.+)$/i,
];

const CI_BRIEF_FROM_GROUPS_RE =
  /\b(?:competitive\s+intel(?:ligence)?\s+)?(?:brief|battle\s+card)\s+from\s+(?:my\s+)?ci\b/i;
const CI_BRIEF_GROUPS_RE =
  /\b(?:brief|battle\s+card)\s+from\s+(?:my\s+)?(?:ci\s*[—-]\s*)?(high|medium|low|adjacent)\b/i;

function trimQuotes(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function toolDecision(
  next: string,
  reason: string,
  args: RouteArgs
): DeterministicRouteDecision {
  return { type: "tool", next, args, reason };
}

export function extractCompetitiveIntelIndustry(input: string): string | null {
  const normalized = String(input || "").trim();
  for (const pattern of INDUSTRY_PATTERNS) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const industry = trimQuotes(match[1]);
      if (industry.length >= 3) {
        return industry;
      }
    }
  }
  return null;
}

export function looksLikeCompetitiveIntelCommand(input: string): boolean {
  const normalized = String(input || "")
    .trim()
    .toLowerCase();
  return (
    /\bcompetitive\s+intelligence\b/.test(normalized) ||
    /\bcompetitive\s+analysis\b/.test(normalized) ||
    /\bbattle\s+card\b/.test(normalized) ||
    /\bwho\s+are\s+the\s+key\s+players\b/.test(normalized) ||
    /\bcompetitive\s+intel\b/.test(normalized)
  );
}

export function looksLikeCiBriefFromGroupsCommand(input: string): boolean {
  const normalized = String(input || "").trim();
  return (
    CI_BRIEF_FROM_GROUPS_RE.test(normalized) ||
    CI_BRIEF_GROUPS_RE.test(normalized) ||
    /\bcompetitive\s+intel(?:ligence)?\s+brief\s+from\s+tab\s+groups?\b/i.test(
      normalized
    )
  );
}

export function resolveExplicitCiBriefRoute(
  input: string
): DeterministicRouteDecision | null {
  if (!looksLikeCiBriefFromGroupsCommand(input)) {
    return null;
  }
  const normalized = String(input || "").trim();
  const tierMatch = normalized.match(CI_BRIEF_GROUPS_RE);
  const industry =
    extractCompetitiveIntelIndustry(normalized) ||
    normalized.match(/\bfor\s+(.+)$/i)?.[1]?.trim() ||
    "competitive intelligence";
  const args: RouteArgs = {
    industry: trimQuotes(industry),
    scope: tierMatch ? "ci_tab_group" : "ci_tab_groups",
  };
  if (tierMatch?.[1]) {
    const tier =
      tierMatch[1].charAt(0).toUpperCase() +
      tierMatch[1].slice(1).toLowerCase();
    args.name = `CI — ${tier}`;
  }
  return toolDecision(
    "build_competitive_intel_brief",
    "ci-brief-from-tab-groups",
    args
  );
}

export function resolveExplicitCompetitiveIntelRoute(
  input: string
): DeterministicRouteDecision | null {
  const briefRoute = resolveExplicitCiBriefRoute(input);
  if (briefRoute) {
    return briefRoute;
  }
  if (!looksLikeCompetitiveIntelCommand(input)) {
    return null;
  }
  const industry = extractCompetitiveIntelIndustry(input);
  if (!industry) {
    return null;
  }
  return toolDecision("run_competitive_intel", "competitive-intel-industry", {
    industry,
  });
}
