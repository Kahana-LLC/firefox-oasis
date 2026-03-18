/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DID_SEE_OASIS_WELCOME_PREF = "browser.oasis.welcome.didSee";
const DID_COMPLETE_OASIS_ONBOARDING_PREF = "browser.oasis.welcome.completed";
const OASIS_CHAT_TOUR_TRIGGER_ID = "oasisAuthSuccess";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () => {
  const { Logger } = ChromeUtils.importESModule(
    "resource://messaging-system/lib/Logger.sys.mjs"
  );
  return new Logger("OasisWelcomeParent");
});

export class OasisWelcomeParent extends JSWindowActorParent {
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
        Services.prefs.setBoolPref("browser.oasis.import.history", data.history || false);
        Services.prefs.setBoolPref("browser.oasis.import.bookmarks", data.bookmarks || false);
        Services.prefs.setBoolPref("browser.oasis.import.extensions", data.extensions || false);
        Services.prefs.setBoolPref("browser.oasis.import.cookies", data.cookies || false);
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
        const onboardingTab = window.gBrowser.getTabForBrowser(this.browsingContext.embedderElement);

        // Open auth page in a new browser tab with proper context
        const authURL = "chrome://browser/content/oasiswelcome/oasis-auth.html";
        const newTab = window.gBrowser.addTrustedTab(authURL, {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
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
        // Open a new tab with the home page before closing the welcome tab
        // This ensures the browser doesn't close if welcome is the only tab
        const homePageURL = "about:home";
        const newTab = window.gBrowser.addTab(homePageURL, {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        window.gBrowser.selectedTab = newTab;

        // Now close the welcome tab
        const tab = window.gBrowser.getTabForBrowser(this.browsingContext.embedderElement);
        if (tab) {
          window.gBrowser.removeTab(tab);
        }
      }

      // Trigger feature callout after onboarding completes
      // Use setTimeout to ensure the new tab is ready
      lazy.setTimeout(() => {
        this.triggerFeatureCallout().catch(e => {
          lazy.log.error("Failed to trigger callout after onboarding:", e);
        });
      }, 1000);
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
      Services.prefs.setBoolPref("browser.aboutwelcome.didSeeFinalScreen", true);
      lazy.log.debug("Set browser.aboutwelcome.didSeeFinalScreen = true");

      // Ensure CFR features are enabled for targeting
      Services.prefs.setBoolPref("browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features", true);
      lazy.log.debug("Set CFR features preference = true");

      // Reset the tour preference if it's marked as complete, so the callout can show again
      const tourPrefName = "browser.oasis.chat-feature-tour";
      if (Services.prefs.prefHasUserValue(tourPrefName)) {
        const tourPrefValue = Services.prefs.getCharPref(tourPrefName);
        try {
          const tourProgress = JSON.parse(tourPrefValue);
          if (tourProgress.complete) {
            Services.prefs.setCharPref(tourPrefName, JSON.stringify({ screen: "OASIS_CHAT_STEP_1", complete: false }));
            lazy.log.debug("Reset Oasis chat feature tour preference to incomplete.");
          } else {
            lazy.log.debug("Tour preference already incomplete:", tourPrefValue);
          }
        } catch (e) {
          lazy.log.warn("Failed to parse existing tour preference, resetting:", e);
          Services.prefs.setCharPref(tourPrefName, JSON.stringify({ screen: "OASIS_CHAT_STEP_1", complete: false }));
        }
      } else {
        // Set default value if pref doesn't exist
        Services.prefs.setCharPref(tourPrefName, JSON.stringify({ screen: "OASIS_CHAT_STEP_1", complete: false }));
        lazy.log.debug("Set default Oasis chat feature tour preference.");
      }

      const { ASRouter } = ChromeUtils.importESModule("resource:///modules/asrouter/ASRouter.sys.mjs");
      if (!ASRouter) {
        lazy.log.error("ASRouter module not found");
        return;
      }

      if (typeof ASRouter.sendTriggerMessage !== 'function') {
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
      await new Promise(resolve => lazy.setTimeout(resolve, 1000));

      const browser = window.gBrowser.selectedBrowser;
      if (!browser) {
        lazy.log.warn("No selected browser found");
        return;
      }

      // Check if the target element exists in the main browser window
      const chatButton = window.document.getElementById("oasis-chat-button");
      if (chatButton) {
        lazy.log.debug("Oasis chat button found in main window, triggering callout");
      } else {
        lazy.log.warn("Oasis chat button not found in main window, callout may not show");
        // Try to find it after a delay
        await new Promise(resolve => lazy.setTimeout(resolve, 500));
        const chatButtonRetry = window.document.getElementById("oasis-chat-button");
        if (chatButtonRetry) {
          lazy.log.debug("Oasis chat button found on retry");
        } else {
          lazy.log.warn("Oasis chat button still not found after retry");
        }
      }

      lazy.log.debug(
        "Calling ASRouter.sendTriggerMessage with trigger id:",
        OASIS_CHAT_TOUR_TRIGGER_ID
      );

      // Find the message directly and use FeatureCalloutBroker for spotlight support
      const chatMsg = ASRouter.state.messages.find(
        m => m.id === "OASIS_CHAT_FEATURE_TOUR"
      );

      if (!chatMsg) {
        lazy.log.warn("OASIS_CHAT_FEATURE_TOUR message not found in ASRouter state");
        return;
      }

      const { FeatureCalloutBroker } = ChromeUtils.importESModule(
        "resource:///modules/asrouter/FeatureCalloutBroker.sys.mjs"
      );

      // Create spotlight overlay: dims entire screen except oasis-chat-button
      let spotlight = null;
      const chatBtn = window.document.getElementById("oasis-chat-button");
      if (chatBtn) {
        const btnRect = chatBtn.getBoundingClientRect();
        const pad = 6;

        spotlight = window.document.createElement("div");
        spotlight.id = "oasis-coach-spotlight";
        spotlight.style.cssText = `
          position: fixed;
          top: ${btnRect.top - pad}px;
          left: ${btnRect.left - pad}px;
          width: ${btnRect.width + pad * 2}px;
          height: ${btnRect.height + pad * 2}px;
          border-radius: 8px;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
          z-index: 2147483647;
          pointer-events: none;
        `;
        window.document.documentElement.appendChild(spotlight);
      }

      const shown = await FeatureCalloutBroker.showFeatureCallout(
        browser,
        chatMsg
      );
      lazy.log.debug("showFeatureCallout result:", shown);

      // Remove spotlight if callout wasn't shown
      if (!shown && spotlight?.parentElement) {
        spotlight.remove();
        spotlight = null;
      }

      // Clean up spotlight when callout is dismissed
      if (spotlight) {
        const cleanupSpotlight = () => {
          if (spotlight?.parentElement) {
            spotlight.remove();
          }
        };

        // Listen for panel dismiss
        lazy.setTimeout(() => {
          const calloutEl = window.document.querySelector(
            'panel[type="arrow"] .onboardingContainer'
          );
          if (calloutEl) {
            const panel = calloutEl.closest("panel");
            if (panel) {
              panel.addEventListener("popuphidden", cleanupSpotlight, {
                once: true,
              });
            }
          }
        }, 500);

        // Safety: remove after 60 seconds regardless
        lazy.setTimeout(cleanupSpotlight, 60000);
      }

      lazy.log.debug("Triggered Oasis chat feature callout after successful authentication");
    } catch (e) {
      lazy.log.error("Failed to trigger feature callout:", e);
    }
  }

  didDestroy() {
    lazy.log.debug("OasisWelcomeParent actor destroyed");
  }
}
