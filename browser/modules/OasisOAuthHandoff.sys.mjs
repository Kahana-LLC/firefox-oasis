/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const HANDOFF_COOKIE_NAME = "oasis_assistant_handoff";
export const MARKER_COOKIE_NAME = "oasis_firefox_oauth_target";
export const MAX_HANDOFF_AGE_MS = 10 * 60 * 1000;
export const DEFAULT_CALLBACK_BASE_URL = "https://kahana.io";
export const LEGACY_CALLBACK_BASE_URL = "https://kahana.co";

const ALLOWED_CALLBACK_BASE_URLS = [
  DEFAULT_CALLBACK_BASE_URL,
  LEGACY_CALLBACK_BASE_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export function getAllowedCallbackBaseUrls() {
  return [...ALLOWED_CALLBACK_BASE_URLS];
}

export function normalizeAllowedCallbackBaseUrl(url) {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return null;
  }
  const normalized = url.replace(/\/+$/, "");
  return ALLOWED_CALLBACK_BASE_URLS.includes(normalized) ? normalized : null;
}

function normalizeCookieHost(hostname) {
  if (!hostname || typeof hostname !== "string") {
    return "";
  }
  return hostname.startsWith(".") ? hostname.slice(1) : hostname;
}

export function isAllowedCallbackHost(hostname) {
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

export function enumerateHandoffCookies(cookieManager) {
  if (!cookieManager?.getCookiesFromHost) {
    return [];
  }

  const handoffCookies = [];
  const seen = new Set();

  for (const baseUrl of ALLOWED_CALLBACK_BASE_URLS) {
    let hostname;
    try {
      hostname = new URL(baseUrl).hostname;
    } catch {
      continue;
    }

    let hostCookies;
    try {
      hostCookies = cookieManager.getCookiesFromHost(hostname, {});
    } catch {
      continue;
    }
    if (!hostCookies) {
      continue;
    }

    for (const cookie of hostCookies) {
      if (cookie.name !== HANDOFF_COOKIE_NAME) {
        continue;
      }
      const key = `${cookie.host}\0${cookie.path}\0${cookie.name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      handoffCookies.push(cookie);
    }
  }

  return handoffCookies;
}

export function selectHandoffCookieFromManager(cookieManager, options = {}) {
  return selectHandoffCookie(enumerateHandoffCookies(cookieManager), options);
}

export function getHandoffTarget(payload) {
  return payload?.handoff_target || payload?.target || null;
}

export function getHandoffFlowId(payload) {
  return payload?.flow_id || payload?.flowId || null;
}

export function validateHandoffPayload(payload, options = {}) {
  const { expectedTarget, expectedFlowId, callbackBaseUrl } = options;

  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid OAuth handoff payload" };
  }

  const timestamp = payload.timestamp;
  if (typeof timestamp !== "number" || Number.isNaN(timestamp)) {
    return { ok: false, error: "OAuth handoff is missing a valid timestamp" };
  }

  const age = Date.now() - timestamp;
  if (age < 0 || age > MAX_HANDOFF_AGE_MS) {
    return { ok: false, error: "OAuth handoff has expired" };
  }

  if (expectedTarget) {
    const target = getHandoffTarget(payload);
    if (target && target !== expectedTarget) {
      return { ok: false, error: "OAuth handoff target mismatch" };
    }
  }

  if (expectedFlowId) {
    const flowId = getHandoffFlowId(payload);
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

export function selectHandoffCookie(cookies, options = {}) {
  const {
    expectedTarget,
    expectedFlowId,
    allowFallbackTarget = false,
    callbackBaseUrl,
  } = options;

  if (!cookies) {
    return null;
  }

  let latest = null;
  let latestFallback = null;

  for (const cookie of cookies) {
    if (cookie.name !== HANDOFF_COOKIE_NAME) {
      continue;
    }
    if (!isAllowedCallbackHost(cookie.host)) {
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(decodeURIComponent(cookie.value));
    } catch {
      continue;
    }

    const validation = validateHandoffPayload(payload, {
      expectedTarget,
      expectedFlowId,
      callbackBaseUrl,
    });
    if (!validation.ok) {
      continue;
    }

    const timestamp = payload.timestamp || 0;
    const target = getHandoffTarget(payload);
    const matchesTarget =
      !expectedTarget || !target || target === expectedTarget;

    if (!matchesTarget) {
      if (
        allowFallbackTarget &&
        (!latestFallback ||
          timestamp > (latestFallback.payload?.timestamp || 0))
      ) {
        latestFallback = { cookie, payload };
      }
      continue;
    }

    if (!latest || timestamp > (latest.payload?.timestamp || 0)) {
      latest = { cookie, payload };
    }
  }

  return latest || latestFallback;
}

export function clearHandoffCookie(cookies, cookie) {
  if (!cookies || !cookie) {
    return;
  }
  try {
    cookies.remove(
      cookie.host,
      cookie.name,
      cookie.path,
      cookie.originAttributes || {}
    );
  } catch (e) {
    console.error("Failed to clear OAuth handoff cookie:", e);
  }
}
