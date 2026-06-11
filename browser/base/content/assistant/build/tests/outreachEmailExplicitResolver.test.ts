import test from "node:test";
import assert from "node:assert/strict";

import {
  extractOutreachRecipient,
  inferOutreachEmailPurpose,
  isObviousOutreachEmailRequest,
  looksLikeOutreachEmailCommand,
  resolveExplicitOutreachEmailRoute,
} from "../src/utils/outreachEmailExplicitResolver.js";
import type { RoutingStateSnapshot } from "../src/utils/routerTypes.js";

const snapshot: RoutingStateSnapshot = {
  folderNames: new Set(),
  groupNames: new Set(["ai privacy", "research", "job research"]),
  stale: false,
};

function assertOutreachRoute(
  phrase: string,
  expected: {
    purpose?: string;
    recipientName?: string;
    scope?: string;
    name?: string;
  }
) {
  const route = resolveExplicitOutreachEmailRoute(phrase, snapshot);
  assert.equal(route?.type, "tool");
  if (route?.type !== "tool") {
    return;
  }
  assert.equal(route.next, "draft_outreach_email");
  if (expected.purpose !== undefined) {
    assert.equal(route.args?.purpose, expected.purpose);
  }
  if (expected.recipientName !== undefined) {
    assert.equal(route.args?.recipient_name, expected.recipientName);
  }
  if (expected.scope !== undefined) {
    assert.equal(route.args?.scope, expected.scope);
  }
  if (expected.name !== undefined) {
    assert.equal(route.args?.name, expected.name);
  }
}

test("inferOutreachEmailPurpose maps keywords", () => {
  assert.equal(inferOutreachEmailPurpose("thank-you note").purpose, "thank_you");
  assert.equal(inferOutreachEmailPurpose("follow-up email").purpose, "follow_up");
  assert.equal(inferOutreachEmailPurpose("cold outreach").purpose, "cold");
  assert.equal(
    inferOutreachEmailPurpose("networking intro").purpose,
    "networking"
  );
});

test("extractOutreachRecipient parses to and about", () => {
  assert.deepEqual(
    extractOutreachRecipient(
      "Draft a networking email to Alex about the partnership role from these tabs"
    ),
    { recipientName: "Alex", recipientRole: "the partnership role" }
  );
});

test("looksLikeOutreachEmailCommand matches email drafting phrases", () => {
  assert.ok(
    looksLikeOutreachEmailCommand("draft a networking email from these tabs")
  );
  assert.ok(
    looksLikeOutreachEmailCommand("write outreach email from tab group research")
  );
  assert.ok(
    !looksLikeOutreachEmailCommand("build a research brief from tab group research")
  );
});

test("draft networking email from these tabs routes relevant scope", () => {
  assertOutreachRoute(
    "Draft a networking email to Alex about the partnership role from these tabs",
    {
      purpose: "networking",
      recipientName: "Alex",
      scope: "relevant",
    }
  );
});

test("write outreach email from tab group Job Research", () => {
  assertOutreachRoute("write outreach email from tab group Job Research", {
    purpose: "cold",
    scope: "tab-group",
    name: "Job Research",
  });
});

test("draft thank-you email from my research tabs", () => {
  assertOutreachRoute("draft thank-you email to Maria from my research tabs", {
    purpose: "thank_you",
    recipientName: "Maria",
    scope: "relevant",
  });
});

test("isObviousOutreachEmailRequest detects tab-scoped email asks", () => {
  assert.ok(
    isObviousOutreachEmailRequest(
      "Draft a networking email to Damir from relevant tabs"
    )
  );
});
