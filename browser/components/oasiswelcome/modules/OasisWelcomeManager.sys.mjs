/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DID_SEE_OASIS_WELCOME_PREF = "browser.oasis.welcome.didSee";
const DID_COMPLETE_OASIS_ONBOARDING_PREF = "browser.oasis.welcome.completed";
const OASIS_WELCOME_ENABLED_PREF = "browser.oasis.welcome.enabled";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
});

export const OasisWelcomeManager = {
  get isEnabled() {
    return Services.prefs.getBoolPref(OASIS_WELCOME_ENABLED_PREF, true);
  },

  get didSeeWelcome() {
    return Services.prefs.getBoolPref(DID_SEE_OASIS_WELCOME_PREF, false);
  },

  get didCompleteOnboarding() {
    return Services.prefs.getBoolPref(DID_COMPLETE_OASIS_ONBOARDING_PREF, false);
  },

  shouldShowWelcome() {
    return this.isEnabled && !this.didCompleteOnboarding;
  },

  openWelcomePage(window) {
    if (!window) {
      window = lazy.BrowserWindowTracker.getTopWindow();
    }

    if (!window) {
      return;
    }

    const url = "about:welcome";
    
    try {
      const browser = window.gBrowser.selectedBrowser;
      const currentURI = browser.currentURI;
      
      // If current tab is blank or default page, replace it
      if (currentURI.spec === "about:blank" || 
          currentURI.spec === "about:newtab" ||
          currentURI.spec === "about:home") {
        browser.loadURI(Services.io.newURI(url), {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
      } else {
        // Otherwise open in new tab
        window.gBrowser.selectedTab = window.gBrowser.addTrustedTab(url, {
          inBackground: false,
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
      }
    } catch (e) {
      console.error("Failed to open Oasis Welcome page:", e);
    }
  },

  maybeShowWelcomeOnStartup(window) {
    if (this.shouldShowWelcome()) {
      this.openWelcomePage(window);
      return true;
    }
    return false;
  },
};

