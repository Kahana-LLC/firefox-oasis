/**
 * Decision engine — orchestrator for deterministic routing.
 *
 * Tries resolvers in this order:
 * 1. Classify command family (list/search/mutation/other)
 * 2. Run the matching family resolver (manifestList/Search/Mutation)
 * 3. Try explicit route rules (regex patterns for URLs, commands)
 * 4. Try search result and exact summarize fallback
 * 5. Check if text looks actionable but unrecognized
 * 6. Return no_match (falls through to chat)
 *
 * Called by deterministicRouter.ts.
 */
import { kahanaUrl } from "../../../shared/kahanaSiteOrigin.js";
import {
  looksLikeCommandChain,
  splitCommandChain,
} from "../assistant/commandChain.js";
import { classifyCommandFamily, looksActionableText } from "./intentParser.js";
import { resolveExplicitRoute } from "./explicitRouteRules.js";
import { resolveManifestListRoute } from "./manifestListResolver.js";
import { resolveManifestSearchRoute } from "./manifestSearchResolver.js";
import { resolveExplicitMutationRoute } from "./mutationExplicitResolver.js";
import { resolveManifestMutationRoute } from "./manifestMutationResolver.js";
import { resolveExplicitSearchResultRoute } from "./searchResultExplicitResolver.js";
import { resolveExplicitSummarizeRoute } from "./summarizeExplicitResolver.js";
import {
  looksLikeResearchBriefCommand,
  resolveExplicitResearchBriefRoute,
} from "./researchBriefExplicitResolver.js";
import {
  looksLikeOrganizeTabsCommand,
  resolveExplicitOrganizeTabsRoute,
} from "./organizeTabsExplicitResolver.js";
import {
  looksLikeOutreachEmailCommand,
  resolveExplicitOutreachEmailRoute,
} from "./outreachEmailExplicitResolver.js";
import {
  looksLikeCompetitiveIntelCommand,
  resolveExplicitCompetitiveIntelRoute,
} from "./competitiveIntelExplicitResolver.js";
import { resolveFactualQueryRoute } from "./factualQueryRoute.js";
import { resolveSiteSearchRoute } from "./siteSearchUrls.js";
import type {
  DeterministicRouteDecision,
  IntentFamily,
  RoutingStateSnapshot,
} from "./routerTypes.js";

type FamilyDecisionHandler = (
  input: string,
  snapshot: RoutingStateSnapshot
) => DeterministicRouteDecision | null;

const FAMILY_HANDLERS: Readonly<
  Record<IntentFamily, FamilyDecisionHandler | null>
> = {
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

  if (looksLikeCommandChain(input)) {
    const chain = splitCommandChain(input, 3);
    if (chain.commands.length > 1) {
      return {
        type: "no_match",
        actionable: true,
        reason: "compound-deferred",
      };
    }
  }

  const factualRoute = resolveFactualQueryRoute(input);
  if (factualRoute) {
    return factualRoute;
  }

  const siteSearchRoute = resolveSiteSearchRoute(input);
  if (siteSearchRoute) {
    return siteSearchRoute;
  }

  const mutationExplicit = resolveExplicitMutationRoute(input);
  if (mutationExplicit) {
    return mutationExplicit;
  }

  if (looksLikeOutreachEmailCommand(input)) {
    const outreachEarly = resolveExplicitOutreachEmailRoute(input, snapshot);
    if (outreachEarly) {
      return outreachEarly;
    }
    return {
      type: "no_match",
      actionable: true,
      reason: "outreach-email-unresolved",
    };
  }

  if (looksLikeCompetitiveIntelCommand(input)) {
    const ciEarly = resolveExplicitCompetitiveIntelRoute(input);
    if (ciEarly) {
      return ciEarly;
    }
    return {
      type: "chat",
      actionable: true,
      reason: "competitive-intel-unresolved",
      message:
        "I can run a competitive intelligence workflow. Try: `I want a competitive intelligence report on [industry]`.",
    };
  }

  if (looksLikeResearchBriefCommand(input)) {
    const researchBriefEarly = resolveExplicitResearchBriefRoute(
      input,
      snapshot
    );
    if (researchBriefEarly) {
      return researchBriefEarly;
    }
    return {
      type: "no_match",
      actionable: true,
      reason: "research-brief-unresolved",
    };
  }

  if (looksLikeOrganizeTabsCommand(input)) {
    const organizeEarly = resolveExplicitOrganizeTabsRoute(input, snapshot);
    if (organizeEarly) {
      return organizeEarly;
    }
    return {
      type: "chat",
      actionable: true,
      reason: "organize-tabs-unresolved",
      message:
        "I could not match that to tab organizing. Try: `Group all tabs related to LLM research` or `Organize my open tabs by topic`.",
    };
  }

  const family = classifyCommandFamily(input);
  const familyHandler = FAMILY_HANDLERS[family];
  if (familyHandler) {
    const familyDecision = familyHandler(input, snapshot);
    if (familyDecision) {
      return familyDecision;
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

  const outreachEmailExplicit = resolveExplicitOutreachEmailRoute(
    input,
    snapshot
  );
  if (outreachEmailExplicit) {
    return outreachEmailExplicit;
  }

  const researchBriefExplicit = resolveExplicitResearchBriefRoute(
    input,
    snapshot
  );
  if (researchBriefExplicit) {
    return researchBriefExplicit;
  }

  const organizeTabsExplicit = resolveExplicitOrganizeTabsRoute(
    input,
    snapshot
  );
  if (organizeTabsExplicit) {
    return organizeTabsExplicit;
  }

  const explicit = resolveExplicitRoute(input);
  if (explicit) {
    return explicit;
  }

  if (family === "list" || family === "search" || family === "mutation") {
    return {
      type: "chat",
      actionable: true,
      reason: `${family}-family-unresolved`,
      message:
        family === "list"
          ? `I am not sure what you want listed. Say whether you mean open tabs, a tab group, or a bookmarks folder. [Help](${kahanaUrl("/docs")})`
          : family === "search"
            ? `I am not sure what to search for. Include what to find and, if it helps, where (for example a folder or source). [Help](${kahanaUrl("/docs")})`
            : looksLikeResearchBriefCommand(input)
              ? "I could not match that to a research brief. Try: `Build a research brief on [topic] from tab group [name]` or `Research brief from tabs ESPN, Bleacher Report`."
              : `I am not sure which page or control you want to change. Say in plain language what should happen and where (for example which tab, site, or button). [Kahana documentation](${kahanaUrl("/docs")})`,
    };
  }

  const actionable = looksActionableText(input);
  if (actionable) {
    return {
      type: "chat",
      actionable: true,
      reason: "actionable-but-unsupported",
      message: `I could not match that to one clear, safe step in the browser. Describe what to change and where in more detail. [Help](${kahanaUrl("/docs")})`,
    };
  }

  return { type: "no_match", actionable: false, reason: "non-actionable" };
}
