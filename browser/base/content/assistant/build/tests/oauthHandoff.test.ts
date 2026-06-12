import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CALLBACK_BASE_URL,
  LEGACY_CALLBACK_BASE_URL,
  MAX_HANDOFF_AGE_MS,
  normalizeAllowedCallbackBaseUrl,
  validateHandoffPayload,
  isAllowedCallbackHost,
} from "../src/utils/oauthHandoff.js";
import {
  selectHandoffCookieFromManager,
  HANDOFF_COOKIE_NAME,
} from "../../../../../modules/OasisOAuthHandoff.sys.mjs";

test("normalizeAllowedCallbackBaseUrl accepts allowlisted origins", () => {
  assert.equal(
    normalizeAllowedCallbackBaseUrl("https://kahana.io/"),
    "https://kahana.io"
  );
  assert.equal(
    normalizeAllowedCallbackBaseUrl("https://kahana.co/"),
    "https://kahana.co"
  );
  assert.equal(
    normalizeAllowedCallbackBaseUrl("http://localhost:3000"),
    "http://localhost:3000"
  );
});

test("normalizeAllowedCallbackBaseUrl rejects unknown origins", () => {
  assert.equal(normalizeAllowedCallbackBaseUrl("https://evil.example"), null);
  assert.equal(normalizeAllowedCallbackBaseUrl("javascript:alert(1)"), null);
});

test("isAllowedCallbackHost matches callback hosts only", () => {
  assert.equal(isAllowedCallbackHost("kahana.io"), true);
  assert.equal(isAllowedCallbackHost(".kahana.io"), true);
  assert.equal(isAllowedCallbackHost("kahana.co"), true);
  assert.equal(isAllowedCallbackHost(".kahana.co"), true);
  assert.equal(isAllowedCallbackHost("localhost"), true);
  assert.equal(isAllowedCallbackHost("evil.example"), false);
});

test("selectHandoffCookieFromManager reads handoff cookies from cookie manager", () => {
  const payload = {
    timestamp: Date.now(),
    flow_id: "oauth_test",
    handoff_target: "assistant",
    code: "test-code",
  };
  const cookie = {
    host: ".kahana.io",
    name: HANDOFF_COOKIE_NAME,
    path: "/",
    value: encodeURIComponent(JSON.stringify(payload)),
  };
  const cookieManager = {
    getCookiesFromHost(host: string) {
      return host === "kahana.io" ? [cookie] : [];
    },
  };

  const selected = selectHandoffCookieFromManager(cookieManager, {
    expectedTarget: "assistant",
    expectedFlowId: "oauth_test",
    callbackBaseUrl: "https://kahana.io",
  });

  assert.ok(selected);
  assert.equal(selected?.payload?.code, "test-code");
});

test("default callback base URL uses kahana.io", () => {
  assert.equal(DEFAULT_CALLBACK_BASE_URL, "https://kahana.io");
  assert.equal(LEGACY_CALLBACK_BASE_URL, "https://kahana.co");
});

test("validateHandoffPayload rejects expired handoffs", () => {
  const result = validateHandoffPayload(
    {
      timestamp: Date.now() - MAX_HANDOFF_AGE_MS - 1000,
      target: "assistant",
    },
    { expectedTarget: "assistant" }
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /expired/i);
  }
});

test("validateHandoffPayload rejects flow_id mismatch", () => {
  const result = validateHandoffPayload(
    {
      timestamp: Date.now(),
      flow_id: "oauth_abc",
      target: "assistant",
    },
    { expectedFlowId: "oauth_xyz", expectedTarget: "assistant" }
  );
  assert.equal(result.ok, false);
});

test("validateHandoffPayload accepts valid handoff", () => {
  const result = validateHandoffPayload(
    {
      timestamp: Date.now(),
      flow_id: "oauth_abc",
      handoff_target: "assistant",
    },
    {
      expectedFlowId: "oauth_abc",
      expectedTarget: "assistant",
      callbackBaseUrl: "https://kahana.io",
    }
  );
  assert.equal(result.ok, true);
});
