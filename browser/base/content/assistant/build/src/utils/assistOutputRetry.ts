import { isRecord } from "../assistant/messageUtils.js";
import { assistRemote } from "../proxyClient.js";
import { subscriptionService } from "../services/subscription.js";
import { syncSubscriptionFromAssistResponse } from "../services/syncAssistUsage.js";
import { throwIfResearchBriefAborted } from "./researchBriefProgress.js";
import {
  recordValidatorFailed,
  recordValidatorRetry,
} from "./outputValidators.js";
import { OUTPUT_VALIDATION_RETRY_SUFFIX } from "./untrustedContent.js";

export type AssistGenerationConfig = {
  responseMimeType?: string;
  responseJsonSchema?: Record<string, unknown>;
};

function tryJsonParseLoose(str: string): unknown {
  const trimmed = String(str || "").trim();
  if (!trimmed) {
    return null;
  }
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export function parseAssistResponseContent(res: unknown): unknown {
  if (!isRecord(res)) {
    return null;
  }
  const content = res.content;
  if (isRecord(content)) {
    return content;
  }
  if (typeof content === "string") {
    return tryJsonParseLoose(content);
  }
  return null;
}

export async function assistWithOutputValidationRetry<T>(params: {
  systemPrompt: string;
  userMessage: string;
  generationConfig?: AssistGenerationConfig;
  signal?: AbortSignal;
  parse: (raw: unknown) => T | null;
  validate: (value: T) => { ok: true } | { ok: false; reason: string };
  validationErrorMessage?: string;
  maxAttempts?: number;
  onAttempt?: (attempt: number, maxAttempts: number) => void;
}): Promise<T> {
  let systemPrompt = params.systemPrompt;
  const maxAttempts = Math.max(1, params.maxAttempts ?? 2);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    throwIfResearchBriefAborted(params.signal);
    params.onAttempt?.(attempt + 1, maxAttempts);

    const res = await assistRemote(
      systemPrompt,
      [{ role: "user", content: params.userMessage }],
      ["chat"],
      [],
      params.generationConfig,
      undefined,
      params.signal
    );

    throwIfResearchBriefAborted(params.signal);

    if (res.quota) {
      subscriptionService.updateFromQuota(res.quota);
    }
    syncSubscriptionFromAssistResponse(res);

    const parsed = params.parse(parseAssistResponseContent(res));
    if (!parsed) {
      if (attempt < maxAttempts - 1) {
        recordValidatorRetry();
        systemPrompt = `${params.systemPrompt}\n\n${OUTPUT_VALIDATION_RETRY_SUFFIX}`;
        continue;
      }
      recordValidatorFailed();
      throw new Error(
        params.validationErrorMessage ||
          "I couldn't produce a safe response. Please try again."
      );
    }

    const validation = params.validate(parsed);
    if (validation.ok) {
      return parsed;
    }

    if (attempt < maxAttempts - 1) {
      recordValidatorRetry();
      systemPrompt = `${params.systemPrompt}\n\n${OUTPUT_VALIDATION_RETRY_SUFFIX}`;
      continue;
    }

    recordValidatorFailed();
    throw new Error(
      params.validationErrorMessage ||
        "I couldn't produce a safe response. Please try again."
    );
  }

  recordValidatorFailed();
  throw new Error(
    params.validationErrorMessage ||
      "I couldn't produce a safe response. Please try again."
  );
}
