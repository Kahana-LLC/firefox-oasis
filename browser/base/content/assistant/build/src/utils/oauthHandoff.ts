/** Keep in sync with browser/modules/OasisOAuthHandoff.sys.mjs */

import {
  KAHANA_LEGACY_ORIGIN,
  KAHANA_PRODUCTION_ORIGIN,
} from "../../../shared/kahanaSiteOrigin.js";

export const HANDOFF_COOKIE_NAME = "oasis_assistant_handoff";
export const MARKER_COOKIE_NAME = "oasis_firefox_oauth_target";
export const MAX_HANDOFF_AGE_MS = 10 * 60 * 1000;
export const DEFAULT_CALLBACK_BASE_URL = KAHANA_PRODUCTION_ORIGIN;
export const LEGACY_CALLBACK_BASE_URL = KAHANA_LEGACY_ORIGIN;

const ALLOWED_CALLBACK_BASE_URLS = [
  DEFAULT_CALLBACK_BASE_URL,
  LEGACY_CALLBACK_BASE_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

export function getAllowedCallbackBaseUrls(): string[] {
  return [...ALLOWED_CALLBACK_BASE_URLS];
}

export function normalizeAllowedCallbackBaseUrl(
  url?: string | null
): string | null {
  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }
  const normalized = url.replace(/\/+$/, "");
  return (ALLOWED_CALLBACK_BASE_URLS as readonly string[]).includes(normalized)
    ? normalized
    : null;
}

function normalizeCookieHost(hostname: string): string {
  if (!hostname) {
    return "";
  }
  return hostname.startsWith(".") ? hostname.slice(1) : hostname;
}

export function isAllowedCallbackHost(hostname: string): boolean {
  const normalized = normalizeCookieHost(hostname);
  if (!normalized) {
    return false;
  }
  return ALLOWED_CALLBACK_BASE_URLS.some(base => {
    try {
      return new URL(base).hostname === normalized;
    } catch {
      return false;
    }
  });
}

export function getHandoffTarget(
  payload: Record<string, unknown>
): string | null {
  const target = payload.handoff_target ?? payload.target;
  return typeof target === "string" ? target : null;
}

export function getHandoffFlowId(
  payload: Record<string, unknown>
): string | null {
  const flowId = payload.flow_id ?? payload.flowId;
  return typeof flowId === "string" ? flowId : null;
}

export type HandoffValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateHandoffPayload(
  payload: unknown,
  options: {
    expectedTarget?: string;
    expectedFlowId?: string;
    callbackBaseUrl?: string;
  } = {}
): HandoffValidationResult {
  const { expectedTarget, expectedFlowId, callbackBaseUrl } = options;

  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid OAuth handoff payload" };
  }

  const record = payload as Record<string, unknown>;
  const timestamp = record.timestamp;
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return { ok: false, error: "OAuth handoff is missing a valid timestamp" };
  }

  const age = Date.now() - timestamp;
  if (age < 0 || age > MAX_HANDOFF_AGE_MS) {
    return { ok: false, error: "OAuth handoff has expired" };
  }

  if (expectedTarget) {
    const target = getHandoffTarget(record);
    if (target && target !== expectedTarget) {
      return { ok: false, error: "OAuth handoff target mismatch" };
    }
  }

  if (expectedFlowId) {
    const flowId = getHandoffFlowId(record);
    if (!flowId || flowId !== expectedFlowId) {
      return { ok: false, error: "OAuth handoff flow mismatch" };
    }
  }

  if (callbackBaseUrl) {
    const normalized = normalizeAllowedCallbackBaseUrl(callbackBaseUrl);
    if (!normalized) {
      return { ok: false, error: "OAuth callback base URL is not allowed" };
    }
  }

  return { ok: true };
}

export function isOAuthDevEnvironment(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const loc = window.location?.href || "";
    if (loc.startsWith("chrome://") || loc.startsWith("about:")) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
