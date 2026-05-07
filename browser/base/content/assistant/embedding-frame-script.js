/**
 * Embedding Frame Script — Runs in Content Process
 *
 * Loaded via messageManager.loadFrameScript() into a remote <browser> that
 * navigates to chrome://browser/content/assistant/embedding-worker.html.
 * The page loads embedding-worker.bundle.js (packaged; no CDN). This script
 * relays CustomEvents between the page and chrome (messageManager).
 */

/* eslint-env mozilla/frame-script */

console.log("[EmbedFrameScript] Frame script loaded, readyState:", content.document.readyState);

let embedListenersAttached = false;

function setupPageListeners() {
  if (embedListenersAttached) {
    return;
  }
  embedListenersAttached = true;
  console.log("[EmbedFrameScript] Setting up page listeners");

  content.document.addEventListener(
    "embed-result",
    function (event) {
      var detail = event.detail;
      console.log("[EmbedFrameScript] Got embed-result, id:", detail.id);
      sendAsyncMessage("EmbedResponse", {
        id: detail.id,
        embedding: detail.embedding,
      });
    },
    false,
    true
  );

  content.document.addEventListener(
    "embed-error",
    function (event) {
      var detail = event.detail;
      console.log("[EmbedFrameScript] Got embed-error, id:", detail.id);
      sendAsyncMessage("EmbedResponse", {
        id: detail.id,
        error: detail.error,
      });
    },
    false,
    true
  );

  content.document.addEventListener(
    "embed-ready",
    function () {
      console.log("[EmbedFrameScript] Got embed-ready from page!");
      sendAsyncMessage("EmbedWorkerReady", {});
    },
    false,
    true
  );

  content.document.addEventListener(
    "embed-model-loaded",
    function () {
      console.log("[EmbedFrameScript] Got embed-model-loaded");
      sendAsyncMessage("EmbedModelLoaded", {});
    },
    false,
    true
  );
}

addMessageListener("EmbedRequest", function (msg) {
  console.log("[EmbedFrameScript] Relaying EmbedRequest, id:", msg.data.id);
  var event = new content.CustomEvent("embed-request", {
    detail: Cu.cloneInto(
      { id: msg.data.id, text: msg.data.text },
      content
    ),
  });
  content.document.dispatchEvent(event);
});

function init() {
  console.log("[EmbedFrameScript] Initializing...");
  setupPageListeners();
}

if (
  content.document.readyState === "complete" ||
  content.document.readyState === "interactive"
) {
  init();
} else {
  addEventListener(
    "DOMContentLoaded",
    function () {
      console.log("[EmbedFrameScript] DOMContentLoaded fired");
      init();
    },
    { once: true }
  );
}
