// Privileged shim - runs in chrome (privileged) context
// This file acts as the bridge between the privileged Firefox environment and the content-based Preact UI.

(function () {
  const Services =
    window.Services ||
    ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

  window.assistantBridge = {
    openTab(url) {
      try {
        console.log("assistantBridge.openTab", url);
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
          console.warn("assistantBridge: failed to open tab via gBrowser", e);
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
            console.warn(
              "assistantBridge.getAssistantHistory: failed to parse history",
              e
            );
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
        } catch (e) {}
        console.log("assistantBridge: assistant history saved");
      } catch (e) {
        console.error("assistantBridge.setAssistantHistory error", e);
      }
    },
    getAuthState() {
      return window.oasisAuthState || { isAuthenticated: false, user: null };
    },
    async ensureSessionRestored() {
      // Force session restoration if not already done
      if (!window.oasisAuthState || !window.oasisAuthState.isAuthenticated) {
        console.log("assistantBridge: Forcing session restoration...");
        await checkCurrentAuthStatus();
        // Wait a bit for state to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return window.oasisAuthState || { isAuthenticated: false, user: null };
    },
  };

  console.log("assistantBridge loaded");
})();

// Expose global helpers for existing UI code that expects `window.getAssistantHistory` / `window.setAssistantHistory`
try {
  window.getAssistantHistory = async function () {
    try {
      if (
        window.assistantBridge &&
        typeof window.assistantBridge.getAssistantHistory === "function"
      ) {
        return await window.assistantBridge.getAssistantHistory();
      }
    } catch (e) {
      console.error("window.getAssistantHistory error", e);
    }
    return null;
  };

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
  };
} catch (e) {
  console.error("Failed to expose assistant history globals", e);
}

const MIXPANEL_TOKEN = "4a23d4890cf107ac290b2d5e878e2561";

// --- Dynamic Loader for Preact Bundle ---
(function () {
  try {
    function getBase() {
      const s = document.currentScript;
      if (s && s.src) return s.src.replace(/\/[^/]*$/, "/");
      if (location && location.href)
        return location.href.replace(/\/[^/]*$/, "/");
      return "";
    }

    const base = getBase();
    const bundleSrc = base + "dist/assistant.ui.bundle.js";
    const cssSrc = base + "dist/assistant.ui.bundle.css";

    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssSrc;
    document.head.appendChild(link);

    // Load Bundle
    const script = document.createElement("script");
    script.src = bundleSrc;
    script.defer = true;
    script.onload = () => {
      console.log("assistant: Preact UI bundle loaded", bundleSrc);
      installSupabaseAuthGuards();
    };
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
    if (existing) return existing;
    const v =
      crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
    sessionStorage.setItem(key, v);
    return v;
  } catch (e) {
    if (!__oasisAnonId)
      __oasisAnonId =
        crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Math.random());
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
  } catch (e) {}
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
  } catch (e) {}
}
window.mpTrack = mpTrack;
window.mpIdentify = mpIdentify;

mpTrack("assistant_ui_loaded_preact");

// --- Voice Input Service ---
// Import voice input service - it will be bundled in assistant.bundle.js
let voiceInputService = null;
try {
  voiceInputService = window.voiceInputService;
} catch (e) {
  console.warn("Voice input service not available:", e);
}

// --- Auth State Management & Secure Storage ---
// SupabaseAuth should be available from assistant.bundle.js
console.log("SupabaseAuth available:", !!window.supabaseAuth);
installSupabaseAuthGuards();

const LOGIN_HOSTNAME = "https://kahana.co";
const LOGIN_REALM = "Oasis Assistant";
const LOGIN_USERNAME = "oasis_assistant_session";
const OAUTH_CALLBACK_KEY = "oasis_auth_callback";
const OAUTH_ERROR_KEY = "oasis_auth_error";
const OAUTH_HANDOFF_COOKIE_NAME = "oasis_assistant_handoff";
let oauthHandoffInFlight = false;
let storageUnavailable = false;
let authStatusCheckInFlight = false;
let lastAuthStateSignature = "";
let lastSavedSessionPayload = "";
let sessionSaveInFlight = null;
let loggedMissingSecureSession = false;

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

function buildSessionPayload(session) {
  return JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: session.user,
  });
}

function getStoredSessionLogin() {
  const logins = Services.logins.findLogins(LOGIN_HOSTNAME, null, LOGIN_REALM);
  return logins.find(login => login.username === LOGIN_USERNAME) || null;
}

async function securelySaveSession(session) {
  if (!session?.access_token || !session?.refresh_token) {
    return;
  }

  const payload = buildSessionPayload(session);
  if (sessionSaveInFlight) {
    await sessionSaveInFlight.promise;
  }
  if (payload === lastSavedSessionPayload) {
    return;
  }

  const pendingSave = { payload, promise: null };
  pendingSave.promise = (async () => {
    try {
      const logins = Services.logins.findLogins(
        LOGIN_HOSTNAME,
        null,
        LOGIN_REALM
      );
      const matchingLogins = logins.filter(
        login => login.username === LOGIN_USERNAME
      );

      if (
        matchingLogins.length === 1 &&
        matchingLogins[0].password === payload
      ) {
        lastSavedSessionPayload = payload;
        return;
      }

      for (const login of matchingLogins) {
        Services.logins.removeLogin(login);
      }

      const loginInfo = new Components.Constructor(
        "@mozilla.org/login-manager/loginInfo;1",
        Ci.nsILoginInfo,
        "init"
      )(LOGIN_HOSTNAME, null, LOGIN_REALM, LOGIN_USERNAME, payload, "", "");
      await Services.logins.addLoginAsync(loginInfo);
      lastSavedSessionPayload = payload;
      console.log("Session securely saved to Password Manager");
    } catch (e) {
      const existingLogin = getStoredSessionLogin();
      if (existingLogin?.password === payload) {
        lastSavedSessionPayload = payload;
        return;
      }
      console.error("Failed to save session securely:", e);
    } finally {
      if (sessionSaveInFlight === pendingSave) {
        sessionSaveInFlight = null;
      }
    }
  })();

  sessionSaveInFlight = pendingSave;
  await pendingSave.promise;
}

async function securelyLoadSession() {
  try {
    const login = getStoredSessionLogin();

    if (!login) {
      lastSavedSessionPayload = "";
      if (!loggedMissingSecureSession) {
        console.log("No secure session login entry found");
        loggedMissingSecureSession = true;
      }
      return null;
    }

    const sessionData = JSON.parse(login.password);
    lastSavedSessionPayload = login.password;
    loggedMissingSecureSession = false;
    console.log(
      "Found secure session data for user:",
      sessionData.user?.email,
      {
        hasAccessToken: !!sessionData.access_token,
        hasRefreshToken: !!sessionData.refresh_token,
      }
    );

    if (window.supabaseAuth && window.supabaseAuth.supabase) {
      const { data, error } =
        await window.supabaseAuth.supabase.auth.setSession({
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
        });

      if (!error && data.session) {
        console.log("Supabase session restored successfully");
        // Give Supabase a moment to update its internal state
        await new Promise(resolve => setTimeout(resolve, 100));
        return data.session;
      } else {
        console.warn("Failed to restore Supabase session:", error);
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
    const login = getStoredSessionLogin();
    if (login) {
      Services.logins.removeLogin(login);
    }
    lastSavedSessionPayload = "";
    loggedMissingSecureSession = false;
    console.log("Secure session cleared");
  } catch (e) {
    console.error("Failed to clear secure session:", e);
  }
}

function installSupabaseAuthGuards() {
  const auth = window.supabaseAuth;
  if (!auth || auth.__oasisSessionGuardsInstalled) {
    return;
  }

  auth.__oasisSessionGuardsInstalled = true;
  auth.__oasisLastTrackedSessionUserId = null;
  auth.__oasisTrackedSessionInFlight = null;

  if (typeof auth.createSession === "function") {
    const originalCreateSession = auth.createSession.bind(auth);
    auth.createSession = async userId => {
      if (!userId) {
        return;
      }
      if (
        auth.currentSession?.user_id === userId &&
        !auth.currentSession?.ended_at
      ) {
        auth.__oasisLastTrackedSessionUserId = userId;
        return;
      }
      if (auth.__oasisLastTrackedSessionUserId === userId) {
        return;
      }
      if (auth.__oasisTrackedSessionInFlight?.userId === userId) {
        await auth.__oasisTrackedSessionInFlight.promise;
        return;
      }

      const pendingTrack = { userId, promise: null };
      pendingTrack.promise = (async () => {
        try {
          await originalCreateSession(userId);
          auth.__oasisLastTrackedSessionUserId = userId;
        } finally {
          if (auth.__oasisTrackedSessionInFlight === pendingTrack) {
            auth.__oasisTrackedSessionInFlight = null;
          }
        }
      })();

      auth.__oasisTrackedSessionInFlight = pendingTrack;
      await pendingTrack.promise;
    };
  }

  if (typeof auth.handleAuthStateChange === "function") {
    const originalHandleAuthStateChange = auth.handleAuthStateChange.bind(auth);
    auth.handleAuthStateChange = async (event, session) => {
      if (event === "SIGNED_OUT") {
        auth.__oasisLastTrackedSessionUserId = null;
      }
      return originalHandleAuthStateChange(event, session);
    };
  }
}

function readStoredOAuthValue(key) {
  if (storageUnavailable) {
    return null;
  }
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    storageUnavailable = true;
    console.warn("Oasis: localStorage unavailable for OAuth handoff:", e);
  }
  return null;
}

function clearStoredOAuthValue(key) {
  if (storageUnavailable) {
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch (e) {
    storageUnavailable = true;
    console.warn("Oasis: localStorage unavailable for OAuth cleanup:", e);
  }
}

function isStorageUnavailableError(error) {
  return (
    error?.name === "NS_ERROR_NOT_AVAILABLE" ||
    String(error).includes("NS_ERROR_NOT_AVAILABLE")
  );
}

function readCookieOAuthValue(target) {
  try {
    let latest = null;
    for (const cookie of Services.cookies.cookies) {
      if (cookie.name !== OAUTH_HANDOFF_COOKIE_NAME) {
        continue;
      }
      try {
        const payload = JSON.parse(decodeURIComponent(cookie.value));
        if (payload?.target && payload.target !== target) {
          continue;
        }
        if (
          !latest ||
          (payload?.timestamp || 0) > (latest.payload?.timestamp || 0)
        ) {
          latest = { cookie, payload };
        }
      } catch (e) {
        console.warn("Oasis: Failed to parse OAuth handoff cookie:", e);
      }
    }
    return latest;
  } catch (e) {
    console.error("Oasis: Failed to read OAuth handoff cookies:", e);
  }
  return null;
}

function hasUsableOAuthData(payload) {
  return !!(payload?.code || (payload?.access_token && payload?.refresh_token));
}

function clearCookieOAuthValue(cookie) {
  if (!cookie) {
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
    console.error("Oasis: Failed to clear OAuth handoff cookie:", e);
  }
}

function persistOAuthError(errorData) {
  if (storageUnavailable) {
    return;
  }
  try {
    localStorage.setItem(OAUTH_ERROR_KEY, JSON.stringify(errorData));
    window.dispatchEvent(
      new CustomEvent("oasis-auth-error", { detail: errorData })
    );
  } catch (e) {
    if (isStorageUnavailableError(e)) {
      storageUnavailable = true;
      console.warn("Oasis: localStorage unavailable for OAuth errors:", e);
      return;
    }
    console.error("Oasis: Failed to persist OAuth error:", e);
  }
}

async function consumeCookieOAuthHandoff() {
  if (oauthHandoffInFlight || !window.supabaseAuth?.handleOAuthCallbackData) {
    return false;
  }

  const handoff = readCookieOAuthValue("assistant");
  if (!handoff?.payload) {
    return false;
  }

  const { cookie, payload } = handoff;
  const flowId = getOAuthFlowId(payload);
  if (payload.error) {
    logOAuthFlow(flowId, "Received error handoff payload from cookie", payload);
    persistOAuthError(payload);
    clearCookieOAuthValue(cookie);
    return false;
  }

  if (!hasUsableOAuthData(payload)) {
    logOAuthFlow(
      flowId,
      "Ignoring metadata-only cookie handoff payload",
      payload
    );
    clearCookieOAuthValue(cookie);
    return false;
  }

  oauthHandoffInFlight = true;
  try {
    logOAuthFlow(flowId, "Consuming cookie handoff payload", payload);
    const result = await window.supabaseAuth.handleOAuthCallbackData(payload);
    if (!result?.success) {
      console.error(
        `[Oasis OAuth][${flowId}] Cookie OAuth handoff failed:`,
        result?.error
      );
      clearCookieOAuthValue(cookie);
      persistOAuthError({
        error: "callback_error",
        description: result?.error || "Failed to complete OAuth sign-in.",
        target: "assistant",
        flowId,
        timestamp: Date.now(),
      });
      return false;
    }
    clearCookieOAuthValue(cookie);
    clearStoredOAuthValue(OAUTH_ERROR_KEY);
    const user = await window.supabaseAuth.getCurrentUser();
    if (user) {
      logOAuthFlow(flowId, "Cookie handoff completed successfully", {
        userId: user.id,
        email: user.email,
      });
      updateGlobalAuthState(true, user);
      const session = await window.supabaseAuth.getSession();
      if (session) {
        await securelySaveSession(session);
      }
    }
    return true;
  } catch (e) {
    console.error("Oasis: Error consuming cookie OAuth handoff:", e);
    clearCookieOAuthValue(cookie);
  } finally {
    oauthHandoffInFlight = false;
  }
  return false;
}

async function consumeStoredOAuthHandoff() {
  if (oauthHandoffInFlight || !window.supabaseAuth?.handleOAuthCallbackData) {
    return false;
  }

  const authData = readStoredOAuthValue(OAUTH_CALLBACK_KEY);
  if (!authData || (authData.target && authData.target !== "assistant")) {
    return false;
  }

  oauthHandoffInFlight = true;
  try {
    const flowId = getOAuthFlowId(authData);
    logOAuthFlow(flowId, "Consuming stored OAuth handoff payload", authData);
    const result = await window.supabaseAuth.handleOAuthCallbackData(authData);
    if (!result?.success) {
      console.error(
        `[Oasis OAuth][${flowId}] Stored OAuth handoff failed:`,
        result?.error
      );
      return false;
    }
    clearStoredOAuthValue(OAUTH_CALLBACK_KEY);
    clearStoredOAuthValue(OAUTH_ERROR_KEY);
    const user = await window.supabaseAuth.getCurrentUser();
    if (user) {
      logOAuthFlow(flowId, "Stored OAuth handoff completed successfully", {
        userId: user.id,
        email: user.email,
      });
      updateGlobalAuthState(true, user);
      const session = await window.supabaseAuth.getSession();
      if (session) {
        await securelySaveSession(session);
      }
    }
    return true;
  } catch (e) {
    console.error("Oasis: Error consuming stored OAuth handoff:", e);
  } finally {
    oauthHandoffInFlight = false;
  }
  return false;
}

async function completeOAuthFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("oauth_code") || params.get("code");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const flowId = params.get("flow_id") || params.get("state") || "unknown";
    if (
      (!code && !(accessToken && refreshToken)) ||
      !window.supabaseAuth?.handleOAuthCallbackData
    ) {
      return false;
    }
    const authData = code
      ? { code }
      : {
          access_token: accessToken,
          refresh_token: refreshToken,
        };
    const result = await window.supabaseAuth.handleOAuthCallbackData(authData);
    if (!result?.success) {
      console.error(
        `[Oasis OAuth][${flowId}] Failed to complete OAuth from URL:`,
        result?.error
      );
      return false;
    }
    const user = await window.supabaseAuth.getCurrentUser();
    if (user) {
      logOAuthFlow(flowId, "Completed OAuth from URL", {
        userId: user.id,
        email: user.email,
      });
      updateGlobalAuthState(true, user);
    }
    try {
      window.history.replaceState(
        {},
        document.title,
        "chrome://browser/content/assistant/assistant.xhtml"
      );
    } catch (e) {}
    return true;
  } catch (e) {
    console.error("Oasis: Error completing OAuth from URL:", e);
  }
  return false;
}

// Initial Auth Check
async function checkCurrentAuthStatus(options = {}) {
  const quiet = !!options.quiet;
  if (authStatusCheckInFlight) {
    return;
  }
  authStatusCheckInFlight = true;
  try {
    if (!quiet) {
      console.log("Oasis: Checking current auth status...");
    }
    const completedFromCookie = await consumeCookieOAuthHandoff();
    if (completedFromCookie) {
      return;
    }
    const completedFromStorage = await consumeStoredOAuthHandoff();
    if (completedFromStorage) {
      return;
    }
    const completedFromUrl = await completeOAuthFromUrl();
    if (completedFromUrl) {
      return;
    }
    const restoredSession = await securelyLoadSession();

    if (restoredSession) {
      console.log(
        "Oasis: Session restored from secure storage",
        restoredSession.user?.email
      );
      updateGlobalAuthState(true, restoredSession.user);

      if (window.supabaseAuth && window.supabaseAuth.supabase) {
        try {
          const {
            data: { user },
            error,
          } = await window.supabaseAuth.supabase.auth.getUser();
          if (error || !user) {
            console.warn(
              "Oasis: Restored session invalid or expired, clearing:",
              error
            );
            securelyClearSession();
            updateGlobalAuthState(false);
          } else {
            console.log("Oasis: Restored session verified for", user.email);
            const {
              data: { session },
            } = await window.supabaseAuth.supabase.auth.getSession();
            updateGlobalAuthState(true, user);
            if (session) securelySaveSession(session);
          }
        } catch (e) {
          console.error("Oasis: Error verifying restored session:", e);
        }
      }
      return;
    }

    if (!quiet) {
      console.log("Oasis: No session found in secure storage");
    }
    if (window.supabaseAuth && window.supabaseAuth.supabase) {
      try {
        const {
          data: { user },
          error,
        } = await window.supabaseAuth.supabase.auth.getUser();
        if (user && !error) {
          console.log("Oasis: Supabase already has a session for", user.email);
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
  } finally {
    authStatusCheckInFlight = false;
  }
}

function updateGlobalAuthState(authenticated, user = null) {
  window.oasisAuthState = { isAuthenticated: authenticated, user: user };
  const signature = JSON.stringify({
    isAuthenticated: authenticated,
    email: user?.email || null,
    id: user?.id || null,
  });
  if (signature !== lastAuthStateSignature) {
    lastAuthStateSignature = signature;
    console.log("Oasis: Global auth state updated:", window.oasisAuthState);
  }
  // Notify UI (Preact) of the change
  try {
    window.dispatchEvent(
      new CustomEvent("oasis-auth-update", { detail: window.oasisAuthState })
    );
  } catch (e) {
    console.warn("Oasis: Failed to dispatch auth update", e);
  }
}

// Subscribe to Supabase auth state changes
if (window.supabaseAuth) {
  window.supabaseAuth.onAuthStateChange(authState => {
    console.log(
      "Oasis: UI (Shim) received auth state change:",
      authState.isAuthenticated
    );

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

window.oasisSetOAuthCallbackBaseUrl = function (url) {
  if (window.supabaseAuth?.setOAuthCallbackBaseUrl) {
    return window.supabaseAuth.setOAuthCallbackBaseUrl(url);
  }
  const normalized =
    typeof url === "string" && /^https?:\/\//i.test(url)
      ? url.replace(/\/+$/, "")
      : "https://kahana.co";
  window.__oasisOAuthCallbackBaseUrl = normalized;
  return normalized;
};

window.oasisGetOAuthCallbackBaseUrl = function () {
  if (window.supabaseAuth?.getOAuthCallbackBaseUrl) {
    return window.supabaseAuth.getOAuthCallbackBaseUrl();
  }
  return window.__oasisOAuthCallbackBaseUrl || "https://kahana.co";
};

window.addEventListener("storage", () => {
  if (!window.oasisAuthState?.isAuthenticated) {
    consumeStoredOAuthHandoff();
  }
});

setInterval(() => {
  if (!window.oasisAuthState?.isAuthenticated) {
    checkCurrentAuthStatus({ quiet: true });
  }
}, 1000);

// Start Auth Check immediately
checkCurrentAuthStatus();
