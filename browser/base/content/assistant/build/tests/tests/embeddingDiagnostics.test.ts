import test from "node:test";
import assert from "node:assert/strict";

import {
  diagnoseEmbeddingFailure,
  formatSearchHistoryFailureMessage,
} from "../../src/utils/embeddingDiagnostics.js";

test("diagnoseEmbeddingFailure marks CSP-blocked WASM backend as fatal", () => {
  const diagnostic = diagnoseEmbeddingFailure(
    new Error(
      "no available backend found. ERR: [wasm] RuntimeError: Aborted(CompileError: call to WebAssembly.instantiate() blocked by CSP)."
    )
  );

  assert.equal(diagnostic.code, "backend_csp_blocked");
  assert.equal(diagnostic.fatal, true);
  assert.match(diagnostic.message, /blocked by page security policy/i);
});

test("formatSearchHistoryFailureMessage distinguishes transient model timeouts", () => {
  const message = formatSearchHistoryFailureMessage(
    new Error("Embedding timed out after 120s")
  );

  assert.match(message, /still loading its local embedding model/i);
  assert.doesNotMatch(message, /page security policy/i);
});

test("formatSearchHistoryFailureMessage gives explicit fatal guidance for CSP failures", () => {
  const message = formatSearchHistoryFailureMessage(
    new Error(
      "no available backend found. ERR: [wasm] RuntimeError: Aborted(CompileError: call to WebAssembly.instantiate() blocked by CSP)."
    )
  );

  assert.match(message, /blocked by page security policy/i);
  assert.match(message, /browser console/i);
  assert.doesNotMatch(message, /try again in a moment/i);
});

test("formatSearchHistoryFailureMessage gives explicit fatal guidance for missing local assets", () => {
  const message = formatSearchHistoryFailureMessage(
    new Error(
      '`local_files_only=true` or `env.allowRemoteModels=false` and file was not found locally at "chrome://browser/content/assistant/embedding-assets/models/Xenova/all-MiniLM-L6-v2/tokenizer.json".'
    )
  );

  assert.match(message, /local embedding model files could not be found/i);
  assert.match(message, /browser console/i);
  assert.doesNotMatch(message, /try again in a moment/i);
});
