// Privileged shim - runs in chrome (privileged) context
(function(){
  const Services = window.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

  window.assistantBridge = {
    openTab(url) {
      try {
        const fixed =
          url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;
        try {
          const win = Services.wm.getMostRecentWindow("navigator:browser");
          if (win?.openTrustedLinkIn) {
            win.openTrustedLinkIn(fixed, "tab");
            return true;
          }
          if (win?.openWebLinkIn) {
            win.openWebLinkIn(fixed, "tab", {});
            return true;
          }
          if (win?.gBrowser?.addTrustedTab) {
            win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(fixed);
            return true;
          }
          if (win?.gBrowser) {
            win.gBrowser.selectedTab = win.gBrowser.addTab(fixed);
            return true;
          }
        } catch (e) {
          console.warn("assistantBridge: failed to open tab via browser window", e);
        }
        const opened = window.open(fixed);
        return !!opened;
      } catch (e) {
        console.error("assistantBridge.openTab error", e);
        return false;
      }
    },
    getAuthState() {
      return window.oasisAuthState || { isAuthenticated: false, user: null };
    }
  };
})();
