import { classifyCommandFamily, looksActionableText } from "./intentParser.js";
import { resolveExplicitRoute } from "./explicitRouteRules.js";
import { resolveManifestListRoute } from "./manifestListResolver.js";
import { resolveManifestSearchRoute } from "./manifestSearchResolver.js";
import { resolveManifestMutationRoute } from "./manifestMutationResolver.js";
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
