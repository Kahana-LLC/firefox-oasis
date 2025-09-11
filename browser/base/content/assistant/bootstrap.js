// Runs in the chrome-privileged browser window.
(function () {
  const sheet = document.getElementById("oasis-assistant-sheet");
  const frame = document.getElementById("oasis-assistant-frame");
  const fab   = document.getElementById("oasis-assistant-fab");
  const close = document.getElementById("oasis-assistant-close");

  function focusInput() {
    try {
      const w = frame?.contentWindow;
      const d = w?.document;
      const q = d?.getElementById("q");
      if (q) q.focus();
    } catch {}
  }

  // Focus when the iframe finishes loading
  frame?.addEventListener("load", () => setTimeout(focusInput, 50));

  function show() {
    if (!sheet) return;
    sheet.removeAttribute("hidden");
    if (fab) fab.setAttribute("aria-expanded", "true");
    // If already loaded, focus shortly after opening
    setTimeout(focusInput, 50);
  }

  function hide() {
    if (!sheet) return;
    sheet.setAttribute("hidden", "hidden");
    if (fab) {
      fab.setAttribute("aria-expanded", "false");
      try { fab.focus(); } catch {}
    }
  }

  function toggle() { sheet?.hasAttribute("hidden") ? show() : hide(); }

  // Expose helpers (optional)
  window.gOasisAssistant = { open: show, close: hide, toggle };

  if (fab) {
    fab.setAttribute("role", "button");
    fab.setAttribute("aria-controls", "oasis-assistant-sheet");
    fab.setAttribute("aria-expanded", "false");
    fab.addEventListener("click", toggle);
    fab.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
    });
  }
  if (close) close.addEventListener("click", hide);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet && !sheet.hasAttribute("hidden")) hide();
  });
})();
