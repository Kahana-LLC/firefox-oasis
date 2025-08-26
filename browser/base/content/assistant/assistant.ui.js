import { runAssistantStream } from "chrome://browser/content/assistant/assistant.bundle.js";

const log = document.getElementById("log");
const q   = document.getElementById("q");
const go  = document.getElementById("go");

// Stop button
const bar = document.getElementById("bar") || q.parentElement;
const stop = document.createElement("button");
stop.textContent = "Stop";
stop.disabled = true;
bar.appendChild(stop);

let busy = false;
let stopped = false;

function setBusy(v) {
  busy = v;
  q.disabled = v;
  go.disabled = v;
  stop.disabled = !v;
  go.textContent = v ? "…" : "Send";
}

function append(text) {
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
}

async function send() {
  if (busy) return;
  const prompt = q.value.trim();
  if (!prompt) return;
  q.value = "";
  append(`\n> ${prompt}\n`);
  stopped = false;
  setBusy(true);

  try {
    await runAssistantStream(prompt, (chunk) => {
      if (!stopped) append(chunk);
    });
    if (!stopped) append("\n");
  } catch (e) {
    append(`Error: ${e?.message || e}\n`);
  } finally {
    setBusy(false);
  }
}

go.addEventListener("click", send);
q.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
stop.addEventListener("click", () => { stopped = true; setBusy(false); append("\n(stopped)\n"); });
