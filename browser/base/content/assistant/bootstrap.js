// Runs in the chrome-privileged browser window.
(function () {
  const sheet = document.getElementById("oasis-assistant-sheet");
  const frame = document.getElementById("oasis-assistant-frame");
  const fab   = document.getElementById("oasis-assistant-fab");
  const close = document.getElementById("oasis-assistant-close");

  // Prefer Services if available; otherwise fall back to XPCOM prefs.
  let getStringPref = (name, def) => def;
  (function initPrefAccess() {
    try {
      // If Services is already on the global (common in chrome windows), use it.
      if (typeof Services !== "undefined" && Services?.prefs) {
        getStringPref = (n, d) => Services.prefs.getStringPref(n, d);
        return;
      }
    } catch (_) {}

    // Fallback: use XPCOM directly.
    try {
      /* global Components */
      const { classes: Cc, interfaces: Ci } = Components;
      const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
      getStringPref = (n, d) => {
        try { return prefs.getCharPref(n); } catch (_) { return d; }
      };
    } catch (e) {
      console.error("Oasis: no pref access available", e);
    }
  })();

  function readCfg() {
    // Defaults
    const cfg = {
      key: "",
      model: "claude-3-5-sonnet-20240620",
      temperature: 0.3,
      maxTokens: 200,
    };
    try {
      cfg.key         = getStringPref("oasis.assistant.anthropic_api_key", cfg.key);
      cfg.model       = getStringPref("oasis.assistant.model", cfg.model);
      cfg.temperature = parseFloat(getStringPref("oasis.assistant.temperature", String(cfg.temperature)));
      cfg.maxTokens   = parseInt(getStringPref("oasis.assistant.maxTokens", String(cfg.maxTokens)), 10);
    } catch (e) {
      console.error("Oasis: failed to read prefs", e);
    }
    return cfg;
  }

  function seedFrameConfig() {
    try {
      if (!frame?.contentWindow) return;
      const cfg = readCfg();
      frame.contentWindow.OASIS_CFG = cfg;
      // Signal to the iframe that config is ready (idempotent)
      frame.contentWindow.dispatchEvent(new frame.contentWindow.CustomEvent("oasis-cfg-ready"));
    } catch (e) {
      console.error("Oasis: failed to seed frame config", e);
    }
  }

  // Seed whenever the iframe loads
  frame?.addEventListener("load", seedFrameConfig);

  function show() { sheet.removeAttribute("hidden"); }
  function hide() { sheet.setAttribute("hidden", "hidden"); }
  function toggle() { sheet.hasAttribute("hidden") ? show() : hide(); }

  window.gOasisAssistant = { open: show, close: hide, toggle };

  if (fab) {
    fab.addEventListener("click", toggle);
    fab.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
    });
  }
  if (close) close.addEventListener("click", hide);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hasAttribute("hidden")) hide();
  });
})();
