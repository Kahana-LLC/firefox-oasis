/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Privileged shim - runs in chrome (privileged) context
// This file acts as the bridge between the privileged Firefox environment and the content-based Preact UI.

(function () {
  const Services =
    window.Services ||
    ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

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
            win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(fixed, {
              inBackground: false,
            });
            return true;
          }
          if (win?.gBrowser) {
            win.gBrowser.selectedTab = win.gBrowser.addTab(fixed, {
              triggeringPrincipal:
                Services.scriptSecurityManager.getSystemPrincipal(),
              inBackground: false,
            });
            return true;
          }
        } catch (e) {
          console.warn(
            "assistantBridge: failed to open tab via browser window",
            e
          );
        }
        const opened = window.open(fixed);
        return !!opened;
      } catch (e) {
        console.error("assistantBridge.openTab error", e);
        return false;
      }
    },
    async getAssistantHistory() {
      try {
        const HIST_USERNAME = "oasis_assistant_history";
        const logins = Services.logins.findLogins(
          LOGIN_HOSTNAME,
          null,
          LOGIN_REALM
        );
        const entry = logins.find(l => l.username === HIST_USERNAME);
        if (entry) {
          try {
            return JSON.parse(entry.password);
          } catch (e) {
            void e;
          }
        }
      } catch (e) {
        console.error("assistantBridge.getAssistantHistory error", e);
      }
      return null;
    },
    async setAssistantHistory(history) {
      try {
        const HIST_USERNAME = "oasis_assistant_history";
        // Remove any existing history entry
        try {
          const logins = Services.logins.findLogins(
            LOGIN_HOSTNAME,
            null,
            LOGIN_REALM
          );
          for (const l of logins) {
            if (l.username === HIST_USERNAME) {
              Services.logins.removeLogin(l);
            }
          }
        } catch (e) {
          // Non-fatal
        }

        const loginInfo = new Components.Constructor(
          "@mozilla.org/login-manager/loginInfo;1",
          Ci.nsILoginInfo,
          "init"
        )(
          LOGIN_HOSTNAME,
          null,
          LOGIN_REALM,
          HIST_USERNAME,
          JSON.stringify(history || []),
          "",
          ""
        );
        await Services.logins.addLoginAsync(loginInfo);
        // Notify any UI instances that history changed
        try {
          window.dispatchEvent(new CustomEvent("oasis-history-update"));
        } catch (e) {
          void e;
        }
      } catch (e) {
        console.error("assistantBridge.setAssistantHistory error", e);
      }
    },
    getAuthState() {
      return window.oasisAuthState || { isAuthenticated: false, user: null };
    },
    getOnboardingStatus() {
      try {
        return {
          guidedFlowEnabled: Services.prefs.getBoolPref(
            "browser.oasis.onboarding.guidedFlowEnabled",
            true
          ),
          migrationCompleted: Services.prefs.getBoolPref(
            "browser.oasis.onboarding.migrationCompleted",
            false
          ),
          postMigrationTipShown: Services.prefs.getBoolPref(
            "browser.oasis.onboarding.postMigrationTipShown",
            false
          ),
          checklistDismissed: Services.prefs.getBoolPref(
            "browser.oasis.onboarding.checklistDismissed",
            false
          ),
          oauthAttemptStarted: Services.prefs.getBoolPref(
            "browser.oasis.onboarding.oauthAttemptStarted",
            false
          ),
          importOptOut: Services.prefs.getBoolPref(
            "browser.oasis.onboarding.importOptOut",
            false
          ),
          firstAiTurnComplete: Services.prefs.getBoolPref(
            "browser.oasis.onboarding.firstAiTurnComplete",
            false
          ),
          welcomeCompleted: Services.prefs.getBoolPref(
            "browser.oasis.welcome.completed",
            false
          ),
        };
      } catch (e) {
        console.error("assistantBridge.getOnboardingStatus error", e);
        return {
          guidedFlowEnabled: true,
          migrationCompleted: false,
          postMigrationTipShown: false,
          checklistDismissed: false,
          oauthAttemptStarted: false,
          importOptOut: false,
          firstAiTurnComplete: false,
          welcomeCompleted: false,
        };
      }
    },
    markOauthSignInStarted() {
      try {
        Services.prefs.setBoolPref(
          "browser.oasis.onboarding.oauthAttemptStarted",
          true
        );
      } catch (e) {
        void e;
      }
    },
    dismissOnboardingChecklist() {
      try {
        Services.prefs.setBoolPref(
          "browser.oasis.onboarding.checklistDismissed",
          true
        );
      } catch (e) {
        void e;
      }
    },
    markImportOptOut() {
      try {
        if (
          Services.prefs.getBoolPref(
            "browser.oasis.onboarding.importOptOut",
            false
          )
        ) {
          return;
        }
        Services.prefs.setBoolPref(
          "browser.oasis.onboarding.importOptOut",
          true
        );
        window.dispatchEvent(new CustomEvent("oasis-onboarding-update"));
      } catch (e) {
        void e;
      }
    },
    markFirstAiTurnComplete() {
      try {
        if (
          Services.prefs.getBoolPref(
            "browser.oasis.onboarding.firstAiTurnComplete",
            false
          )
        ) {
          return;
        }
        Services.prefs.setBoolPref(
          "browser.oasis.onboarding.firstAiTurnComplete",
          true
        );
        window.dispatchEvent(new CustomEvent("oasis-onboarding-update"));
      } catch (e) {
        void e;
      }
    },
    openImportBrowserData() {
      try {
        const win = Services.wm.getMostRecentWindow("navigator:browser");
        if (!win) {
          return false;
        }
        const { MigrationUtils } = ChromeUtils.importESModule(
          "resource:///modules/MigrationUtils.sys.mjs"
        );
        void MigrationUtils.showMigrationWizard(win, {
          entrypoint: MigrationUtils.MIGRATION_ENTRYPOINTS.UNKNOWN,
        });
        return true;
      } catch (e) {
        console.error("assistantBridge.openImportBrowserData error", e);
        return false;
      }
    },
  };
})();

// Expose global helpers for existing UI code that expects `window.getAssistantHistory` / `window.setAssistantHistory`
try {
  if (typeof window.getAssistantHistory !== "function") {
    window.getAssistantHistory = function () {
      try {
        if (
          window.assistantBridge &&
          typeof window.assistantBridge.getAssistantHistory === "function"
        ) {
          return window.assistantBridge.getAssistantHistory();
        }
      } catch (e) {
        console.error("window.getAssistantHistory error", e);
      }
      return null;
    };
  }

  if (typeof window.setAssistantHistory !== "function") {
    window.setAssistantHistory = async function (history) {
      try {
        if (
          window.assistantBridge &&
          typeof window.assistantBridge.setAssistantHistory === "function"
        ) {
          return await window.assistantBridge.setAssistantHistory(history);
        }
      } catch (e) {
        console.error("window.setAssistantHistory error", e);
      }
      return undefined;
    };
  }
} catch (e) {
  console.error("Failed to expose assistant history globals", e);
}

const MIXPANEL_TOKEN = "4a23d4890cf107ac290b2d5e878e2561";

// --- Dynamic Loader for Preact Bundle ---
(function () {
  try {
    const ASSISTANT_CONTENT_BASE = "chrome://browser/content/assistant/";
    const bundleSrc = ASSISTANT_CONTENT_BASE + "dist/assistant.ui.bundle.js";
    const cssSrc = ASSISTANT_CONTENT_BASE + "dist/assistant.ui.bundle.css";

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssSrc;
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = bundleSrc;
    script.async = false;
    script.onerror = e =>
      console.error("assistant: Failed to load Preact UI bundle", e);
    document.head.appendChild(script);

    // Create Root Element if it doesn't exist
    // The Preact app mounts to 'assistant-preact-root'
    if (!document.getElementById("assistant-preact-root")) {
      const root = document.createElement("div");
      root.id = "assistant-preact-root";
      document.body.appendChild(root);
    }
  } catch (e) {
    console.error("assistant: dynamic loader failed", e);
  }
})();

// --- Mixpanel Tracking ---
let __oasisAnonId = null;
function getDistinctId() {
  try {
    const key = "oasis_anon_distinct_id";
    const existing = sessionStorage.getItem(key);
    if (existing) {
      return existing;
    }
    const v =
      crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
    sessionStorage.setItem(key, v);
    return v;
  } catch (e) {
    if (!__oasisAnonId) {
      __oasisAnonId =
        crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Math.random());
    }
    return __oasisAnonId;
  }
}
function mpTrack(event, props = {}) {
  const distinct =
    window.oasisAuthState?.user?.id ||
    window.oasisAuthState?.user?.email ||
    getDistinctId();
  const body = [
    {
      event,
      properties: {
        token: MIXPANEL_TOKEN,
        distinct_id: distinct,
        authenticated: !!window.oasisAuthState?.isAuthenticated,
        user_email: window.oasisAuthState?.user?.email || null,
        user_id: window.oasisAuthState?.user?.id || null,
        ...props,
      },
    },
  ];
  try {
    const data = btoa(JSON.stringify(body));
    fetch("https://api.mixpanel.com/track?ip=1", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(data),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {
    void e;
  }
}
function mpIdentify(user) {
  const distinct = user?.id || user?.email || getDistinctId();
  const body = [
    {
      $token: MIXPANEL_TOKEN,
      $distinct_id: distinct,
      $set: {
        $email: user?.email || undefined,
      },
    },
  ];
  try {
    const data = btoa(JSON.stringify(body));
    fetch("https://api.mixpanel.com/engage#profile-set", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(data),
      keepalive: true,
    }).catch(() => {});
  } catch (e) {
    void e;
  }
}
window.mpTrack = mpTrack;
window.mpIdentify = mpIdentify;

mpTrack("assistant_ui_loaded_preact");

// --- Auth State Management & Secure Storage ---
// SupabaseAuth should be available from assistant.bundle.js

const LOGIN_HOSTNAME = "https://kahana.co";
const LOGIN_REALM = "Oasis Assistant";
const LOGIN_USERNAME = "oasis_assistant_session";
const OAUTH_HANDOFF_COOKIE_NAME = "oasis_assistant_handoff";
const ASSISTANT_OAUTH_TARGET = "assistant";

let assistantOAuthHandoffInFlight = false;

function readAssistantOAuthHandoffEntry() {
  if (!Services?.cookies) {
    return null;
  }
  try {
    let latest = null;
    for (const cookie of Services.cookies.cookies) {
      if (cookie.name !== OAUTH_HANDOFF_COOKIE_NAME) {
        continue;
      }
      try {
        const payload = JSON.parse(decodeURIComponent(cookie.value));
        const timestamp = payload?.timestamp || 0;
        const handoffTarget = payload.handoff_target || payload.target;
        if (handoffTarget && handoffTarget !== ASSISTANT_OAUTH_TARGET) {
          continue;
        }
        if (!latest || timestamp > (latest.payload?.timestamp || 0)) {
          latest = { cookie, payload };
        }
      } catch (e) {
        console.error("Assistant: Failed to parse OAuth handoff cookie:", e);
      }
    }
    return latest;
  } catch (e) {
    console.error("Assistant: Failed to read OAuth handoff cookies:", e);
  }
  return null;
}

function clearAssistantHandoffCookie(cookie) {
  if (!Services?.cookies || !cookie) {
    return;
  }
  try {
    Services.cookies.remove(
      cookie.host,
      cookie.name,
      cookie.path,
      cookie.originAttributes || {}
    );
  } catch (e) {
    console.error("Assistant: Failed to clear OAuth handoff cookie:", e);
  }
}

function dispatchAssistantAuthError(message) {
  try {
    window.dispatchEvent(
      new CustomEvent("oasis-auth-error", {
        detail: { description: message, error: message },
      })
    );
  } catch (e) {}
}

function openOasisWelcomeIfNeededAfterAssistantAuth() {
  try {
    const { OasisWelcomeManager, navigatePostAuthLanding } =
      ChromeUtils.importESModule(
        "resource:///modules/oasiswelcome/OasisWelcomeManager.sys.mjs"
      );
    const win = Services.wm.getMostRecentWindow("navigator:browser");
    if (!win) {
      return;
    }
    if (OasisWelcomeManager?.shouldShowAboutWelcomePage?.()) {
      OasisWelcomeManager.openWelcomePage(win);
      return;
    }
    if (typeof navigatePostAuthLanding === "function") {
      navigatePostAuthLanding(win);
    }
  } catch (e) {
    console.warn("Assistant: could not navigate after sign-in:", e);
  }
}

async function tryConsumeAssistantOAuthHandoffCookie() {
  if (assistantOAuthHandoffInFlight) {
    return;
  }
  if (window.oasisAuthState?.isAuthenticated) {
    return;
  }
  if (!window.supabaseAuth?.handleOAuthCallbackData) {
    return;
  }
  const entry = readAssistantOAuthHandoffEntry();
  if (!entry) {
    return;
  }
  assistantOAuthHandoffInFlight = true;
  try {
    const { cookie, payload } = entry;
    if (payload.error) {
      clearAssistantHandoffCookie(cookie);
      dispatchAssistantAuthError(
        payload.description || payload.error || "OAuth sign-in failed"
      );
      return;
    }
    const result = await window.supabaseAuth.handleOAuthCallbackData(payload);
    clearAssistantHandoffCookie(cookie);
    if (!result?.success) {
      dispatchAssistantAuthError(
        result?.error || "Failed to complete OAuth sign-in"
      );
    } else {
      openOasisWelcomeIfNeededAfterAssistantAuth();
    }
  } catch (e) {
    console.error("Assistant OAuth handoff failed:", e);
    clearAssistantHandoffCookie(entry.cookie);
    dispatchAssistantAuthError(
      e instanceof Error ? e.message : "OAuth handoff failed"
    );
  } finally {
    assistantOAuthHandoffInFlight = false;
  }
}

function startAssistantOAuthHandoffPolling() {
  window.setInterval(() => {
    void tryConsumeAssistantOAuthHandoffCookie();
  }, 1500);
}

// Secure Storage Functions (Privileged)
async function securelySaveSession(session) {
  if (!session || !session.access_token) {
    return;
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
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: session.user,
      }),
      "",
      ""
    );
    await Services.logins.addLoginAsync(loginInfo);
  } catch (e) {
    console.error("Failed to save session securely:", e);
  }
}

async function securelyLoadSession() {
  try {
    const logins = Services.logins.findLogins(
      LOGIN_HOSTNAME,
      null,
      LOGIN_REALM
    );
    const login = logins.find(l => l.username === LOGIN_USERNAME);

    if (login) {
      const sessionData = JSON.parse(login.password);

      if (window.supabaseAuth && window.supabaseAuth.supabase) {
        const { data, error } =
          await window.supabaseAuth.supabase.auth.setSession({
            access_token: sessionData.access_token,
            refresh_token: sessionData.refresh_token,
          });

        if (!error && data.session) {
          return data.session;
        }
        void error;
        securelyClearSession();
      }
    }
  } catch (e) {
    console.error("Failed to load secure session:", e);
  }
  return null;
}

function securelyClearSession() {
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
  } catch (e) {
    console.error("Failed to clear secure session:", e);
  }
}

// Initial Auth Check
async function checkCurrentAuthStatus() {
  const restoredSession = await securelyLoadSession();

  if (restoredSession) {
    updateGlobalAuthState(true, restoredSession.user);

    // Verify with Supabase and ensure internal state matches
    if (window.supabaseAuth && window.supabaseAuth.supabase) {
      try {
        const {
          data: { user },
          error,
        } = await window.supabaseAuth.supabase.auth.getUser();
        if (error || !user) {
          void error;
          securelyClearSession();
          updateGlobalAuthState(false);
        } else {
          // Update session in storage if it changed (e.g. refreshed)
          const {
            data: { session },
          } = await window.supabaseAuth.supabase.auth.getSession();
          if (session) {
            securelySaveSession(session);
          }
        }
      } catch (e) {
        console.error("Oasis: Error verifying restored session:", e);
      }
    }
    return;
  }

  if (window.supabaseAuth && window.supabaseAuth.supabase) {
    try {
      const {
        data: { user },
        error,
      } = await window.supabaseAuth.supabase.auth.getUser();
      if (user && !error) {
        updateGlobalAuthState(true, user);
      } else {
        updateGlobalAuthState(false);
      }
    } catch (e) {
      console.error("Oasis: Error checking Supabase status:", e);
      updateGlobalAuthState(false);
    }
  } else {
    updateGlobalAuthState(false);
  }
}

function updateGlobalAuthState(authenticated, user = null) {
  window.oasisAuthState = { isAuthenticated: authenticated, user };
  // Notify UI (Preact) of the change
  try {
    window.dispatchEvent(
      new CustomEvent("oasis-auth-update", { detail: window.oasisAuthState })
    );
  } catch (e) {}
}

// Subscribe to Supabase auth state changes
if (window.supabaseAuth) {
  window.supabaseAuth.onAuthStateChange(authState => {
    if (authState.isAuthenticated && authState.session) {
      securelySaveSession(authState.session);
      updateGlobalAuthState(true, authState.user);
    } else if (!authState.isAuthenticated) {
      // Only clear if we were previously logged in to avoid clearing during initial restoration race
      if (window.oasisAuthState?.isAuthenticated) {
        securelyClearSession();
        updateGlobalAuthState(false);
      }
    }
  });
}

// Start Auth Check immediately
checkCurrentAuthStatus();
startAssistantOAuthHandoffPolling();
