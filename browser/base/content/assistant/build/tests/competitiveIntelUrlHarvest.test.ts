import test from "node:test";
import assert from "node:assert/strict";
import {
  applyHarvestedUrlsToCompanies,
  harvestUrlsForCompanyFromDigests,
} from "../src/utils/competitiveIntelUrlHarvest.js";
import type { TabDigest } from "../src/services/researchBriefTypes.js";

const sampleDigest: TabDigest = {
  title: "Perplexity",
  url: "https://www.perplexity.ai/",
  content: [
    "Monte Carlo (montecarlodata.com) is a leader in data observability.",
    "G2: https://www.g2.com/products/monte-carlo/reviews",
    "TrustRadius: https://www.trustradius.com/products/monte-carlo/reviews",
    "Wikipedia: https://en.wikipedia.org/wiki/Monte_Carlo_(company)",
    "Gartner: https://www.gartner.com/reviews/product/monte-carlo-data-observability",
    "LinkedIn: https://www.linkedin.com/company/monte-carlo-data/",
  ].join("\n"),
  status: "ok",
};

test("harvestUrlsForCompanyFromDigests extracts cited review URLs", () => {
  const urls = harvestUrlsForCompanyFromDigests("Monte Carlo", [sampleDigest]);
  assert.equal(urls?.g2_product, "https://www.g2.com/products/monte-carlo/reviews");
  assert.equal(
    urls?.trustradius_product,
    "https://www.trustradius.com/products/monte-carlo/reviews"
  );
  assert.equal(
    urls?.wikipedia_article,
    "https://en.wikipedia.org/wiki/Monte_Carlo_(company)"
  );
  assert.equal(
    urls?.gartner_reviews,
    "https://www.gartner.com/reviews/product/monte-carlo-data-observability"
  );
  assert.ok(
    !Object.values(urls || {}).some(url => /linkedin\.com/i.test(url))
  );
});

test("applyHarvestedUrlsToCompanies merges harvested URLs onto pool", () => {
  const updated = applyHarvestedUrlsToCompanies(
    [
      {
        name: "Monte Carlo",
        normalizedName: "monte carlo",
        description: "Data observability",
        tier: "high",
        sourceUrls: [],
        mentionCount: 3,
      },
    ],
    [sampleDigest]
  );
  assert.equal(
    updated[0]?.enrichmentUrls?.g2_product,
    "https://www.g2.com/products/monte-carlo/reviews"
  );
});
