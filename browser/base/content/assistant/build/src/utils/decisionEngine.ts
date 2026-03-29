/**
 * Decision engine — orchestrator for deterministic routing.
 *
 * Tries resolvers in this order:
 * 1. Classify command family (list/search/mutation/other)
 * 2. Run the matching family resolver (manifestList/Search/Mutation)
 * 3. Try explicit route rules (regex patterns for URLs, commands)
 * 4. Try search result and summarize resolvers
 * 5. Check if text looks actionable but unrecognized
 * 6. Return no_match (falls through to chat)
 *
 * Called by deterministicRouter.ts.
 */
import { classifyCommandFamily, looksActionableText } from "./intentParser.js";
import { resolveExplicitRoute } from "./explicitRouteRules.js";
import { resolveManifestListRoute } from "./manifestListResolver.js";
import { resolveManifestSearchRoute } from "./manifestSearchResolver.js";
import { resolveManifestMutationRoute } from "./manifestMutationResolver.js";
import { resolveExplicitSearchResultRoute } from "./searchResultExplicitResolver.js";
import { resolveExplicitSummarizeRoute } from "./summarizeExplicitResolver.js";
import type {
  DeterministicRouteDecision,
  IntentFamily,
  RoutingStateSnapshot,
} from "./routerTypes.js";

type FamilyDecisionHandler = (
  input: string,
  snapshot: RoutingStateSnapshot
) => DeterministicRouteDecision | null;

const FAMILY_HANDLERS: Readonly<Record<IntentFamily, FamilyDecisionHandler | null>> = {
  list: resolveManifestListRoute,
  search: resolveManifestSearchRoute,
  mutation: resolveManifestMutationRoute,
  other: null,
};

export function decideDeterministicRoute(
  commandText: string,
  snapshot: RoutingStateSnapshot
): DeterministicRouteDecision {
  const input = String(commandText || "").trim();
  if (!input) {
    return { type: "no_match", actionable: false, reason: "empty-input" };
  }

  const family = classifyCommandFamily(input);
  const familyHandler = FAMILY_HANDLERS[family];
  if (familyHandler) {
    const familyDecision = familyHandler(input, snapshot);
    if (familyDecision) {
      return familyDecision;
    }
    if (family === "list" || family === "search" || family === "mutation") {
      return {
        type: "chat",
        actionable: true,
        reason: `${family}-family-unresolved`,
        message:
          family === "list"
            ? "I could not determine what list target you meant. Please specify tabs, tab group, or bookmark folder."
            : family === "search"
              ? "I could not determine what to search. Please specify query and optional folder/source."
              : "I could not safely map that mutation request to one command. Please specify the target and action more explicitly.",
      };
    }
  }

  const searchResultExplicit = resolveExplicitSearchResultRoute(input);
  if (searchResultExplicit) {
    return searchResultExplicit;
  }

  const summarizeExplicit = resolveExplicitSummarizeRoute(input);
  if (summarizeExplicit) {
    return summarizeExplicit;
  }

  const explicit = resolveExplicitRoute(input);
  if (explicit) {
    return explicit;
  }

  const actionable = looksActionableText(input);
  if (actionable) {
    return {
      type: "chat",
      actionable: true,
      reason: "actionable-but-unsupported",
      message:
        "I could not safely map that action to a specific browser command. Please be more explicit about the target.",
    };
  }

  return { type: "no_match", actionable: false, reason: "non-actionable" };
}
