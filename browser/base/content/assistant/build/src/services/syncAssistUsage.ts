import type { AssistResponse } from "../proxyClient.js";
import {
  extractTokenCountsFromAssistPayload,
  isRecord,
} from "../assistant/messageUtils.js";
import { subscriptionService } from "./subscription.js";

export function syncSubscriptionFromAssistResponse(
  assist: AssistResponse
): void {
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
    command_type: "content_create",
    user_intent: "research",
    input_tokens: tokens.input_tokens,
    output_tokens: tokens.output_tokens,
  });
}
