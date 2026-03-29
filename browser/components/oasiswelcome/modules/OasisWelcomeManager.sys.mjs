/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DID_SEE_OASIS_WELCOME_PREF = "browser.oasis.welcome.didSee";
const DID_COMPLETE_OASIS_ONBOARDING_PREF = "browser.oasis.welcome.completed";
const OASIS_WELCOME_ENABLED_PREF = "browser.oasis.welcome.enabled";
const OASIS_WELCOME_URL =
  "chrome://browser/content/oasiswelcome/oasiswelcome.html";
const OASIS_AUTH_URL = "chrome://browser/content/oasiswelcome/oasis-auth.html";

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

    const url = OASIS_WELCOME_URL;

    try {
      const browser = window.gBrowser.selectedBrowser;
      const currentSpec = browser.currentURI?.spec ?? "";

      if (currentSpec === url || currentSpec === OASIS_AUTH_URL) {
        return;
      }

      // If current tab is blank or default page, replace it
      if (
        currentSpec === "about:blank" ||
        currentSpec === "about:newtab" ||
        currentSpec === "about:home" ||
        currentSpec.startsWith("about:welcome")
      ) {
        browser.loadURI(Services.io.newURI(url), {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        this.resetZoom(window, browser);
      } else {
        // Otherwise open in new tab
        const tab = window.gBrowser.addTrustedTab(url, {
          inBackground: false,
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        window.gBrowser.selectedTab = tab;
        this.resetZoom(window, tab.linkedBrowser);
      }
    } catch (e) {
      console.error("Failed to open Oasis Welcome page:", e);
    }
  },

  resetZoom(window, browser) {
    if (window?.ZoomManager?.setZoomForBrowser && browser) {
      window.ZoomManager.setZoomForBrowser(browser, 1.0);
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
