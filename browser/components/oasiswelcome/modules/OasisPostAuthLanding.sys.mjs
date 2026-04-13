/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PrivateBrowsingUtils } from "resource://gre/modules/PrivateBrowsingUtils.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const PREF_OPEN_ASSISTANT = "browser.oasis.postAuthOpenAssistant";
const DID_COMPLETE_OASIS_ONBOARDING_PREF = "browser.oasis.welcome.completed";
const DEFAULT_NTP = "about:newtab";
const OASIS_ASSISTANT_SIDEBAR = "viewOasisAssistantSidebar";

export function getNewTabUrl() {
  try {
    if (Services.prefs.prefHasUserValue("browser.newtab.url")) {
      const u = Services.prefs.getStringPref("browser.newtab.url", "");
      if (u) {
        return u;
      }
    }
  } catch (e) {
    void e;
  }
  return DEFAULT_NTP;
}

/**
 * @param {Window} win
 * @param {{ docked?: boolean }} [options] docked true = sidebar chrome; false = floating overlay
 */
export async function showOasisAssistantInWindow(win, { docked = true } = {}) {
  if (PrivateBrowsingUtils.isWindowPrivate(win)) {
    return;
  }
  if (!Services.prefs.getBoolPref(PREF_OPEN_ASSISTANT, true)) {
    return;
  }
  try {
    const sc = win.SidebarController;
    if (!sc || typeof sc.show !== "function") {
      return;
    }
    await sc.promiseInitialized;
    if (typeof sc.waitUntilStable === "function") {
      await sc.waitUntilStable();
    }
    sc._oasisForceSidebar = !!docked;
    await sc.show(OASIS_ASSISTANT_SIDEBAR);
  } catch (e) {
    console.error("OasisPostAuthLanding: SidebarController.show failed", e);
  }
}

/**
 * After successful Oasis auth, open the new-tab page and optionally show the assistant.
 *
 * @param {Window} win Chrome browser window (navigator:browser)
 */
export function navigatePostAuthLanding(win) {
  if (!win?.gBrowser) {
    return;
  }

  try {
    const principal = Services.scriptSecurityManager.getSystemPrincipal();
    const ntpUrl = getNewTabUrl();
    const newTab = win.gBrowser.addTab(ntpUrl, {
      triggeringPrincipal: principal,
    });
    win.gBrowser.selectedTab = newTab;
    const browser = newTab.linkedBrowser;

    const openAssistant = async () => {
      await showOasisAssistantInWindow(win, { docked: true });
      try {
        Services.prefs.setBoolPref(DID_COMPLETE_OASIS_ONBOARDING_PREF, true);
      } catch (e) {
        void e;
      }
    };

    setTimeout(() => {
      if (browser.contentDocument?.readyState === "complete") {
        setTimeout(() => void openAssistant(), 0);
      } else {
        browser.addEventListener(
          "load",
          () => setTimeout(() => void openAssistant(), 0),
          { once: true }
        );
      }
    }, 0);
  } catch (e) {
    console.error("OasisPostAuthLanding: failed to open landing tab", e);
  }
}
