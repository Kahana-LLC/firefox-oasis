/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Authentication Bridge for Oasis Welcome
// This bridges the onboarding authentication with the AI Assistant's auth system

(function () {
  const Services =
    window.Services ||
    (typeof ChromeUtils !== "undefined"
      ? ChromeUtils.import("resource://gre/modules/Services.jsm").Services
      : null);
  const Components =
    window.Components ||
    (typeof globalThis.Components !== "undefined"
      ? globalThis.Components
      : null);
  const Ci =
    window.Ci || (typeof globalThis.Ci !== "undefined" ? globalThis.Ci : null);
  const LOGIN_HOSTNAME = "https://kahana.io";
  const LOGIN_REALM = "Oasis Assistant";
  const LOGIN_USERNAME = "oasis_assistant_session";
  const OAUTH_CALLBACK_KEY = "oasis_auth_callback";
  const OAUTH_ERROR_KEY = "oasis_auth_error";
  const OasisOAuthHandoff =
    typeof ChromeUtils !== "undefined"
      ? ChromeUtils.importESModule(
          "resource:///modules/OasisOAuthHandoff.sys.mjs"
        )
      : null;
  let bundleLoadPromise = null;
  let loggedStorageUnavailable = false;

  function getOAuthFlowId(payload) {
    return payload?.flow_id || payload?.flowId || payload?.state || "unknown";
  }

  function logOAuthFlow(flowId, message, details) {
    const prefix = flowId ? `[Oasis OAuth][${flowId}]` : "[Oasis OAuth]";
    if (details !== undefined) {
      console.log(`${prefix} ${message}`, details);
      return;
    }
    console.log(`${prefix} ${message}`);
  }

  function isStorageUnavailableError(error) {
    return (
      error?.name === "NS_ERROR_NOT_AVAILABLE" ||
      String(error).includes("NS_ERROR_NOT_AVAILABLE")
    );
  }

  // Secure Storage Functions (Same as AI Assistant)
  async function securelySaveSession(session) {
    if (!session || !session.access_token) return;
    const sessionData = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: session.user,
    };
    if (typeof window.RPMQueryAsync === "function") {
      try {
        const response = await window.RPMQueryAsync(
          "OasisWelcome:PersistSharedSession",
          { sessionData }
        );
        if (response?.success) {
          console.log("Oasis Welcome: Session persisted through parent actor", {
            email: response.email || session.user?.email || null,
            hasAccessToken: !!session.access_token,
            hasRefreshToken: !!session.refresh_token,
          });
          return;
        }
        console.warn(
          "Oasis Welcome: Parent actor failed to persist session, falling back locally",
          response
        );
      } catch (e) {
        console.warn(
          "Oasis Welcome: Parent actor session persistence failed, falling back locally",
          e
        );
      }
    }
    if (!Services || !Components || !Ci) {
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
        JSON.stringify(sessionData),
        "",
        ""
      );
      await Services.logins.addLoginAsync(loginInfo);
      console.log("Oasis Welcome: Session securely saved to Password Manager", {
        email: session.user?.email || null,
        hasAccessToken: !!session.access_token,
        hasRefreshToken: !!session.refresh_token,
      });
    } catch (e) {
      console.error("Oasis Welcome: Failed to save session securely:", e);
    }
  }

  async function securelyLoadSession() {
    if (!Services || !Components || !Ci) {
      return null;
    }
    try {
      const logins = Services.logins.findLogins(
        LOGIN_HOSTNAME,
        null,
        LOGIN_REALM
      );
      const login = logins.find(entry => entry.username === LOGIN_USERNAME);

      if (!login || !window.supabaseAuth?.supabase) {
        return null;
      }

      const sessionData = JSON.parse(login.password);
      const { data, error } =
        await window.supabaseAuth.supabase.auth.setSession({
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
        });

      if (!error && data.session) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          session: data.session,
          storedUser: sessionData.user || null,
        };
      }
    } catch (e) {
      console.error("Oasis Welcome: Failed to load session securely:", e);
    }
    return null;
  }

  async function restoreSessionFromData(sessionData) {
    if (!sessionData || !window.supabaseAuth?.supabase) {
      return null;
    }

    try {
      const { data, error } =
        await window.supabaseAuth.supabase.auth.setSession({
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
        });

      if (!error && data.session) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          session: data.session,
          storedUser: sessionData.user || null,
        };
      }
    } catch (e) {
      console.error(
        "Oasis Welcome: Failed to restore session from parent data:",
        e
      );
    }

    return null;
  }

  async function queryParentOAuthBridgeState(
    target,
    options = { consumeCookie: true }
  ) {
    if (typeof window.RPMQueryAsync !== "function") {
      return null;
    }

    try {
      const state = await window.RPMQueryAsync(
        "OasisWelcome:GetOAuthBridgeState",
        {
          target,
          allowFallbackTarget: true,
          consumeCookie: options.consumeCookie !== false,
        }
      );
      if (state?.cookiePayload || state?.sessionData) {
        logOAuthFlow(null, "Received privileged onboarding auth bridge state", {
          hasCookiePayload: !!state?.cookiePayload,
          hasSessionData: !!state?.sessionData,
          cookieTarget: state?.cookiePayload?.target || null,
          sessionEmail: state?.sessionData?.user?.email || null,
        });
      }
      return state;
    } catch (e) {
      console.error(
        "Oasis Welcome: Failed to query parent auth bridge state:",
        e
      );
    }

    return null;
  }

  function updateGlobalAuthState(authenticated, user = null) {
    window.oasisAuthState = { isAuthenticated: authenticated, user: user };
    console.log(
      "Oasis Welcome: Global auth state updated:",
      window.oasisAuthState
    );

    // Dispatch event for other windows to pick up
    try {
      window.dispatchEvent(
        new CustomEvent("oasis-auth-update", {
          detail: window.oasisAuthState,
        })
      );
    } catch (e) {
      console.warn("Oasis Welcome: Failed to dispatch auth update", e);
    }
  }

  async function finalizeAuthSuccess(user) {
    let session = await window.supabaseAuth.getSession();
    if (!session && window.supabaseAuth?.supabase?.auth?.getSession) {
      try {
        const {
          data: { session: resolvedSession },
        } = await window.supabaseAuth.supabase.auth.getSession();
        session = resolvedSession;
      } catch (e) {
        console.warn(
          "Oasis Welcome: Failed to resolve session from Supabase",
          e
        );
      }
    }
    if (session) {
      await securelySaveSession(session);
    }
    console.log("Oasis Welcome: Finalized auth success", {
      email: user?.email || null,
      hasSession: !!session,
    });
    updateGlobalAuthState(true, user);
    return { success: true, user };
  }

  async function waitForAuthService(timeoutMs = 10000) {
    if (window.supabaseAuth) {
      return window.supabaseAuth;
    }

    if (!bundleLoadPromise) {
      bundleLoadPromise = new Promise(resolve => {
        const existing = document.querySelector(
          'script[src="chrome://browser/content/assistant/assistant.bundle.js"]'
        );
        if (existing) {
          resolve();
          return;
        }

        const script = document.createElement("script");
        script.src = "chrome://browser/content/assistant/assistant.bundle.js";
        script.onload = () => resolve();
        script.onerror = () => resolve();
        document.head.appendChild(script);
      });
    }

    await bundleLoadPromise;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.supabaseAuth) {
        return window.supabaseAuth;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(
      "Authentication service not available. Please wait and try again."
    );
  }

  function readStoredOAuthValue(key) {
    try {
      const value = localStorage.getItem(key);
      if (!value) {
        return null;
      }
      const parsed = JSON.parse(value);
      if (key === OAUTH_CALLBACK_KEY && parsed) {
        console.warn(
          "Oasis Welcome: localStorage OAuth handoff is deprecated; use cookie handoff"
        );
        const check = OasisOAuthHandoff?.validateHandoffPayload(parsed, {
          expectedTarget: "onboarding",
        });
        if (check && !check.ok) {
          console.warn(
            "Oasis Welcome: Ignoring expired localStorage OAuth handoff:",
            check.error
          );
          return null;
        }
      }
      return parsed;
    } catch (e) {
      if (isStorageUnavailableError(e)) {
        if (!loggedStorageUnavailable) {
          loggedStorageUnavailable = true;
          console.warn(
            "Oasis Welcome: localStorage unavailable for OAuth handoff"
          );
        }
        return null;
      }
      console.error("Oasis Welcome: Failed to read stored OAuth value:", e);
    }
    return null;
  }

  function clearStoredOAuthValue(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      if (isStorageUnavailableError(e)) {
        return;
      }
      console.error("Oasis Welcome: Failed to clear stored OAuth value:", e);
    }
  }

  function readCookieOAuthValue(target, allowFallbackTarget = false) {
    if (!Services?.cookies || !OasisOAuthHandoff) {
      return null;
    }

    try {
      const callbackBaseUrl =
        window.supabaseAuth?.getOAuthCallbackBaseUrl?.() || null;
      const expectedFlowId =
        window.supabaseAuth?.getActiveOAuthFlowId?.() || undefined;
      return OasisOAuthHandoff.selectHandoffCookieFromManager(Services.cookies, {
        expectedTarget: target,
        allowFallbackTarget,
        callbackBaseUrl,
        expectedFlowId,
      });
    } catch (e) {
      console.error("Oasis Welcome: Failed to read OAuth cookies:", e);
    }
    return null;
  }

  function clearCookieOAuthValue(cookie) {
    OasisOAuthHandoff?.clearHandoffCookie(Services?.cookies, cookie);
  }

  function extractOAuthUrl(message) {
    if (!message) {
      return null;
    }
    const prefixes = [
      "GOOGLE_OAUTH_URL:",
      "AZURE_OAUTH_URL:",
      "APPLE_OAUTH_URL:",
    ];
    const prefix = prefixes.find(value => message.startsWith(value));
    return prefix ? message.slice(prefix.length) : null;
  }

  function parseOAuthInput(value) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }

    function parseParams(raw) {
      const params = new URLSearchParams(raw.replace(/^[#?]/, ""));
      const code = params.get("code");
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (code) {
        return { code };
      }

      if (accessToken && refreshToken) {
        return {
          access_token: accessToken,
          refresh_token: refreshToken,
        };
      }

      return null;
    }

    if (trimmed.includes("://")) {
      try {
        const url = new URL(trimmed);
        return (
          parseParams(url.search) || parseParams(url.hash) || { code: trimmed }
        );
      } catch (e) {}
    }

    return parseParams(trimmed) || { code: trimmed };
  }

  function openOAuthTab(url) {
    if (!Services) {
      const opened = window.open(url, "_blank");
      return !!opened;
    }
    try {
      const win = Services.wm.getMostRecentWindow("navigator:browser");
      if (win?.openTrustedLinkIn) {
        win.openTrustedLinkIn(url, "tab");
        return true;
      }
      if (win?.openWebLinkIn) {
        win.openWebLinkIn(url, "tab", {});
        return true;
      }
      if (win?.gBrowser?.addTrustedTab) {
        win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(url, {
          triggeringPrincipal:
            Services.scriptSecurityManager.getSystemPrincipal(),
          inBackground: false,
        });
        return true;
      }
      if (win?.gBrowser) {
        win.gBrowser.selectedTab = win.gBrowser.addTab(url);
        return true;
      }
    } catch (e) {
      console.error("Oasis Welcome: Failed to open OAuth tab:", e);
    }
    return false;
  }

  // Initialize auth bridge immediately (structure only)
  // This ensures window.oasisWelcomeAuth is defined even if Supabase isn't ready yet
  window.oasisWelcomeAuth = {
    async setOAuthCallbackBaseUrl(url) {
      if (window.supabaseAuth?.setOAuthCallbackBaseUrl) {
        return window.supabaseAuth.setOAuthCallbackBaseUrl(url);
      }
      return "https://kahana.io";
    },

    async getOAuthCallbackBaseUrl() {
      if (window.supabaseAuth?.getOAuthCallbackBaseUrl) {
        return window.supabaseAuth.getOAuthCallbackBaseUrl();
      }
      return window.__oasisOAuthCallbackBaseUrl || "https://kahana.io";
    },

    async signUp(email, password, name) {
      try {
        const authService = await waitForAuthService();

        console.log("Oasis Welcome: Attempting sign up for:", email);
        const result = await authService.signUp(email, password, name);
        console.log("Oasis Welcome: Sign up result:", result);

        if (result.error) {
          console.error("Oasis Welcome: Sign up error:", result.error);
          throw result.error;
        }

        if (result.user) {
          console.log("Oasis Welcome: User created:", result.user.email);
          return finalizeAuthSuccess(result.user);
        }

        return { success: false, error: "No user returned from sign up" };
      } catch (error) {
        console.error("Oasis Welcome: Sign up error:", error);
        return { success: false, error: error.message || "Sign up failed" };
      }
    },

    async signIn(email, password) {
      try {
        const authService = await waitForAuthService();

        console.log("Oasis Welcome: Attempting sign in for:", email);
        const result = await authService.signInWithEmail(email, password);
        console.log("Oasis Welcome: Sign in result:", result);

        if (result.error) {
          console.error("Oasis Welcome: Sign in error:", result.error);
          throw result.error;
        }

        if (result.user) {
          console.log("Oasis Welcome: User signed in:", result.user.email);
          return finalizeAuthSuccess(result.user);
        }

        return { success: false, error: "No user returned from sign in" };
      } catch (error) {
        console.error("Oasis Welcome: Sign in error:", error);
        return { success: false, error: error.message || "Sign in failed" };
      }
    },

    async startOAuth(provider) {
      try {
        const authService = await waitForAuthService();

        let result;
        if (provider === "google") {
          result = await authService.signInWithGoogle("onboarding");
        } else if (provider === "azure") {
          result = await authService.signInWithAzure("onboarding");
        } else if (provider === "apple") {
          result = await authService.signInWithApple("onboarding");
        } else {
          throw new Error("Unsupported OAuth provider");
        }

        const oauthUrl = extractOAuthUrl(result?.error?.message);
        if (oauthUrl) {
          return { success: true, oauthUrl };
        }

        if (result?.error) {
          throw result.error;
        }

        if (result?.user) {
          return finalizeAuthSuccess(result.user);
        }

        return { success: false, error: "Failed to start OAuth sign-in" };
      } catch (error) {
        console.error("Oasis Welcome: OAuth start error:", error);
        return {
          success: false,
          error: error.message || "OAuth sign-in failed",
        };
      }
    },

    async submitOAuthCode(code) {
      try {
        const authService = await waitForAuthService();

        const authData = parseOAuthInput(code);
        if (!authData) {
          throw new Error(
            "Paste the callback URL or OAuth code from the callback page."
          );
        }

        const flowId = getOAuthFlowId(authData);
        logOAuthFlow(flowId, "Submitting onboarding OAuth payload manually");
        const result = await authService.handleOAuthCallbackData(authData);
        if (!result?.success) {
          throw new Error(result?.error || "Failed to complete OAuth sign-in");
        }

        const user = await authService.getCurrentUser();
        if (!user) {
          throw new Error(
            "OAuth sign-in completed, but no authenticated user was found."
          );
        }

        return finalizeAuthSuccess(user);
      } catch (error) {
        console.error("Oasis Welcome: OAuth completion error:", error);
        return {
          success: false,
          error: error.message || "OAuth sign-in failed",
        };
      }
    },

    async consumeStoredOAuthHandoff() {
      const privilegedState = await queryParentOAuthBridgeState("onboarding", {
        consumeCookie: true,
      });
      const cookieHandoff = privilegedState?.cookiePayload
        ? null
        : readCookieOAuthValue("onboarding", true);
      const handoffPayload =
        cookieHandoff?.payload || privilegedState?.cookiePayload;
      if (handoffPayload) {
        const flowId = getOAuthFlowId(handoffPayload);
        if (handoffPayload.target && handoffPayload.target !== "onboarding") {
          logOAuthFlow(
            flowId,
            "Using fallback handoff payload with non-onboarding target",
            handoffPayload
          );
        }
        if (handoffPayload.error) {
          logOAuthFlow(
            flowId,
            "Received onboarding error handoff payload",
            handoffPayload
          );
          if (cookieHandoff?.cookie) {
            clearCookieOAuthValue(cookieHandoff.cookie);
          }
          return {
            success: false,
            error:
              handoffPayload.description ||
              handoffPayload.error ||
              "Failed to complete OAuth sign-in",
          };
        }

        const authService = await waitForAuthService();
        logOAuthFlow(
          flowId,
          "Consuming onboarding handoff payload",
          handoffPayload
        );
        const cookieResult =
          await authService.handleOAuthCallbackData(handoffPayload);
        if (cookieHandoff?.cookie) {
          clearCookieOAuthValue(cookieHandoff.cookie);
        }
        if (!cookieResult?.success) {
          return {
            success: false,
            error: cookieResult?.error || "Failed to complete OAuth sign-in",
          };
        }

        clearStoredOAuthValue(OAUTH_CALLBACK_KEY);
        clearStoredOAuthValue(OAUTH_ERROR_KEY);
        const cookieSession = await authService.getSession();
        const cookieUser =
          (await authService.getCurrentUser()) || cookieSession?.user;
        if (!cookieUser) {
          return {
            success: false,
            error:
              "OAuth sign-in completed, but no authenticated user was found.",
          };
        }

        logOAuthFlow(flowId, "Onboarding handoff completed successfully", {
          userId: cookieUser.id,
          email: cookieUser.email,
        });
        return finalizeAuthSuccess(cookieUser);
      }

      const authData = readStoredOAuthValue(OAUTH_CALLBACK_KEY);
      if (!authData || authData.target !== "onboarding") {
        return { success: false, ignored: true };
      }

      const authService = await waitForAuthService();
      const flowId = getOAuthFlowId(authData);
      logOAuthFlow(
        flowId,
        "Consuming stored onboarding OAuth payload",
        authData
      );
      const result = await authService.handleOAuthCallbackData(authData);
      if (!result?.success) {
        return {
          success: false,
          error: result?.error || "Failed to complete OAuth sign-in",
        };
      }

      clearStoredOAuthValue(OAUTH_CALLBACK_KEY);
      clearStoredOAuthValue(OAUTH_ERROR_KEY);
      const session = await authService.getSession();
      const user = (await authService.getCurrentUser()) || session?.user;
      if (!user) {
        return {
          success: false,
          error:
            "OAuth sign-in completed, but no authenticated user was found.",
        };
      }

      logOAuthFlow(
        flowId,
        "Stored onboarding OAuth payload completed successfully",
        {
          userId: user.id,
          email: user.email,
        }
      );
      return finalizeAuthSuccess(user);
    },

    async restoreExistingSession() {
      const authService = await waitForAuthService();
      const privilegedState = await queryParentOAuthBridgeState("onboarding", {
        consumeCookie: false,
      });
      if (privilegedState?.cookiePayload) {
        return { success: false, ignored: true, pendingHandoff: true };
      }
      let restoredSession = null;
      if (privilegedState?.sessionData) {
        restoredSession = await restoreSessionFromData(
          privilegedState.sessionData
        );
      }
      if (!restoredSession) {
        restoredSession = await securelyLoadSession();
      }
      const session = restoredSession?.session || null;
      const user =
        (await authService.getCurrentUser()) || restoredSession?.storedUser;
      if (!user) {
        return { success: false, ignored: true };
      }

      if (session) {
        updateGlobalAuthState(true, user);
      }

      logOAuthFlow(null, "Restored onboarding session from shared auth state", {
        restoredFromPasswordManager: !!restoredSession,
        userId: user.id,
        email: user.email,
      });

      return finalizeAuthSuccess(user);
    },

    openOAuthTab(url) {
      return openOAuthTab(url);
    },

    getAuthState() {
      return window.oasisAuthState || { isAuthenticated: false, user: null };
    },
  };

  if (window.SupabaseAuth && !window.supabaseAuth) {
    window.supabaseAuth = window.SupabaseAuth;
  }

  // Keep checking for Supabase Auth
  let checkCount = 0;
  const checkInterval = setInterval(() => {
    checkCount++;
    if (window.supabaseAuth) {
      clearInterval(checkInterval);
      console.log(
        "Oasis Welcome: Supabase Auth is now available at check #" + checkCount
      );
    } else if (checkCount >= 100) {
      // Increased to 10 seconds
      clearInterval(checkInterval);
      console.error(
        "Oasis Welcome: Supabase Auth not detected after 10 seconds"
      );
      console.log(
        "Oasis Welcome: This might be a loading issue. Check if assistant.bundle.js is properly loaded."
      );
    } else if (checkCount % 10 === 0) {
      console.log(
        "Oasis Welcome: Still waiting for Supabase Auth... (attempt " +
          checkCount +
          ")"
      );
    }
  }, 100);
})();
