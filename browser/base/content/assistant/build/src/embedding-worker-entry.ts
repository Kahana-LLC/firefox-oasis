/**
 * Embedding Worker — Runs in Content Process
 * 
 * Loaded inside a <browser type="content" remote="true"> element.
 * Communicates with the frame script via CustomEvents on document.
 * 
 * Events dispatched (page → frame script):
 *   "embed-ready"         — page script loaded
 *   "embed-model-loaded"  — ONNX model is ready
 *   "embed-result"        — embedding completed { id, embedding }
 *   "embed-error"         — embedding failed { id, error }
 * 
 * Events listened for (frame script → page):
 *   "embed-request"       — { id, text } request to embed
 */

import { pipeline, env, type FeatureExtractionPipeline } from "@huggingface/transformers";

import {
    EMBEDDING_LOCAL_MODEL_PATH,
    EMBEDDING_ORT_WASM_PATH,
} from "./utils/embeddingAssetPaths.js";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
env.localModelPath = EMBEDDING_LOCAL_MODEL_PATH;

const onnxWasm = env.backends.onnx.wasm!;
onnxWasm.numThreads = 1;
onnxWasm.proxy = false;
onnxWasm.wasmPaths = EMBEDDING_ORT_WASM_PATH;

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

const rootDoc: Document = (() => {
  const d = globalThis.document;
  if (!d) {
    throw new Error("[EmbeddingWorker] document is not available");
  }
  return d;
})();

let extractor: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null;

async function ensureModel(): Promise<FeatureExtractionPipeline> {
    if (extractor) return extractor;
    if (loadingPromise) return loadingPromise;

    console.log("[EmbeddingWorker] Loading model...");
    console.time("[EmbeddingWorker] Model load");

    loadingPromise = pipeline("feature-extraction", MODEL_NAME, {
        dtype: "q8",
    }) as unknown as Promise<FeatureExtractionPipeline>;

    try {
        extractor = await loadingPromise;
        console.timeEnd("[EmbeddingWorker] Model load");
        console.log("[EmbeddingWorker] Model loaded successfully");
        rootDoc.dispatchEvent(new CustomEvent("embed-model-loaded"));
        return extractor;
    } catch (err) {
        loadingPromise = null;
        console.error("[EmbeddingWorker] Model load failed:", err);
        throw err;
    }
}

async function embed(text: string): Promise<number[]> {
    const model = await ensureModel();
    const truncated = text.length > 512 ? text.substring(0, 512) : text;
    const output = await model(truncated, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
}

// Listen for embedding requests from frame script (via CustomEvent)
rootDoc.addEventListener("embed-request", async (event: Event) => {
    const detail = (event as CustomEvent<{ id: string; text: string }>).detail;
    const { id, text } = detail;
    console.log("[EmbeddingWorker] Received embed request, id:", id);

    try {
        const embedding = await embed(text);
        rootDoc.dispatchEvent(new CustomEvent("embed-result", {
            detail: { id, embedding },
        }));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        rootDoc.dispatchEvent(new CustomEvent("embed-error", {
            detail: { id, error: message },
        }));
    }
});

// Signal ready — dispatched multiple times to handle timing
function signalReady() {
    console.log("[EmbeddingWorker] Dispatching embed-ready event");
    rootDoc.dispatchEvent(new CustomEvent("embed-ready"));
}

// Signal immediately
signalReady();
// Signal again after a short delay in case the frame script isn't listening yet
setTimeout(signalReady, 100);
setTimeout(signalReady, 500);
setTimeout(signalReady, 2000);

console.log("[EmbeddingWorker] Ready, waiting for requests...");
