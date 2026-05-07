/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PrivateBrowsingUtils } from "resource://gre/modules/PrivateBrowsingUtils.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

import {
  getNewTabUrl,
  showOasisAssistantInWindow,
} from "./OasisPostAuthLanding.sys.mjs";

const DID_SEE_OASIS_WELCOME_PREF = "browser.oasis.welcome.didSee";
const DID_COMPLETE_OASIS_ONBOARDING_PREF = "browser.oasis.welcome.completed";
const OASIS_WELCOME_ENABLED_PREF = "browser.oasis.welcome.enabled";
const USE_ABOUT_WELCOME_PAGE_PREF = "browser.oasis.welcome.useAboutWelcomePage";
const SHOWN_NTP_ASSISTANT_LANDING_PREF =
  "browser.oasis.welcome.shownNtpAssistantLanding";
const OASIS_WELCOME_URL = "about:welcome";
const OASIS_WELCOME_CHROME =
  "chrome://browser/content/oasiswelcome/oasiswelcome.html";
const OASIS_AUTH_URL = "chrome://browser/content/oasiswelcome/oasis-auth.html";

export {
  navigatePostAuthLanding,
  getNewTabUrl,
  showOasisAssistantInWindow,
} from "./OasisPostAuthLanding.sys.mjs";

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
    return Services.prefs.getBoolPref(
      DID_COMPLETE_OASIS_ONBOARDING_PREF,
      false
    );
  },

  get useAboutWelcomePage() {
    return Services.prefs.getBoolPref(USE_ABOUT_WELCOME_PAGE_PREF, false);
  },

  get shownNtpAssistantLanding() {
    return Services.prefs.getBoolPref(SHOWN_NTP_ASSISTANT_LANDING_PREF, false);
  },

  shouldShowAboutWelcomePage() {
    return (
      this.isEnabled && !this.didCompleteOnboarding && this.useAboutWelcomePage
    );
  },

  shouldOfferNtpAssistantLanding() {
    return (
      this.isEnabled &&
      !this.didCompleteOnboarding &&
      !this.useAboutWelcomePage &&
      !this.shownNtpAssistantLanding
    );
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

      if (
        currentSpec === OASIS_AUTH_URL ||
        currentSpec === OASIS_WELCOME_CHROME ||
        currentSpec === url ||
        currentSpec.startsWith("about:welcome")
      ) {
        return;
      }

      if (
        currentSpec === "about:blank" ||
        currentSpec === "about:newtab" ||
        currentSpec === "about:home"
      ) {
        browser.loadURI(Services.io.newURI(url), {
          triggeringPrincipal:
            Services.scriptSecurityManager.getSystemPrincipal(),
        });
        this.resetZoom(window, browser);
      } else {
        const tab = window.gBrowser.addTrustedTab(url, {
          inBackground: false,
          triggeringPrincipal:
            Services.scriptSecurityManager.getSystemPrincipal(),
        });
        window.gBrowser.selectedTab = tab;
        this.resetZoom(window, tab.linkedBrowser);
      }
    } catch (e) {
      console.error("Failed to open Oasis Welcome page:", e);
    }
  },

  openNewTabWithDockedAssistant(window) {
    if (!window) {
      window = lazy.BrowserWindowTracker.getTopWindow();
    }
    if (!window?.gBrowser) {
      return;
    }
    if (PrivateBrowsingUtils.isWindowPrivate(window)) {
      return;
    }

    const ntpUrl = getNewTabUrl();
    const principal = Services.scriptSecurityManager.getSystemPrincipal();

    try {
      const browser = window.gBrowser.selectedBrowser;
      const currentSpec = browser.currentURI?.spec ?? "";

      let targetBrowser = browser;
      const replaceWithNtp =
        currentSpec === "about:blank" ||
        currentSpec === "about:newtab" ||
        currentSpec === "about:home" ||
        currentSpec === OASIS_AUTH_URL ||
        currentSpec === OASIS_WELCOME_CHROME ||
        currentSpec === OASIS_WELCOME_URL ||
        currentSpec.startsWith("about:welcome");

      if (replaceWithNtp) {
        browser.loadURI(Services.io.newURI(ntpUrl), {
          triggeringPrincipal: principal,
        });
        this.resetZoom(window, browser);
      } else {
        const tab = window.gBrowser.addTab(ntpUrl, {
          triggeringPrincipal: principal,
        });
        window.gBrowser.selectedTab = tab;
        targetBrowser = tab.linkedBrowser;
        this.resetZoom(window, targetBrowser);
      }

      const openDocked = async () => {
        await showOasisAssistantInWindow(window, { docked: true });
        try {
          Services.prefs.setBoolPref(SHOWN_NTP_ASSISTANT_LANDING_PREF, true);
        } catch (e) {
          void e;
        }
      };

      setTimeout(() => {
        if (targetBrowser.contentDocument?.readyState === "complete") {
          setTimeout(() => void openDocked(), 0);
        } else {
          targetBrowser.addEventListener(
            "load",
            () => setTimeout(() => void openDocked(), 0),
            { once: true }
          );
        }
      }, 0);
    } catch (e) {
      console.error("Failed to open NTP with docked assistant:", e);
    }
  },

  resetZoom(window, browser) {
    if (window?.ZoomManager?.setZoomForBrowser && browser) {
      window.ZoomManager.setZoomForBrowser(browser, 1.0);
    }
  },

  maybeShowWelcomeOnStartup(window) {
    if (this.shouldOfferNtpAssistantLanding()) {
      this.openNewTabWithDockedAssistant(window);
      return true;
    }
    if (this.shouldShowAboutWelcomePage()) {
      this.openWelcomePage(window);
      return true;
    }
    return false;
  },
};
