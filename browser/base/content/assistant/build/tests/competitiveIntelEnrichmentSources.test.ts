import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyEnrichmentUrl,
  pickEnrichmentSlots,
  rankEnrichmentCandidates,
  companyToEnrichmentCandidates,
} from "../src/utils/competitiveIntelEnrichmentSources.js";
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

test("classifyEnrichmentUrl detects direct review and firmographic URLs", () => {
  assert.equal(
    classifyEnrichmentUrl("https://www.g2.com/products/monte-carlo/reviews")?.kind,
    "g2_product"
  );
  assert.equal(
    classifyEnrichmentUrl("https://www.trustradius.com/products/monte-carlo/reviews")?.kind,
    "trustradius_product"
  );
  assert.equal(
    classifyEnrichmentUrl("https://www.capterra.com/p/12345/Monte-Carlo/")?.kind,
    "capterra_product"
  );
  assert.equal(
    classifyEnrichmentUrl("https://en.wikipedia.org/wiki/Monte_Carlo_(company)")?.kind,
    "wikipedia_article"
  );
  assert.equal(
    classifyEnrichmentUrl(
      "https://www.gartner.com/reviews/product/monte-carlo-data-observability"
    )?.kind,
    "gartner_reviews"
  );
  assert.equal(
    classifyEnrichmentUrl("https://www.montecarlodata.com/")?.kind,
    "homepage"
  );
  assert.equal(
    classifyEnrichmentUrl("https://www.g2.com/search?query=monte")?.kind,
    "g2_search"
  );
  assert.equal(classifyEnrichmentUrl("https://duckduckgo.com/?q=test"), null);
  assert.equal(
    classifyEnrichmentUrl("https://www.linkedin.com/company/monte-carlo-data/"),
    null
  );
});

test("rankEnrichmentCandidates uses review-heavy priority", () => {
  const ranked = rankEnrichmentCandidates(
    companyToEnrichmentCandidates(
      company({
        enrichmentUrls: {
          homepage: "https://www.montecarlodata.com/",
          g2_product: "https://www.g2.com/products/monte-carlo/reviews",
          capterra_product: "https://www.capterra.com/p/12345/Monte-Carlo/",
          wikipedia_article: "https://en.wikipedia.org/wiki/Monte_Carlo_(company)",
        },
      })
    )
  );
  assert.equal(ranked[0]?.kind, "homepage");
  assert.equal(ranked[1]?.kind, "g2_product");
  assert.equal(ranked[2]?.kind, "capterra_product");
  assert.equal(ranked[3]?.kind, "wikipedia_article");
});

test("pickEnrichmentSlots skips blocked LinkedIn URLs", () => {
  const slots = pickEnrichmentSlots(
    company({
      enrichmentUrls: {
        homepage: "https://www.bigeye.com/",
      },
      websiteUrl: "https://www.bigeye.com/",
    })
  );
  assert.ok(slots.some(slot => slot.kind === "homepage"));
  assert.ok(!slots.some(slot => /linkedin\.com/i.test(slot.url)));
});

test("pickEnrichmentSlots oasis_first never returns G2 URLs", () => {
  const slots = pickEnrichmentSlots(
    company({
      enrichmentUrls: {
        homepage: "https://www.montecarlodata.com/",
        g2_product: "https://www.g2.com/products/monte-carlo/reviews",
        capterra_product: "https://www.capterra.com/p/12345/Monte-Carlo/",
      },
    }),
    3,
    "oasis_first"
  );
  assert.ok(slots.every(slot => !/g2\.com|capterra\.com/i.test(slot.url)));
  assert.deepEqual(
    slots.map(slot => slot.kind),
    ["homepage", "wikipedia_search"]
  );
});

test("pickEnrichmentSlots oasis_first adds wikipedia_search when no direct URLs", () => {
  const slots = pickEnrichmentSlots(company());
  assert.equal(slots.length, 1);
  assert.equal(slots[0]?.kind, "wikipedia_search");
});

test("pickEnrichmentSlots review_deepen adds g2_search fallback", () => {
  const slots = pickEnrichmentSlots(company(), 3, "review_deepen");
  assert.equal(slots.length, 2);
  assert.equal(slots[0]?.kind, "g2_search");
  assert.equal(slots[1]?.kind, "wikipedia_search");
});
