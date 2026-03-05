// Lightweight auth guard for assistant entrypoints.
(function() {
  "use strict";

  if (window.__oasisAuthGuardInstalled) {
    return;
  }
  window.__oasisAuthGuardInstalled = true;

  function isAuthenticated() {
    const authState = window.oasisAuthState;
    return !!(authState && authState.isAuthenticated);
  }

  const originalRunAssistantStream = window.runAssistantStream;
  if (typeof originalRunAssistantStream !== "function") {
    return;
  }

  window.runAssistantStream = async function(...args) {
    if (!isAuthenticated()) {
      throw new Error("Authentication required: Please sign in to use the AI assistant");
    }
    return await originalRunAssistantStream.apply(this, args);
  };
})();
