import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEnrichmentUrlsForCompany,
  pickEnrichmentSlots,
} from "../src/utils/competitiveIntelCompanyUrls.js";
import { buildEnrichmentUrls } from "../src/services/competitiveIntelEnrichment.js";
import { buildHostAwareEnrichmentBatches } from "../src/services/competitiveIntelEnrichment.js";
import { applyEnrichmentDigestHints } from "../src/services/competitiveIntelDigest.js";
import { buildDiscoveryQuery } from "../src/services/competitiveIntelWorkflow.js";
import {
  applyUrlOverrideToCompanies,
  parseUrlOverrideFromText,
} from "../src/utils/competitiveIntelUrlOverrides.js";
import type { CompetitiveCompany } from "../src/services/competitiveIntelTypes.js";

function company(overrides: Partial<CompetitiveCompany> = {}): CompetitiveCompany {
  return {
    name: "Monte Carlo",
    normalizedName: "monte carlo",
    description: "Data observability",
    tier: "high",
    sourceUrls: [],
    mentionCount: 3,
    ...overrides,
  };
}

test("buildDiscoveryQuery asks for G2, Capterra, Wikipedia, and Gartner URLs", () => {
  const query = buildDiscoveryQuery("enterprise data observability");
  assert.match(query, /G2 product URL/i);
  assert.match(query, /Capterra product URL/i);
  assert.match(query, /Wikipedia article URL/i);
  assert.match(query, /Gartner Peer Insights URL/i);
  assert.match(query, /Do not include LinkedIn/i);
});

test("buildEnrichmentUrls oasis_first uses homepage and wikipedia only", () => {
  const urls = buildEnrichmentUrls(
    company({
      enrichmentUrls: {
        homepage: "https://www.montecarlodata.com/",
        g2_product: "https://www.g2.com/products/monte-carlo/reviews",
        trustradius_product:
          "https://www.trustradius.com/products/monte-carlo/reviews",
      },
    })
  );
  assert.equal(urls.length, 2);
  assert.ok(urls.some(url => url.includes("montecarlodata.com")));
  assert.ok(urls.some(url => url.includes("wikipedia.org")));
  assert.ok(!urls.some(url => /g2\.com|trustradius\.com/i.test(url)));
});

test("buildEnrichmentUrls review_deepen uses review-heavy direct links", () => {
  const urls = buildEnrichmentUrls(
    company({
      enrichmentUrls: {
        homepage: "https://www.montecarlodata.com/",
        g2_product: "https://www.g2.com/products/monte-carlo/reviews",
        trustradius_product:
          "https://www.trustradius.com/products/monte-carlo/reviews",
      },
    }),
    "review_deepen"
  );
  assert.equal(urls.length, 3);
  assert.ok(urls.some(url => url.includes("g2.com/products/monte-carlo")));
});

test("buildEnrichmentUrls falls back to wikipedia_search without direct URLs", () => {
  const urls = buildEnrichmentUrls(company());
  assert.equal(urls.length, 1);
  assert.ok(urls[0]?.includes("wikipedia.org"));
});

test("buildHostAwareEnrichmentBatches spreads same-host URLs", () => {
  const batches = buildHostAwareEnrichmentBatches(
    [
      {
        companyName: "A",
        tier: "high",
        urls: [
          "https://www.g2.com/products/a/reviews",
          "https://www.g2.com/products/b/reviews",
          "https://www.example-a.com/",
        ],
      },
    ],
    2,
    "review_deepen"
  );
  assert.ok(batches.length >= 2);
  for (const batch of batches) {
    const hosts = batch.map(url => new URL(url).hostname);
    assert.equal(new Set(hosts).size, hosts.length);
  }
});

test("applyEnrichmentDigestHints marks Cloudflare challenges", () => {
  const digests = applyEnrichmentDigestHints([
    {
      title: "Just a moment...",
      url: "https://www.trustradius.com/products/foo",
      content: "cf-challenge-holder verify you are human",
      status: "ok",
    },
  ]);
  assert.equal(digests[0].status, "skipped");
  assert.match(String(digests[0].failureReason), /bot check/i);
});

test("parseUrlOverrideFromText and apply override", () => {
  const command = parseUrlOverrideFromText(
    "set Monte Carlo G2 to https://www.g2.com/products/monte-carlo/reviews"
  );
  assert.ok(command);
  const updated = applyUrlOverrideToCompanies([company()], command!);
  assert.equal(
    updated[0]?.enrichmentUrls?.g2_product,
    "https://www.g2.com/products/monte-carlo/reviews"
  );
});

test("pickEnrichmentSlots labels slots for oasis_first progress markdown", () => {
  const slots = pickEnrichmentSlots(
    company({
      enrichmentUrls: {
        homepage: "https://www.montecarlodata.com/",
        g2_product: "https://www.g2.com/products/monte-carlo/reviews",
      },
    })
  );
  assert.deepEqual(
    slots.map(slot => slot.label),
    ["homepage", "Wikipedia search"]
  );
});

test("buildEnrichmentUrlsForCompany respects profile parameter", () => {
  const reviewUrls = buildEnrichmentUrlsForCompany(
    company({
      enrichmentUrls: {
        g2_product: "https://www.g2.com/products/monte-carlo/reviews",
      },
    }),
    "review_deepen"
  );
  assert.ok(reviewUrls.some(url => url.includes("g2.com")));
});
