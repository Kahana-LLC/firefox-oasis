import test from "node:test";
import assert from "node:assert/strict";
import { assessTabHealth } from "../src/services/competitiveIntelTabHealth.js";

test("assessTabHealth detects 404 page titles", () => {
  const result = assessTabHealth(
    "https://www.g2.com/products/smartrecruiter/reviews",
    "Page not found | G2"
  );
  assert.equal(result.healthy, false);
  assert.match(String(result.reason), /unhealthy page title/i);
});

test("assessTabHealth detects G2 verification required", () => {
  const result = assessTabHealth(
    "https://www.g2.com/products/foo/reviews",
    "Verification Required"
  );
  assert.equal(result.healthy, false);
});

test("assessTabHealth accepts healthy homepage", () => {
  const result = assessTabHealth(
    "https://www.example.com/",
    "Example Corp — Enterprise Software"
  );
  assert.equal(result.healthy, true);
});

test("assessTabHealth rejects blank URLs", () => {
  const result = assessTabHealth("about:blank", "");
  assert.equal(result.healthy, false);
});
