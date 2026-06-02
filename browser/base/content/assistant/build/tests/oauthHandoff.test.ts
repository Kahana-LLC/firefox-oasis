import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_HANDOFF_AGE_MS,
  normalizeAllowedCallbackBaseUrl,
  validateHandoffPayload,
  isAllowedCallbackHost,
} from "../src/utils/oauthHandoff.js";

test("normalizeAllowedCallbackBaseUrl accepts allowlisted origins", () => {
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
  assert.equal(isAllowedCallbackHost("kahana.co"), true);
  assert.equal(isAllowedCallbackHost("localhost"), true);
  assert.equal(isAllowedCallbackHost("evil.example"), false);
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
      callbackBaseUrl: "https://kahana.co",
    }
  );
  assert.equal(result.ok, true);
});
