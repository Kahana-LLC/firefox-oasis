/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF_GUIDED = "browser.oasis.onboarding.guidedFlowEnabled";
const PREF_MIGRATION_DONE = "browser.oasis.onboarding.migrationCompleted";
const PREF_POST_TIP = "browser.oasis.onboarding.postMigrationTipShown";

const NOTIFICATION_VALUE = "oasis-post-migration-oauth";

const OAUTH_HOST_SUFFIXES = [
  "accounts.google.com",
  "appleid.apple.com",
  "login.microsoftonline.com",
  "login.live.com",
];

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
});

function hostMatchesOAuth(uri) {
  if (!uri || uri.scheme !== "https") {
    return false;
  }
  try {
    const host = uri.host;
    return OAUTH_HOST_SUFFIXES.some(h => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function findOAuthTab(win) {
  if (!win?.gBrowser?.tabs) {
    return null;
  }
  for (const tab of win.gBrowser.tabs) {
    try {
      const uri = tab.linkedBrowser?.currentURI;
      if (hostMatchesOAuth(uri)) {
        return tab;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function onMigrationWizardClosed() {
  try {
    if (!Services.prefs.getBoolPref(PREF_GUIDED, true)) {
      return;
    }
    if (Services.prefs.getBoolPref(PREF_POST_TIP, false)) {
      return;
    }

    Services.prefs.setBoolPref(PREF_MIGRATION_DONE, true);

    const win = lazy.BrowserWindowTracker.getTopWindow({
      allowFromInactiveWorkspace: true,
    });
    if (!win?.gNotificationBox) {
      return;
    }

    const oauthTab = findOAuthTab(win);
    if (oauthTab) {
      win.gBrowser.selectedTab = oauthTab;
    }

    if (win.gNotificationBox.getNotificationWithValue(NOTIFICATION_VALUE)) {
      Services.prefs.setBoolPref(PREF_POST_TIP, true);
      return;
    }

    win.gNotificationBox.appendNotification(NOTIFICATION_VALUE, {
      label:
        "Finish signing in—use the account tab we selected, or return to Oasis AI to continue.",
      priority: win.gNotificationBox.PRIORITY_INFO_HIGH,
    });

    Services.prefs.setBoolPref(PREF_POST_TIP, true);
  } catch (e) {
    console.error("OasisOnboardingChrome: MigrationWizard:Closed handler", e);
  }
}

export const OasisOnboardingChrome = {
  _inited: false,
  _observer: null,

  init() {
    if (this._inited) {
      return;
    }
    this._inited = true;
    this._observer = (subject, topic) => {
      if (topic === "MigrationWizard:Closed") {
        onMigrationWizardClosed();
      }
    };
    Services.obs.addObserver(this._observer, "MigrationWizard:Closed");
  },
};
