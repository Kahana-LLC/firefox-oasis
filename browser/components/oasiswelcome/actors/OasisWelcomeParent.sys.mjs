/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { navigatePostAuthLanding } from "resource:///modules/oasiswelcome/OasisPostAuthLanding.sys.mjs";

const DID_SEE_OASIS_WELCOME_PREF = "browser.oasis.welcome.didSee";
const DID_COMPLETE_OASIS_ONBOARDING_PREF = "browser.oasis.welcome.completed";
const PREF_POST_AUTH_OPEN_ASSISTANT = "browser.oasis.postAuthOpenAssistant";
const LOGIN_HOSTNAME = "https://kahana.co";
const LOGIN_REALM = "Oasis Assistant";
const LOGIN_USERNAME = "oasis_assistant_session";
const OAUTH_HANDOFF_COOKIE_NAME = "oasis_assistant_handoff";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "log", () => {
  const { Logger } = ChromeUtils.importESModule(
    "resource://messaging-system/lib/Logger.sys.mjs"
  );
  return new Logger("OasisWelcomeParent");
});

ChromeUtils.defineLazyGetter(lazy, "setTimeout", () => {
  const { setTimeout } = ChromeUtils.importESModule(
    "resource://gre/modules/Timer.sys.mjs"
  );
  return setTimeout;
});

function delay(ms) {
  return new Promise(resolve => lazy.setTimeout(resolve, ms));
}

/** Parent side of the OasisWelcome window actor (onboarding, OAuth bridge queries). */
export class OasisWelcomeParent extends JSWindowActorParent {
  /**
   * @param {{ name: string; data?: object }} message
   * @returns {any}
   */
  receiveMessage(message) {
    const { name, data } = message;
    lazy.log.debug(`Received message: ${name}`, data);

    switch (name) {
      case "OasisWelcome:SetUserName":
        this.setUserName(data);
        break;
      case "OasisWelcome:SetImportSettings":
        this.setImportSettings(data);
        break;
      case "OasisWelcome:OpenSignup":
        this.openSignupInNewTab();
        break;
      case "OasisWelcome:Finished":
        this.completeOnboarding();
        break;
      case "SET_OASIS_WELCOME_SEEN":
        this.markWelcomeSeen(data);
        break;
      case "SET_OASIS_ONBOARDING_COMPLETE":
        this.markOnboardingComplete(data);
        break;
      case "OASIS_TELEMETRY":
        this.sendTelemetry(data);
        break;
      case "OasisWelcome:TriggerFeatureCallout":
        this.triggerFeatureCallout().catch(e => {
          lazy.log.error("Error in triggerFeatureCallout:", e);
        });
        break;
      case "OasisWelcome:GetOAuthBridgeState":
        return this.getOAuthBridgeState(data);
      case "OasisWelcome:PersistSharedSession":
        return this.persistSharedSession(data);
    }
    return undefined;
  }

  getOAuthBridgeState(data = {}) {
    const target = data?.target || "onboarding";
    const allowFallbackTarget = !!data?.allowFallbackTarget;
    const consumeCookie = data?.consumeCookie !== false;
    const response = {
      cookiePayload: null,
      sessionData: null,
    };

    try {
      let latest = null;
      let latestFallback = null;
      for (const cookie of Services.cookies.cookies) {
        if (cookie.name !== OAUTH_HANDOFF_COOKIE_NAME) {
          continue;
        }

        try {
          const payload = JSON.parse(decodeURIComponent(cookie.value));
          const timestamp = payload?.timestamp || 0;
          const matchesTarget = !payload?.target || payload.target === target;

          if (!matchesTarget) {
            if (
              allowFallbackTarget &&
              (!latestFallback ||
                timestamp > (latestFallback.payload?.timestamp || 0))
            ) {
              latestFallback = { cookie, payload };
            }
            continue;
          }

          if (!latest || timestamp > (latest.payload?.timestamp || 0)) {
            latest = { cookie, payload };
          }
        } catch (e) {
          lazy.log.error("Failed to parse OAuth handoff cookie:", e);
        }
      }

      const selected = latest || latestFallback;
      if (selected?.payload) {
        response.cookiePayload = selected.payload;
        if (consumeCookie) {
          try {
            Services.cookies.remove(
              selected.cookie.host,
              selected.cookie.name,
              selected.cookie.path,
              selected.cookie.originAttributes || {}
            );
          } catch (e) {
            lazy.log.error("Failed to clear OAuth handoff cookie:", e);
          }
        }
      }
    } catch (e) {
      lazy.log.error("Failed to read OAuth handoff cookies:", e);
    }

    try {
      const logins = Services.logins.findLogins(
        LOGIN_HOSTNAME,
        null,
        LOGIN_REALM
      );
      const login = logins.find(entry => entry.username === LOGIN_USERNAME);
      if (login) {
        response.sessionData = JSON.parse(login.password);
      }
    } catch (e) {
      lazy.log.error("Failed to read shared auth session:", e);
    }

    return response;
  }

  async persistSharedSession(data = {}) {
    const sessionData = data?.sessionData;
    if (!sessionData?.access_token || !sessionData?.refresh_token) {
      return { success: false, error: "Missing session tokens" };
    }

    try {
      const logins = Services.logins.findLogins(
        LOGIN_HOSTNAME,
        null,
        LOGIN_REALM
      );
      for (const login of logins) {
        if (login.username === LOGIN_USERNAME) {
          Services.logins.removeLogin(login);
        }
      }

      const loginInfo = new Components.Constructor(
        "@mozilla.org/login-manager/loginInfo;1",
        Ci.nsILoginInfo,
        "init"
      )(
        LOGIN_HOSTNAME,
        null,
        LOGIN_REALM,
        LOGIN_USERNAME,
        JSON.stringify(sessionData),
        "",
        ""
      );

      await Services.logins.addLoginAsync(loginInfo);
      lazy.log.debug("Persisted shared Oasis session", {
        email: sessionData.user?.email || null,
      });
      return {
        success: true,
        email: sessionData.user?.email || null,
      };
    } catch (e) {
      lazy.log.error("Failed to persist shared Oasis session:", e);
      return {
        success: false,
        error: e?.message || String(e),
      };
    }
  }

  setUserName(data) {
    try {
      if (data && data.name) {
        Services.prefs.setStringPref("browser.oasis.user.name", data.name);
        lazy.log.debug("Saved user name:", data.name);
      }
    } catch (e) {
      lazy.log.error("Failed to save user name:", e);
    }
  }

  setImportSettings(data) {
    try {
      if (data) {
        Services.prefs.setBoolPref(
          "browser.oasis.import.history",
          data.history || false
        );
        Services.prefs.setBoolPref(
          "browser.oasis.import.bookmarks",
          data.bookmarks || false
        );
        Services.prefs.setBoolPref(
          "browser.oasis.import.extensions",
          data.extensions || false
        );
        Services.prefs.setBoolPref(
          "browser.oasis.import.cookies",
          data.cookies || false
        );
        lazy.log.debug("Saved import settings:", data);
      }
    } catch (e) {
      lazy.log.error("Failed to save import settings:", e);
    }
  }

  openSignupInNewTab() {
    try {
      const window = this.browsingContext.topChromeWindow;
      if (window && window.gBrowser) {
        // Get the onboarding tab before opening new one
        const onboardingTab = window.gBrowser.getTabForBrowser(
          this.browsingContext.embedderElement
        );

        // Open auth page in a new browser tab with proper context
        const authURL = "chrome://browser/content/oasiswelcome/oasis-auth.html";
        const newTab = window.gBrowser.addTrustedTab(authURL, {
          triggeringPrincipal:
            Services.scriptSecurityManager.getSystemPrincipal(),
          inBackground: false,
        });
        window.gBrowser.selectedTab = newTab;
        if (window.ZoomManager?.setZoomForBrowser) {
          window.ZoomManager.setZoomForBrowser(newTab.linkedBrowser, 1.0);
        }

        // Close the onboarding tab
        if (onboardingTab) {
          window.gBrowser.removeTab(onboardingTab);
          lazy.log.debug("Closed onboarding tab");
        }

        lazy.log.debug("Opened Oasis auth in new tab");
      }
    } catch (e) {
      lazy.log.error("Failed to open auth in new tab:", e);
    }
  }

  completeOnboarding() {
    try {
      Services.prefs.setBoolPref(DID_COMPLETE_OASIS_ONBOARDING_PREF, true);
      lazy.log.debug("Oasis onboarding completed");

      const window = this.browsingContext.topChromeWindow;
      if (window && window.gBrowser) {
        navigatePostAuthLanding(window);

        const tab = window.gBrowser.getTabForBrowser(
          this.browsingContext.embedderElement
        );
        if (tab) {
          window.gBrowser.removeTab(tab);
        }
      }

      const skipCallout = Services.prefs.getBoolPref(
        PREF_POST_AUTH_OPEN_ASSISTANT,
        true
      );
      if (!skipCallout) {
        lazy.setTimeout(() => {
          this.triggerFeatureCallout().catch(e => {
            lazy.log.error("Failed to trigger callout after onboarding:", e);
          });
        }, 1000);
      }
    } catch (e) {
      lazy.log.error("Failed to complete onboarding:", e);
    }
  }

  markWelcomeSeen(data) {
    try {
      Services.prefs.setBoolPref(DID_SEE_OASIS_WELCOME_PREF, true);
      Services.prefs.setCharPref(
        "browser.oasis.welcome.timestamp",
        String(data.timestamp || Date.now())
      );
      lazy.log.debug("Marked Oasis welcome as seen");
    } catch (e) {
      lazy.log.error("Failed to mark welcome as seen:", e);
    }
  }

  markOnboardingComplete(data) {
    try {
      Services.prefs.setBoolPref(DID_COMPLETE_OASIS_ONBOARDING_PREF, true);
      Services.prefs.setIntPref(
        "browser.oasis.welcome.lastPage",
        data.lastPage || 0
      );
      lazy.log.debug("Marked Oasis onboarding as complete");
    } catch (e) {
      lazy.log.error("Failed to mark onboarding as complete:", e);
    }
  }

  sendTelemetry(data) {
    lazy.log.debug("Oasis Welcome Telemetry:", data);
  }

  async triggerFeatureCallout() {
    try {
      lazy.log.debug("Starting triggerFeatureCallout");

      // Set the preference required for OASIS_CHAT_FEATURE_TOUR to show
      // The targeting requires: 'browser.aboutwelcome.didSeeFinalScreen' | preferenceValue == true
      Services.prefs.setBoolPref(
        "browser.aboutwelcome.didSeeFinalScreen",
        true
      );
      lazy.log.debug("Set browser.aboutwelcome.didSeeFinalScreen = true");

      // Ensure CFR features are enabled for targeting
      Services.prefs.setBoolPref(
        "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features",
        true
      );
      lazy.log.debug("Set CFR features preference = true");

      // Reset the tour preference if it's marked as complete, so the callout can show again
      const tourPrefName = "browser.oasis.chat-feature-tour";
      if (Services.prefs.prefHasUserValue(tourPrefName)) {
        const tourPrefValue = Services.prefs.getCharPref(tourPrefName);
        try {
          const tourProgress = JSON.parse(tourPrefValue);
          if (tourProgress.complete) {
            Services.prefs.setCharPref(
              tourPrefName,
              JSON.stringify({ screen: "OASIS_CHAT_STEP_1", complete: false })
            );
            lazy.log.debug(
              "Reset Oasis chat feature tour preference to incomplete."
            );
          } else {
            lazy.log.debug(
              "Tour preference already incomplete:",
              tourPrefValue
            );
          }
        } catch (e) {
          lazy.log.warn(
            "Failed to parse existing tour preference, resetting:",
            e
          );
          Services.prefs.setCharPref(
            tourPrefName,
            JSON.stringify({ screen: "OASIS_CHAT_STEP_1", complete: false })
          );
        }
      } else {
        // Set default value if pref doesn't exist
        Services.prefs.setCharPref(
          tourPrefName,
          JSON.stringify({ screen: "OASIS_CHAT_STEP_1", complete: false })
        );
        lazy.log.debug("Set default Oasis chat feature tour preference.");
      }

      const { ASRouter } = ChromeUtils.importESModule(
        "resource:///modules/asrouter/ASRouter.sys.mjs"
      );
      if (!ASRouter) {
        lazy.log.error("ASRouter module not found");
        return;
      }

      if (typeof ASRouter.sendTriggerMessage !== "function") {
        lazy.log.error("ASRouter.sendTriggerMessage is not a function");
        return;
      }

      await ASRouter.waitForInitialized;
      lazy.log.debug("ASRouter initialized");

      // Get the most recent browser window (not the auth page window)
      const window = Services.wm.getMostRecentWindow("navigator:browser");
      if (!window || !window.gBrowser) {
        lazy.log.warn("No browser window found");
        return;
      }

      // Wait for the main browser window to be ready and ensure we're on a content page
      // The callout needs to show on the main browser window, not the auth page
      await delay(1000);

      const browser = window.gBrowser.selectedBrowser;
      if (!browser) {
        lazy.log.warn("No selected browser found");
        return;
      }

      // Check if the target element exists in the main browser window
      const chatButton = window.document.getElementById("oasis-navbar-pill");
      if (chatButton) {
        lazy.log.debug(
          "Oasis chat button found in main window, triggering callout"
        );
      } else {
        lazy.log.warn(
          "Oasis chat button not found in main window, callout may not show"
        );
        // Try to find it after a delay
        await delay(500);
        const chatButtonRetry =
          window.document.getElementById("oasis-navbar-pill");
        if (chatButtonRetry) {
          lazy.log.debug("Oasis chat button found on retry");
        } else {
          lazy.log.warn("Oasis chat button still not found after retry");
        }
      }

      lazy.log.debug(
        "Calling ASRouter.sendTriggerMessage with trigger id: defaultBrowserCheck"
      );
      const result = await ASRouter.sendTriggerMessage({
        id: "defaultBrowserCheck", // Trigger ID for OASIS_CHAT_FEATURE_TOUR
        context: { source: "oasis-auth" },
        browser,
      });
      lazy.log.debug("ASRouter.sendTriggerMessage completed, result:", result);
      lazy.log.debug(
        "Triggered Oasis chat feature callout after successful authentication"
      );
    } catch (e) {
      lazy.log.error("Failed to trigger feature callout:", e);
    }
  }

  didDestroy() {
    lazy.log.debug("OasisWelcomeParent actor destroyed");
  }
}
