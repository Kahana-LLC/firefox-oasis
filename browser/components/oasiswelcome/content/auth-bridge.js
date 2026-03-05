/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Authentication Bridge for Oasis Welcome
// This bridges the onboarding authentication with the AI Assistant's auth system

(function() {
  // Check for Services, Components, and Ci availability (should be available in privileged about: pages)
  if (!window.Services) {
    console.error('Oasis Welcome: Services not available. This page may not be running in a privileged context.');
    window.oasisWelcomeAuth = null;
    return;
  }

  if (!window.Components) {
    console.error('Oasis Welcome: Components not available. This page may not be running in a privileged context.');
    window.oasisWelcomeAuth = null;
    return;
  }

  if (!window.Ci) {
    console.error('Oasis Welcome: Ci (Components.interfaces) not available. This page may not be running in a privileged context.');
    window.oasisWelcomeAuth = null;
    return;
  }

  const Services = window.Services;
  const LOGIN_HOSTNAME = "https://kahana.co";
  const LOGIN_REALM = "Oasis Assistant";
  const LOGIN_USERNAME = "oasis_assistant_session";

  // Secure Storage Functions (Same as AI Assistant)
  async function securelySaveSession(session) {
    if (!session || !session.access_token) return;
    try {
      const logins = Services.logins.findLogins(LOGIN_HOSTNAME, null, LOGIN_REALM);
      for (const login of logins) {
        if (login.username === LOGIN_USERNAME) {
          Services.logins.removeLogin(login);
        }
      }

      const loginInfo = new window.Components.Constructor(
        "@mozilla.org/login-manager/loginInfo;1",
        window.Ci.nsILoginInfo,
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
    } catch (e) {
      console.error("Oasis Welcome: Failed to save session securely:", e);
    }
  }

  function updateGlobalAuthState(authenticated, user = null) {
    window.oasisAuthState = { isAuthenticated: authenticated, user: user };

    // Dispatch event for other windows to pick up
    try {
      window.dispatchEvent(new CustomEvent('oasis-auth-update', {
        detail: window.oasisAuthState
      }));
    } catch(e) {
      void e;
    }
  }

  // Initialize auth bridge immediately (structure only)
  // This ensures window.oasisWelcomeAuth is defined even if Supabase isn't ready yet
  window.oasisWelcomeAuth = {
    async signUp(email, password, name) {
      try {
        if (!window.supabaseAuth) {
          console.error('Oasis Welcome: Supabase Auth not available');
          throw new Error('Authentication service not available. Please wait and try again.');
        }

        const result = await window.supabaseAuth.signUp(email, password, name);

        if (result.error) {
          console.error('Oasis Welcome: Sign up error:', result.error);
          throw result.error;
        }

        if (result.user) {
          // Get the session
          const session = await window.supabaseAuth.getSession();

          if (session) {
            await securelySaveSession(session);
            updateGlobalAuthState(true, result.user);
          }
          return { success: true, user: result.user };
        }

        return { success: false, error: 'No user returned from sign up' };
      } catch (error) {
        console.error('Oasis Welcome: Sign up error:', error);
        return { success: false, error: error.message || 'Sign up failed' };
      }
    },

    async signIn(email, password) {
      try {
        if (!window.supabaseAuth) {
          console.error('Oasis Welcome: Supabase Auth not available');
          throw new Error('Authentication service not available. Please wait and try again.');
        }

        const result = await window.supabaseAuth.signInWithEmail(email, password);

        if (result.error) {
          console.error('Oasis Welcome: Sign in error:', result.error);
          throw result.error;
        }

        if (result.user) {
          // Get the session
          const session = await window.supabaseAuth.getSession();

          if (session) {
            await securelySaveSession(session);
            updateGlobalAuthState(true, result.user);
          }
          return { success: true, user: result.user };
        }

        return { success: false, error: 'No user returned from sign in' };
      } catch (error) {
        console.error('Oasis Welcome: Sign in error:', error);
        return { success: false, error: error.message || 'Sign in failed' };
      }
    },

    getAuthState() {
      return window.oasisAuthState || { isAuthenticated: false, user: null };
    }
  };

  if (!window.supabaseAuth && window.SupabaseAuth) {
    window.supabaseAuth = window.SupabaseAuth;
  }

})();
