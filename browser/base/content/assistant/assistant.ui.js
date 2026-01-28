// Privileged shim - runs in chrome (privileged) context
// This file acts as the bridge between the privileged Firefox environment and the content-based Preact UI.

(function(){
  const Services = window.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

  window.assistantBridge = {
    openTab(url) {
      try {
        console.log('assistantBridge.openTab', url);
        // Try to open a tab in the most recent browser window (best-effort)
        try {
          const win = Services.wm.getMostRecentWindow('navigator:browser');
          if (win && win.gBrowser) {
            const fixed = url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;
            win.gBrowser.selectedTab = win.gBrowser.addTab(fixed);
            return true;
          }
        } catch (e) {
          console.warn('assistantBridge: failed to open tab via gBrowser', e);
        }

        // Fallback: try window.open
        window.open(url);
        return true;
      } catch (e) {
        console.error('assistantBridge.openTab error', e);
        return false;
      }
    },
    async getAssistantHistory() {
      try {
        const HIST_USERNAME = "oasis_assistant_history";
        const logins = Services.logins.findLogins(LOGIN_HOSTNAME, null, LOGIN_REALM);
        const entry = logins.find(l => l.username === HIST_USERNAME);
        if (entry) {
          try {
            return JSON.parse(entry.password);
          } catch (e) {
            console.warn('assistantBridge.getAssistantHistory: failed to parse history', e);
          }
        }
      } catch (e) {
        console.error('assistantBridge.getAssistantHistory error', e);
      }
      return null;
    },
    async setAssistantHistory(history) {
      try {
        const HIST_USERNAME = "oasis_assistant_history";
        // Remove any existing history entry
        try {
          const logins = Services.logins.findLogins(LOGIN_HOSTNAME, null, LOGIN_REALM);
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
        try { window.dispatchEvent(new CustomEvent('oasis-history-update')); } catch (e) {}
        console.log('assistantBridge: assistant history saved');
      } catch (e) {
        console.error('assistantBridge.setAssistantHistory error', e);
      }
    },
    getAuthState() {
      return window.oasisAuthState || { isAuthenticated: false, user: null };
    }
  };

  console.log('assistantBridge loaded');
})();

// Expose global helpers for existing UI code that expects `window.getAssistantHistory` / `window.setAssistantHistory`
try {
  window.getAssistantHistory = async function() {
    try {
      if (window.assistantBridge && typeof window.assistantBridge.getAssistantHistory === 'function') {
        return await window.assistantBridge.getAssistantHistory();
      }
    } catch (e) {
      console.error('window.getAssistantHistory error', e);
    }
    return null;
  };

  window.setAssistantHistory = async function(history) {
    try {
      if (window.assistantBridge && typeof window.assistantBridge.setAssistantHistory === 'function') {
        return await window.assistantBridge.setAssistantHistory(history);
      }
    } catch (e) {
      console.error('window.setAssistantHistory error', e);
    }
  };
} catch (e) {
  console.error('Failed to expose assistant history globals', e);
}

const MIXPANEL_TOKEN = "4a23d4890cf107ac290b2d5e878e2561";

// --- Dynamic Loader for Preact Bundle ---
(function() {
  try {
    function getBase() {
      const s = document.currentScript;
      if (s && s.src) return s.src.replace(/\/[^/]*$/, '/') ;
      if (location && location.href) return location.href.replace(/\/[^/]*$/, '/');
      return '';
    }

    const base = getBase();
    const bundleSrc = base + 'dist/assistant.ui.bundle.js';
    const cssSrc = base + 'dist/assistant.ui.bundle.css';

    // Load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssSrc;
    document.head.appendChild(link);

    // Load Bundle
    const script = document.createElement('script');
    script.src = bundleSrc;
    script.defer = true;
    script.onload = () => console.log('assistant: Preact UI bundle loaded', bundleSrc);
    script.onerror = (e) => console.error('assistant: Failed to load Preact UI bundle', e);
    document.head.appendChild(script);

    // Create Root Element if it doesn't exist
    // The Preact app mounts to 'assistant-preact-root'
    if (!document.getElementById('assistant-preact-root')) {
      const root = document.createElement('div');
      root.id = 'assistant-preact-root';
      document.body.appendChild(root);
    }

  } catch (e) {
    console.error('assistant: dynamic loader failed', e);
  }
})();

// --- Mixpanel Tracking ---
let __oasisAnonId = null;
function getDistinctId() {
  try {
    const key = "oasis_anon_distinct_id";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const v = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random());
    sessionStorage.setItem(key, v);
    return v;
  } catch (e) {
    if (!__oasisAnonId) __oasisAnonId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random());
    return __oasisAnonId;
  }
}
function mpTrack(event, props = {}) {
  const distinct = (window.oasisAuthState?.user?.id || window.oasisAuthState?.user?.email || getDistinctId());
  const body = [{
    event,
    properties: {
      token: MIXPANEL_TOKEN,
      distinct_id: distinct,
      authenticated: !!window.oasisAuthState?.isAuthenticated,
      user_email: window.oasisAuthState?.user?.email || null,
      user_id: window.oasisAuthState?.user?.id || null,
      ...props
    }
  }];
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
  const distinct = (user?.id || user?.email || getDistinctId());
  const body = [{
    $token: MIXPANEL_TOKEN,
    $distinct_id: distinct,
    $set: {
      $email: user?.email || undefined
    }
  }];
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
console.log('SupabaseAuth available:', !!window.supabaseAuth);

const LOGIN_HOSTNAME = "https://kahana.co"; 
const LOGIN_REALM = "Oasis Assistant";
const LOGIN_USERNAME = "oasis_assistant_session";

// Secure Storage Functions (Privileged)
async function securelySaveSession(session) {
    if (!session || !session.access_token) return;
    try {
        const logins = Services.logins.findLogins(LOGIN_HOSTNAME, null, LOGIN_REALM);
        let existingLogin = null;
        for (const login of logins) {
            if (login.username === LOGIN_USERNAME) {
                existingLogin = login;
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
                user: session.user
            }), 
            "", 
            ""
        );
        await Services.logins.addLoginAsync(loginInfo);
        console.log("Session securely saved to Password Manager");
    } catch (e) {
        console.error("Failed to save session securely:", e);
    }
}

async function securelyLoadSession() {
    try {
        const logins = Services.logins.findLogins(LOGIN_HOSTNAME, null, LOGIN_REALM);
        const login = logins.find(l => l.username === LOGIN_USERNAME);

        if (login) {
            const sessionData = JSON.parse(login.password);
            console.log("Found secure session data for user:", sessionData.user?.email);

            if (window.supabaseAuth && window.supabaseAuth.supabase) {
                const { data, error } = await window.supabaseAuth.supabase.auth.setSession({
                    access_token: sessionData.access_token,
                    refresh_token: sessionData.refresh_token
                });

                if (!error && data.session) {
                    console.log("Supabase session restored successfully");
                    return data.session;
                } else {
                    console.warn("Failed to restore Supabase session:", error);
                    securelyClearSession();
                }
            }
        }
    } catch (e) {
        console.error("Failed to load secure session:", e);
    }
    return null;
}

function securelyClearSession() {
    try {
        const logins = Services.logins.findLogins(LOGIN_HOSTNAME, null, LOGIN_REALM);
        for (const login of logins) {
            if (login.username === LOGIN_USERNAME) {
                Services.logins.removeLogin(login);
            }
        }
        console.log("Secure session cleared");
    } catch (e) {
        console.error("Failed to clear secure session:", e);
    }
}

// Initial Auth Check
async function checkCurrentAuthStatus() {
    console.log('Checking current auth status...');
    const restoredSession = await securelyLoadSession();
    if (restoredSession) {
        console.log('Session restored from secure storage', restoredSession.user?.email);
        updateGlobalAuthState(true, restoredSession.user);
        
        // Verify with Supabase
        if (window.supabaseAuth && window.supabaseAuth.supabase) {
            window.supabaseAuth.supabase.auth.getUser().then(({ data: { user }, error }) => {
                if (error || !user) {
                    console.warn('Restored session invalid, clearing:', error);
                    securelyClearSession();
                    updateGlobalAuthState(false);
                } else {
                     // Update session in storage if it changed
                     window.supabaseAuth.supabase.auth.getSession().then(({ data: { session } }) => {
                        if (session) securelySaveSession(session);
                    });
                }
            });
        }
        return;
    }

    if (window.supabaseAuth && window.supabaseAuth.supabase) {
        const { data: { user }, error } = await window.supabaseAuth.supabase.auth.getUser();
        if (user && !error) {
             updateGlobalAuthState(true, user);
        } else {
             updateGlobalAuthState(false);
        }
    }
}

function updateGlobalAuthState(authenticated, user = null) {
    window.oasisAuthState = { isAuthenticated: authenticated, user: user };
    console.log('Global auth state updated:', window.oasisAuthState);
    // Notify UI (Preact) of the change
    try {
        window.dispatchEvent(new CustomEvent('oasis-auth-update', { detail: window.oasisAuthState }));
    } catch(e) { console.warn('Failed to dispatch auth update', e); }
}

// Subscribe to Supabase auth state changes
if (window.supabaseAuth) {
    window.supabaseAuth.onAuthStateChange((authState) => {
        console.log("UI (Shim) received auth state change:", authState.isAuthenticated);
        
        if (authState.isAuthenticated && authState.session) {
            securelySaveSession(authState.session);
            updateGlobalAuthState(true, authState.user);
        } else if (!authState.isAuthenticated) {
            securelyClearSession();
            updateGlobalAuthState(false);
        }
    });
}

// Start Auth Check
setTimeout(checkCurrentAuthStatus, 50);