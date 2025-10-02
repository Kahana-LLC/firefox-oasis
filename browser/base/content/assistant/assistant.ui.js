// UI script loaded by assistant.xhtml
// Handles streaming, session history, Stop/Clear actions, and focus behavior.

import {
  runAssistantStream,
  resetAssistantSession,
  getAssistantHistory,
} from "chrome://browser/content/assistant/assistant.bundle.js";

const log = document.getElementById("log");   // <pre id="log">
const q   = document.getElementById("q");     // <input id="q"> or <textarea id="q">
const go  = document.getElementById("go");    // <button id="go">
const bar = document.getElementById("bar") || q.parentElement;

// Add Stop & Clear buttons
const stopBtn  = document.createElement("button");
stopBtn.textContent = "Stop";
stopBtn.disabled = true;

const clearBtn = document.createElement("button");
clearBtn.textContent = "Clear";
clearBtn.title = "Clear chat history";

bar.appendChild(stopBtn);
bar.appendChild(clearBtn);

// Session id (per window/tab). Persist on the window so re-opens reuse it.
const SESSION_ID =
  (window.OASIS_SESSION_ID =
    window.OASIS_SESSION_ID ||
    (crypto?.randomUUID ? crypto.randomUUID() : "sess-" + Math.random().toString(36).slice(2)));

let busy = false;
let stopped = false;

function setBusy(v) {
  busy = v;
  q.disabled = v;
  go.disabled = v;
  stopBtn.disabled = !v;
  go.textContent = v ? "…" : "Send";
}

function toText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === "string" ? c : c?.text || "")).join("");
  }
  if (content != null) return String(content);
  return "";
}

function append(text) {
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
}

function renderHistory() {
  try {
    const msgs = getAssistantHistory(SESSION_ID) || [];
    if (!msgs.length) return;
    log.textContent = ""; // reset
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      const isUser = i % 2 === 0; // pushTurn stores Human then AI
      const prefix = isUser ? "\n> " : "";
      append(prefix + toText(m.content) + (isUser ? "\n" : "\n"));
    }
    // Ensure we end with a newline
    if (!log.textContent.endsWith("\n")) append("\n");
  } catch {
    // ignore
  }
}

async function send() {
  if (busy) return;
  const prompt = (q.value || "").trim();
  if (!prompt) return;

  q.value = "";
  append(`\n> ${prompt}\n`);
  stopped = false;
  setBusy(true);

  try {
    await runAssistantStream(
      prompt,
      (chunk) => {
        if (!stopped) append(chunk);
      },
      { sessionId: SESSION_ID }
    );
    if (!stopped) append("\n");
  } catch (e) {
    append(`Error: ${e?.message || e}\n`);
  } finally {
    setBusy(false);
  }
}

// Focus input on load
window.addEventListener("load", () => {
  renderHistory();
  try { q.focus(); } catch {}
});

// Wire Send
go.addEventListener("click", send);

// Enter sends; Shift+Enter makes a newline (useful if q is a <textarea>)
q.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

// Stop just stops further UI updates for this turn
stopBtn.addEventListener("click", () => {
  stopped = true;
  setBusy(false);
  append("\n(stopped)\n");
});

// Clear chat history
clearBtn.addEventListener("click", () => {
  resetAssistantSession(SESSION_ID);
  log.textContent = "";
  try { q.focus(); } catch {}
});
