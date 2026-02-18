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
  console.log('Oasis Welcome: Privileged APIs available (Services, Components, Ci)');
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
      console.log("Oasis Welcome: Session securely saved to Password Manager");
    } catch (e) {
      console.error("Oasis Welcome: Failed to save session securely:", e);
    }
  }

  function updateGlobalAuthState(authenticated, user = null) {
    window.oasisAuthState = { isAuthenticated: authenticated, user: user };
    console.log('Oasis Welcome: Global auth state updated:', window.oasisAuthState);
    
    // Dispatch event for other windows to pick up
    try {
      window.dispatchEvent(new CustomEvent('oasis-auth-update', { 
        detail: window.oasisAuthState 
      }));
    } catch(e) { 
      console.warn('Oasis Welcome: Failed to dispatch auth update', e); 
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

        console.log('Oasis Welcome: Attempting sign up for:', email);
        const result = await window.supabaseAuth.signUp(email, password, name);
        console.log('Oasis Welcome: Sign up result:', result);

        if (result.error) {
          console.error('Oasis Welcome: Sign up error:', result.error);
          throw result.error;
        }

        if (result.user) {
          console.log('Oasis Welcome: User created:', result.user.email);
          
          // Get the session
          const session = await window.supabaseAuth.getSession();
          console.log('Oasis Welcome: Session retrieved:', !!session);
          
          if (session) {
            await securelySaveSession(session);
            updateGlobalAuthState(true, result.user);
            console.log('Oasis Welcome: Auth state updated');
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

        console.log('Oasis Welcome: Attempting sign in for:', email);
        const result = await window.supabaseAuth.signInWithEmail(email, password);
        console.log('Oasis Welcome: Sign in result:', result);

        if (result.error) {
          console.error('Oasis Welcome: Sign in error:', result.error);
          throw result.error;
        }

        if (result.user) {
          console.log('Oasis Welcome: User signed in:', result.user.email);
          
          // Get the session
          const session = await window.supabaseAuth.getSession();
          console.log('Oasis Welcome: Session retrieved:', !!session);
          
          if (session) {
            await securelySaveSession(session);
            updateGlobalAuthState(true, result.user);
            console.log('Oasis Welcome: Auth state updated');
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

  console.log('Oasis Welcome: Auth bridge loaded and ready');
  
  // Debug: Check what's available in window
  setTimeout(() => {
    console.log('Oasis Welcome: Checking window properties...');
    console.log('  - window.supabaseAuth:', typeof window.supabaseAuth);
    console.log('  - window.SupabaseAuth:', typeof window.SupabaseAuth);
    console.log('  - window.assistantBridge:', typeof window.assistantBridge);
    
    // Try to find Supabase in various places
    if (window.supabaseAuth) {
      console.log('Oasis Welcome: Found window.supabaseAuth');
    } else if (window.SupabaseAuth) {
      console.log('Oasis Welcome: Found window.SupabaseAuth, assigning to window.supabaseAuth');
      window.supabaseAuth = window.SupabaseAuth;
    } else {
      console.warn('Oasis Welcome: Supabase Auth not found in window');
      console.log('Oasis Welcome: Available window properties:', Object.keys(window).filter(k => k.toLowerCase().includes('supabase') || k.toLowerCase().includes('auth')));
    }
  }, 1000);
  
  // Keep checking for Supabase Auth
  let checkCount = 0;
  const checkInterval = setInterval(() => {
    checkCount++;
    if (window.supabaseAuth) {
      clearInterval(checkInterval);
      console.log('Oasis Welcome: Supabase Auth is now available at check #' + checkCount);
    } else if (checkCount >= 100) { // Increased to 10 seconds
      clearInterval(checkInterval);
      console.error('Oasis Welcome: Supabase Auth not detected after 10 seconds');
      console.log('Oasis Welcome: This might be a loading issue. Check if assistant.bundle.js is properly loaded.');
    } else if (checkCount % 10 === 0) {
      console.log('Oasis Welcome: Still waiting for Supabase Auth... (attempt ' + checkCount + ')');
    }
  }, 100);

})();

