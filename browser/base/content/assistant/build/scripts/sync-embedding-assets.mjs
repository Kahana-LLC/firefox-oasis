/**
 * One-shot vendoring: copies ORT WASM (matching @huggingface/transformers) and
 * Xenova/all-MiniLM-L6-v2 ONNX artifacts into ../embedding-assets/ for chrome:// packaging.
 * Run from repo: cd browser/base/content/assistant/build && node scripts/sync-embedding-assets.mjs
 */
import { createWriteStream, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "embedding-assets");
const ORT_DIR = join(ROOT, "ort");
const MODEL_DIR = join(ROOT, "models", "Xenova", "all-MiniLM-L6-v2");
const ONNX_DIR = join(MODEL_DIR, "onnx");

const pkg = JSON.parse(
  readFileSync(
    join(__dirname, "..", "node_modules", "@huggingface", "transformers", "package.json"),
    "utf8"
  )
);
const TF_VERSION = pkg.version;
const CDN_DIST = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TF_VERSION}/dist/`;
const HF = "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main";

const ORT_FILES = [
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
];

const MODEL_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "vocab.txt",
  { url: `${HF}/onnx/model_quantized.onnx`, dest: join(ONNX_DIR, "model_quantized.onnx") },
];

async function download(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  const body = Readable.fromWeb(res.body);
  await pipeline(body, createWriteStream(dest));
  console.log(dest);
}

async function main() {
  mkdirSync(ORT_DIR, { recursive: true });
  for (const f of ORT_FILES) {
    await download(CDN_DIST + f, join(ORT_DIR, f));
  }
  for (const item of MODEL_FILES) {
    if (typeof item === "string") {
      await download(`${HF}/${item}`, join(MODEL_DIR, item));
    } else {
      await download(item.url, item.dest);
    }
  }
  console.log("Done. Commit embedding-assets/ and update jar.mn if you added files.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
