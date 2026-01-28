// Privileged shim - runs in chrome (privileged) context
(function(){
  const Services = window.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

  window.assistantBridge = {
    openTab(url) {
      try {
        console.log('assistantBridge.openTab', url);
        // Try to open a tab in the most recent browser window (best-effort)
        try {
          const win = Services.wm.getMostRecentWindow('navigator:browser');
          if (win && win.gBrowser) {
            const fixed = url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;
            win.gBrowser.selectedTab = win.gBrowser.addTab(fixed);
            return true;
          }
        } catch (e) {
          console.warn('assistantBridge: failed to open tab via gBrowser', e);
        }

        // Fallback: try window.open
        window.open(url);
        return true;
      } catch (e) {
        console.error('assistantBridge.openTab error', e);
        return false;
      }
    },
    getAuthState() {
      return window.oasisAuthState || { isAuthenticated: false, user: null };
    }
  };

  console.log('assistantBridge loaded');
})();
