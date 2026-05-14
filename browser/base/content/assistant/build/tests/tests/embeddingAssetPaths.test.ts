import test from "node:test";
import assert from "node:assert/strict";

import {
  EMBEDDING_ASSET_BASE,
  EMBEDDING_LOCAL_MODEL_PATH,
  EMBEDDING_ORT_WASM_PATH,
} from "../../src/utils/embeddingAssetPaths.js";

test("embedding asset paths stay relative to the worker page", () => {
  assert.equal(EMBEDDING_ASSET_BASE, "./embedding-assets");
  assert.equal(EMBEDDING_LOCAL_MODEL_PATH, "./embedding-assets/models");
  assert.equal(EMBEDDING_ORT_WASM_PATH, "./embedding-assets/ort/");
  assert.doesNotMatch(EMBEDDING_LOCAL_MODEL_PATH, /^chrome:\/\//i);
  assert.doesNotMatch(EMBEDDING_ORT_WASM_PATH, /^chrome:\/\//i);
});
