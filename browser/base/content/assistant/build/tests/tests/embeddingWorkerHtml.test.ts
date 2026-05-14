import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerHtmlPath = [
  path.resolve(process.cwd(), "../embedding-worker.html"),
  path.resolve(__dirname, "../../../embedding-worker.html"),
  path.resolve(__dirname, "../../../../../embedding-worker.html"),
  path.resolve(__dirname, "../../../../../../embedding-worker.html"),
].find(fs.existsSync);

test("embedding worker page declares a wasm-capable CSP", () => {
  assert.ok(workerHtmlPath, "embedding-worker.html should be locatable from the test output");
  const html = fs.readFileSync(workerHtmlPath, "utf8");

  assert.match(html, /Content-Security-Policy/i);
  assert.match(html, /script-src[^"]*chrome:/i);
  assert.match(html, /script-src[^"]*resource:/i);
  assert.match(html, /script-src[^"]*'wasm-unsafe-eval'/i);
  assert.doesNotMatch(html, /'unsafe-eval'/i);
});
