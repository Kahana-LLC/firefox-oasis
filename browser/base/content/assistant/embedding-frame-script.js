/**
 * Embedding Frame Script — Runs in Content Process
 * 
 * Loaded via messageManager.loadFrameScript() into a remote <browser>.
 * 
 * This script does TWO things:
 * 1. Injects the Transformers.js embedding code into the page
 *    (as <script type="module"> that imports from CDN)
 * 2. Relays messages between chrome (messageManager) and page (CustomEvent)
 */

/* eslint-env mozilla/frame-script */

console.log("[EmbedFrameScript] Frame script loaded, readyState:", content.document.readyState);

// The embedding worker code to inject into the page
const WORKER_CODE = `
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.1';

env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.allowLocalModels = false;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
let extractor = null;
let loadingPromise = null;

async function ensureModel() {
  if (extractor) return extractor;
  if (loadingPromise) return loadingPromise;
  console.log('[EmbeddingWorker] Loading model...');
  loadingPromise = pipeline('feature-extraction', MODEL_NAME, { dtype: 'q8' });
  try {
    extractor = await loadingPromise;
    console.log('[EmbeddingWorker] Model loaded!');
    document.dispatchEvent(new CustomEvent('embed-model-loaded'));
    return extractor;
  } catch (err) {
    loadingPromise = null;
    console.error('[EmbeddingWorker] Load failed:', err);
    throw err;
  }
}

async function embed(text) {
  const model = await ensureModel();
  const t = text.length > 512 ? text.substring(0, 512) : text;
  const output = await model(t, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

document.addEventListener('embed-request', async (event) => {
  const { id, text } = event.detail;
  try {
    const embedding = await embed(text);
    document.dispatchEvent(new CustomEvent('embed-result', {
      detail: { id, embedding }
    }));
  } catch (err) {
    document.dispatchEvent(new CustomEvent('embed-error', {
      detail: { id, error: err.message || String(err) }
    }));
  }
});

document.dispatchEvent(new CustomEvent('embed-ready'));
console.log('[EmbeddingWorker] Ready');
`;

function setupPageListeners() {
    console.log("[EmbedFrameScript] Setting up page listeners");

    content.document.addEventListener("embed-result", function (event) {
        var detail = event.detail;
        console.log("[EmbedFrameScript] Got embed-result, id:", detail.id);
        sendAsyncMessage("EmbedResponse", {
            id: detail.id,
            embedding: detail.embedding,
        });
    }, false, true);

    content.document.addEventListener("embed-error", function (event) {
        var detail = event.detail;
        console.log("[EmbedFrameScript] Got embed-error, id:", detail.id);
        sendAsyncMessage("EmbedResponse", {
            id: detail.id,
            error: detail.error,
        });
    }, false, true);

    content.document.addEventListener("embed-ready", function (event) {
        console.log("[EmbedFrameScript] Got embed-ready from page!");
        sendAsyncMessage("EmbedWorkerReady", {});
    }, false, true);

    content.document.addEventListener("embed-model-loaded", function (event) {
        console.log("[EmbedFrameScript] Got embed-model-loaded");
        sendAsyncMessage("EmbedModelLoaded", {});
    }, false, true);
}

function injectWorkerScript() {
    console.log("[EmbedFrameScript] Injecting worker script into page");
    var doc = content.document;
    var script = doc.createElement("script");
    script.type = "module";
    script.textContent = WORKER_CODE;
    doc.head.appendChild(script);
    console.log("[EmbedFrameScript] Worker script injected");
}

// Chrome → Page: relay embed requests
addMessageListener("EmbedRequest", function (msg) {
    console.log("[EmbedFrameScript] Relaying EmbedRequest, id:", msg.data.id);
    var event = new content.CustomEvent("embed-request", {
        detail: Cu.cloneInto({ id: msg.data.id, text: msg.data.text }, content),
    });
    content.document.dispatchEvent(event);
});

// Initialize: set up listeners, then inject the worker script
function init() {
    console.log("[EmbedFrameScript] Initializing...");
    setupPageListeners();
    injectWorkerScript();
}

// Handle page load
if (content.document.readyState === "complete" || content.document.readyState === "interactive") {
    init();
} else {
    addEventListener("DOMContentLoaded", function () {
        console.log("[EmbedFrameScript] DOMContentLoaded fired");
        init();
    }, { once: true });
}
