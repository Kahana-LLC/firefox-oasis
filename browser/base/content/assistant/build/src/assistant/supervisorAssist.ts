/**
 * LLM-based routing — asks the remote Assist API which command to run.
 *
 * Called by the supervisor node when it needs to route a user request.
 * 1. Classifies the command family (list/search/mutation/other)
 * 2. Constrains the available tools to the relevant family
 * 3. Sends the router prompt + tools + conversation history to the LLM
 * 4. Parses the LLM response into a tool route, chat decision, or action plan
 *
 * Falls through to deterministic routing (decisionEngine.ts) if the
 * Assist API is unavailable or returns an error.
 */
import type { BaseMessage } from "@langchain/core/messages";

import {
  assistRemote,
  getAssistLoopOptionsFromBuildEnv,
  type AssistResponse,
  type AssistTool,
} from "../proxyClient.js";
import {
  getAssistCapability,
  markAssistSupported,
  markAssistUnsupported,
  shouldAttemptAssist,
} from "../services/assistEndpointState.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import { looksLikeNewActionCommand } from "../utils/routingUtils.js";
import { classifyCommandFamily } from "../utils/intentParser.js";
import type { IntentFamily } from "../utils/routerTypes.js";
import {
  extractTokenCountsFromAssistPayload,
  isRecord,
  toWire,
} from "./messageUtils.js";
import { parsePlannedActions, type PlannedAction } from "./plannedActions.js";
import { looksLikeCommandChain } from "./commandChain.js";
import { QuotaExceededError } from "../awsSignedFetch.js";
import { subscriptionService } from "../services/subscription.js";
import { formatQuotaExceededMessage } from "../utils/quotaUserMessage.js";

const PLAN_TOOL_NAME = "route_action_plan";
const LIST_FAMILY_TOOLS = new Set([
  "list_tabs",
  "list_bookmark_folders",
  "list_tab_groups",
]);
const SEARCH_FAMILY_TOOLS = new Set([
  "search_memory",
  "search_history",
  "get_recent_search_results",
  "open_search_result",
]);
const SEARCH_WEB_TOOL = "web_search";
const MUTATION_FAMILY_TOOLS = new Set([
  "add_tab_to_bookmark_folder",
  "add_tab_to_group",
  "remove_tab_from_bookmark_folder",
  "remove_tab_from_group",
  "create_bookmark_folder",
  "delete_bookmark_folder",
  "rename_bookmark_folder",
  "open_bookmark_folder",
  "create_tab_group",
  "delete_tab_group",
  "rename_tab_group",
  "close_tab",
  "move_tab_to_new_window",
  "split_tabs",
  "add_split_view",
  "remove_split_view",
  "confirm_action",
  "resolve_ambiguity",
  "new_window",
  "organize_windows",
  "reload_tab",
  "toggle_mute_tab",
  "pin_tab",
  "unpin_tab",
  "duplicate_tab",
  "bookmark_tab",
  "reopen_closed_tab",
  "open_send_tab_to_device",
  "copy_tab_urls",
  "unload_tab",
]);
// const SEARCH_WEB_HINT_RE =
//   /\b(?:google|web|internet|online|bing|duckduckgo|search\s+the\s+web)\b/i;
// const SEARCH_LOCAL_HINT_RE =
//   /\b(?:bookmark|folder|hub|tab|tabs|group|groups|history|memory|saved|visited|recent\s+results?)\b/i;

const SEARCH_WEB_HINT_RE =
  /\b(?:google|web|internet|online|bing|duckduckgo|search\s+the\s+web)\b/i;
const SEARCH_LOCAL_HINT_RE =
  /\b(?:bookmark|folder|hub|tab|tabs|group|groups|history|memory|saved|visited|recent\s+results?)\b/i;
const SEARCH_HISTORY_HINT_RE =
  /\b(?:visited|browsed|looked\s+at|read|viewed|pages?\s+i\s+(?:visited|read|browsed|looked\s+at|viewed)|articles?\s+i\s+(?:read|browsed|viewed)|sites?\s+i\s+(?:visited|browsed)|what\s+(?:was|did\s+i)|pull\s+that|get\s+that)\b/i;
const SEARCH_BOOKMARKS_HINT_RE =
  /\b(?:bookmark|bookmarks|folder|saved|bookmarked|in\s+(?:my\s+)?(?:bookmark\s+)?folder|what'?s\s+in)\b/i;

function constrainAssistRoutingForFamily(params: {
  activeCommandText: string;
  assistOptions: string[];
  assistTools: AssistTool[];
}): {
  family: IntentFamily;
  constrained: boolean;
  options: string[];
  tools: AssistTool[];
  allowPlanTool: boolean;
} {
  const { activeCommandText, assistOptions, assistTools } = params;
  const family = classifyCommandFamily(activeCommandText);
  const chainLike = looksLikeCommandChain(activeCommandText);
  const allowPlanTool = chainLike;
  const toResult = (options: string[]) => {
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const option of options) {
      const name = String(option || "").trim();
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      deduped.push(name);
    }
    if (!seen.has("chat")) {
      deduped.push("chat");
      seen.add("chat");
    }
    const allowedSet = new Set(deduped.filter(option => option !== "chat"));
    const tools = assistTools.filter(tool => allowedSet.has(tool.name));
    return {
      family,
      constrained: true,
      options: deduped,
      tools,
      allowPlanTool,
    };
  };

  if (chainLike || family === "other") {
    return {
      family,
      constrained: false,
      options: [...assistOptions],
      tools: [...assistTools],
      allowPlanTool,
    };
  }

  if (family === "list") {
    return toResult(
      assistOptions.filter(
        option => option === "chat" || LIST_FAMILY_TOOLS.has(option)
      )
    );
  }

  // if (family === "search") {
  //   const hasWebHint = SEARCH_WEB_HINT_RE.test(activeCommandText);
  //   const hasLocalHint = SEARCH_LOCAL_HINT_RE.test(activeCommandText);
  //   const allowedTools = new Set(SEARCH_FAMILY_TOOLS);
  //   if (hasWebHint || !hasLocalHint) {
  //     allowedTools.add(SEARCH_WEB_TOOL);
  //   }
  //   return toResult(
  //     assistOptions.filter(
  //       option => option === "chat" || allowedTools.has(option)
  //     )
  //   );
  // }

  if (family === "search") {
    const hasWebHint = SEARCH_WEB_HINT_RE.test(activeCommandText);
    const hasLocalHint = SEARCH_LOCAL_HINT_RE.test(activeCommandText);
    const hasHistoryHint = SEARCH_HISTORY_HINT_RE.test(activeCommandText);
    const hasBookmarksHint = SEARCH_BOOKMARKS_HINT_RE.test(activeCommandText);

    const allowedTools = new Set<string>();

    // Strong signals for specific search types
    if (hasHistoryHint && !hasBookmarksHint) {
      // Clear history query - only allow search_history
      allowedTools.add("search_history");
      allowedTools.add("get_recent_search_results");
      allowedTools.add("open_search_result");
    } else if (hasBookmarksHint && !hasHistoryHint) {
      // Clear bookmarks query - only allow search_memory
      allowedTools.add("search_memory");
      allowedTools.add("get_recent_search_results");
      allowedTools.add("open_search_result");
    } else {
      // Ambiguous or no strong hints - allow both
      SEARCH_FAMILY_TOOLS.forEach(tool => allowedTools.add(tool));
    }

    // Add web search if web hint present or no local hint
    if (hasWebHint || !hasLocalHint) {
      allowedTools.add(SEARCH_WEB_TOOL);
    }

    return toResult(
      assistOptions.filter(
        option => option === "chat" || allowedTools.has(option)
      )
    );
  }

  if (family === "mutation") {
    return toResult(
      assistOptions.filter(
        option => option === "chat" || MUTATION_FAMILY_TOOLS.has(option)
      )
    );
  }

  return {
    family: "other",
    constrained: false,
    options: [...assistOptions],
    tools: [...assistTools],
    allowPlanTool,
  };
}

export type AssistRouteResult =
  | { kind: "none" }
  | { kind: "tool"; next: string; args: Record<string, unknown> }
  | { kind: "plan"; actions: PlannedAction[] }
  | { kind: "chat"; content: string };

/**
 * Keeps subscription / daily token bar in sync with assist routing:
 * Edge (authenticated) sends `usage_stats` after server-side RPC — update cache only.
 * Lambda (or anonymous) sends `usage_metadata` — insert `llm_usage` row with real tokens.
 */
function syncSubscriptionFromAssistRouterResponse(assist: AssistResponse): void {
  const raw = assist as Record<string, unknown>;
  if (isRecord(raw.usage_stats)) {
    subscriptionService.updateFromAssistUsageStats(
      raw.usage_stats as Record<string, unknown>
    );
    return;
  }
  const tokens = extractTokenCountsFromAssistPayload(assist);
  const hasTokens =
    (tokens.input_tokens != null && tokens.input_tokens > 0) ||
    (tokens.output_tokens != null && tokens.output_tokens > 0);
  if (!hasTokens) {
    return;
  }
  subscriptionService.recordAssistRoutingTokens({
    command_type: "system",
    user_intent: "other",
    input_tokens: tokens.input_tokens,
    output_tokens: tokens.output_tokens,
  });
}

export async function tryResolveAssistRoute(params: {
  endpointKey: string;
  activeCommandText: string;
  commandQueueLength: number;
  messages: BaseMessage[];
  assistRouterPrompt: string;
  assistOptions: string[];
  assistTools: AssistTool[];
  memberNameSet: ReadonlySet<string>;
  maxPlanActions: number;
  /** Appended to router system prompt (e.g. Railroad getPrunedPrompt). */
  railroadMemoryBlock?: string;
}): Promise<AssistRouteResult> {
  const {
    endpointKey,
    activeCommandText,
    commandQueueLength,
    messages,
    assistRouterPrompt,
    assistOptions,
    assistTools,
    memberNameSet,
    maxPlanActions,
    railroadMemoryBlock = "",
  } = params;

  const shouldTryAssistRouting =
    commandQueueLength <= 1 && looksLikeNewActionCommand(activeCommandText);
  if (!shouldTryAssistRouting) {
    return { kind: "none" };
  }

  const constrained = constrainAssistRoutingForFamily({
    activeCommandText,
    assistOptions,
    assistTools,
  });
  const effectiveOptions = constrained.options;
  const effectiveTools = constrained.tools;
  const effectiveOptionSet = new Set(effectiveOptions);
  const allowPlanTool = constrained.allowPlanTool;

  const capability = getAssistCapability(endpointKey);
  if (!shouldAttemptAssist(endpointKey)) {
    if (capability === "unsupported") {
      assistantLogger.debug(
        "router",
        "Assist endpoint currently cooling down."
      );
    }
    return { kind: "none" };
  }

  try {
    const assistMessages = toWire(messages.slice(-10));
    const optionsForAssist = allowPlanTool
      ? [...effectiveOptions, PLAN_TOOL_NAME]
      : effectiveOptions;
    const toolsForAssist = allowPlanTool
      ? [
          ...effectiveTools,
          {
            name: PLAN_TOOL_NAME,
            description:
              `Plan up to ${maxPlanActions} commands for chained requests. ` +
              `Args JSON: {"actions":[{"next":"<valid command name>","args":{...}}]}`,
          },
        ]
      : effectiveTools;
    const assistLoop = getAssistLoopOptionsFromBuildEnv();
    const routerSystem =
      assistRouterPrompt +
      (typeof railroadMemoryBlock === "string" ? railroadMemoryBlock : "");
    const assist = await assistRemote(
      routerSystem,
      assistMessages,
      optionsForAssist,
      toolsForAssist,
      undefined,
      assistLoop
    );
    const innerRounds =
      typeof assist?.inner_rounds === "number" ? assist.inner_rounds : undefined;
    if (innerRounds != null && innerRounds > 1) {
      assistantLogger.debug("router", "Assist inner rounds", { innerRounds });
    }
    if ((assist as any)?.quota) {
      subscriptionService.updateFromQuota((assist as any).quota);
    }
    syncSubscriptionFromAssistRouterResponse(assist);
    markAssistSupported(endpointKey);

    const assistNext =
      typeof assist?.next === "string" ? assist.next.trim() : "";
    const assistArgs = isRecord(assist?.args) ? assist.args : {};

    if (allowPlanTool && assistNext === PLAN_TOOL_NAME) {
      const actions = parsePlannedActions(
        assistArgs,
        memberNameSet,
        maxPlanActions
      );
      if (actions.length > 0) {
        assistantLogger.debug("router", "Assist returned action plan", {
          count: actions.length,
        });
        return { kind: "plan", actions };
      }
      return { kind: "none" };
    }

    if (
      assistNext &&
      assistNext !== "chat" &&
      !effectiveOptionSet.has(assistNext)
    ) {
      assistantLogger.debug(
        "router",
        "Assist route rejected by family policy",
        {
          assistNext,
          family: constrained.family,
          constrained: constrained.constrained,
        }
      );
      return { kind: "none" };
    }

    if (assistNext && assistNext !== "chat" && memberNameSet.has(assistNext)) {
      assistantLogger.debug("router", `Assist route selected: ${assistNext}`);
      return { kind: "tool", next: assistNext, args: assistArgs };
    }

    if (assistNext === "chat") {
      const content =
        typeof assist?.content === "string" ? assist.content.trim() : "";
      if (content) {
        return { kind: "chat", content };
      }
    }

    return { kind: "none" };
  } catch (error) {
    if (error instanceof QuotaExceededError || (error as any).isQuotaError) {
      if ((error as any).quota) {
        subscriptionService.updateFromQuota((error as any).quota);
      }
      return {
        kind: "chat",
        content: formatQuotaExceededMessage((error as Error).message),
      };
    }

    const message = String(error || "");
    const assistUnsupported =
      /\b404\b|not found|post with\s*\{op:\s*"?assist"?\}/i.test(message);
    if (assistUnsupported) {
      markAssistUnsupported(endpointKey);
      assistantLogger.warn(
        "router",
        "Assist endpoint unavailable, using fallback."
      );
    } else {
      assistantLogger.warn(
        "router",
        "Assist route failed, using fallback.",
        error
      );
    }
    return { kind: "none" };
  }
}
