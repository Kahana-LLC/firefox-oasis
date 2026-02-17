/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let currentPage = 1;
const userData = {
  name: "",
  importSettings: {
    history: false,
    bookmarks: true,
    extensions: true,
    cookies: false
  }
};

function showPage(pageNumber) {
  const pages = document.querySelectorAll(".oasis-page");
  pages.forEach((page, index) => {
    if (index + 1 === pageNumber) {
      page.classList.add("active");
    } else {
      page.classList.remove("active");
    }
  });
  currentPage = pageNumber;
}

function showAuthBanner(email) {
  const banner = document.getElementById("auth-banner");
  const emailEl = document.getElementById("auth-banner-email");
  if (banner && emailEl) {
    emailEl.textContent = email;
    banner.style.display = 'flex';
  }
}

function hideAuthBanner() {
  const banner = document.getElementById("auth-banner");
  if (banner) {
    banner.style.display = 'none';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const beginBtn = document.getElementById("begin-journey-btn");
  const nameNextBtn = document.getElementById("name-next-btn");
  const nameInput = document.getElementById("user-name-input");
  const userNameDisplay = document.getElementById("user-name-display");
  
  // Auth form elements
  const authForm = document.getElementById("auth-form");
  const authEmail = document.getElementById("auth-email");
  const authPassword = document.getElementById("auth-password");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const authSubmitText = document.getElementById("auth-submit-text");
  const authError = document.getElementById("auth-error");
  const authToggleLink = document.getElementById("auth-toggle-link");
  const authToggleText = document.getElementById("auth-toggle-text");
  const authModeSubtitle = document.getElementById("auth-mode-subtitle");
  const skipAuthBtn = document.getElementById("skip-auth-btn");

  let authMode = 'signup'; // 'signup' or 'signin'
  
  // Check if already authenticated
  function checkAuthStatus() {
    const authState = window.oasisAuthState;
    if (authState && authState.isAuthenticated && authState.user) {
      console.log('User already authenticated:', authState.user.email);
      showAuthBanner(authState.user.email);
    }
  }
  
  // Listen for auth state changes
  window.addEventListener('oasis-auth-update', (e) => {
    const authState = e.detail || window.oasisAuthState;
    if (authState && authState.isAuthenticated && authState.user) {
      console.log('Auth state updated:', authState.user.email);
      showAuthBanner(authState.user.email);
    } else {
      hideAuthBanner();
    }
  });
  
  // Check auth status after a delay to ensure Supabase Auth is loaded
  setTimeout(checkAuthStatus, 500);
  setTimeout(checkAuthStatus, 1500);

  // Page 1: Begin Journey
  if (beginBtn) {
    beginBtn.addEventListener("click", () => {
      showPage(2);
    });
  }

  // Page 2: Name Input
  if (nameNextBtn) {
    nameNextBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (name) {
        userData.name = name;
        
        // Display name on page 5 (auth page)
        if (userNameDisplay) {
          userNameDisplay.textContent = name;
        }
        
        // Save name to preferences
        RPMSendAsyncMessage("OasisWelcome:SetUserName", { name });
        
        // Go to import page
        showPage(3);
      } else {
        nameInput.focus();
      }
    });
  }

  if (nameInput) {
    nameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        nameNextBtn.click();
      }
    });
  }

  // Page 3: Import Browser Data
  const importBackBtn = document.getElementById("import-back-btn");
  const importSkipBtn = document.getElementById("import-skip-btn");
  const importConfirmBtn = document.getElementById("import-confirm-btn");
  
  // Import checkboxes
  const historyCheckbox = document.getElementById("import-history");
  const bookmarksCheckbox = document.getElementById("import-bookmarks");
  const extensionsCheckbox = document.getElementById("import-extensions");
  const cookiesCheckbox = document.getElementById("import-cookies");
  
  // Track checkbox changes
  if (historyCheckbox) {
    historyCheckbox.addEventListener("change", () => {
      userData.importSettings.history = historyCheckbox.checked;
    });
  }
  if (bookmarksCheckbox) {
    bookmarksCheckbox.addEventListener("change", () => {
      userData.importSettings.bookmarks = bookmarksCheckbox.checked;
    });
  }
  if (extensionsCheckbox) {
    extensionsCheckbox.addEventListener("change", () => {
      userData.importSettings.extensions = extensionsCheckbox.checked;
    });
  }
  if (cookiesCheckbox) {
    cookiesCheckbox.addEventListener("change", () => {
      userData.importSettings.cookies = cookiesCheckbox.checked;
    });
  }
  
  // Back button - go to page 2
  if (importBackBtn) {
    importBackBtn.addEventListener("click", () => {
      showPage(2);
    });
  }
  
  // Skip button - go to AI signup page (page 4)
  if (importSkipBtn) {
    importSkipBtn.addEventListener("click", () => {
      console.log('Skipping import, going to AI signup...');
      showPage(4);
    });
  }
  
  // Import button - save settings and go to AI signup page (page 4)
  if (importConfirmBtn) {
    importConfirmBtn.addEventListener("click", () => {
      console.log('Import settings:', userData.importSettings);
      // Save import preferences
      RPMSendAsyncMessage("OasisWelcome:SetImportSettings", userData.importSettings);
      // Go to AI signup page
      showPage(4);
    });
  }

  // Page 4: AI Assistant Sign Up
  const openSignupBtn = document.getElementById("open-signup-btn");
  const skipAiBtn = document.getElementById("skip-ai-btn");

  if (openSignupBtn) {
    openSignupBtn.addEventListener("click", () => {
      console.log('Loading auth page in same tab...');
      // Load auth page in same tab (will replace onboarding)
      RPMSendAsyncMessage("OasisWelcome:OpenSignup");
    });
  }

  if (skipAiBtn) {
    skipAiBtn.addEventListener("click", () => {
      console.log('Skipping AI signup, finishing onboarding...');
      RPMSendAsyncMessage("OasisWelcome:Finished");
    });
  }

  // Page 5: Authentication (Postponed)
  if (authToggleLink) {
    authToggleLink.addEventListener("click", (e) => {
      e.preventDefault();
      authMode = authMode === 'signup' ? 'signin' : 'signup';
      updateAuthUI();
    });
  }

  function updateAuthUI() {
    if (authMode === 'signup') {
      authSubmitText.textContent = 'Sign Up';
      authToggleText.textContent = 'Already have an account?';
      authToggleLink.textContent = 'Sign In';
      authModeSubtitle.textContent = 'Sign up to sync your tabs and access AI assistant';
    } else {
      authSubmitText.textContent = 'Sign In';
      authToggleText.textContent = "Don't have an account?";
      authToggleLink.textContent = 'Sign Up';
      authModeSubtitle.textContent = 'Sign in to access all features';
    }
    if (authError) {
      authError.style.display = 'none';
    }
  }

  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const email = authEmail.value.trim();
      const password = authPassword.value;
      const name = userData.name || email.split('@')[0];

      if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
      }

      // Show loading state
      authSubmitBtn.disabled = true;
      authSubmitText.textContent = 'Processing...';
      if (authError) {
        authError.style.display = 'none';
      }

      try {
        // Wait for auth service to be ready
        if (!window.oasisWelcomeAuth || !window.supabaseAuth) {
          console.log('Waiting for auth service to initialize...');
          console.log('  - window.oasisWelcomeAuth:', typeof window.oasisWelcomeAuth);
          console.log('  - window.supabaseAuth:', typeof window.supabaseAuth);
          console.log('  - Scripts loaded:', window.oasisWelcomeDebug?.scriptsLoaded);
          console.log('  - Scripts failed:', window.oasisWelcomeDebug?.scriptsFailed);
          
          showAuthError('Initializing authentication service...', 'info');
          
          // Wait up to 10 seconds for auth service
          let attempts = 0;
          while ((!window.oasisWelcomeAuth || !window.supabaseAuth) && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
            
            if (attempts % 10 === 0) {
              console.log('Still waiting... attempt ' + attempts);
            }
          }
          
          if (!window.oasisWelcomeAuth) {
            throw new Error('Authentication bridge failed to initialize. Please refresh the page and try again.');
          }
          
          if (!window.supabaseAuth) {
            throw new Error('Supabase Auth service failed to load. Please check your internet connection and refresh the page.');
          }
          
          if (authError) {
            authError.style.display = 'none';
          }
        }

        let result;
        if (authMode === 'signup') {
          result = await window.oasisWelcomeAuth.signUp(email, password, name);
        } else {
          result = await window.oasisWelcomeAuth.signIn(email, password);
        }

        if (result.success) {
          console.log('Authentication successful:', result.user.email);
          showAuthError('Success! Signed in as ' + result.user.email, 'success');
          showAuthBanner(result.user.email);
          
          // Complete onboarding after short delay
          setTimeout(() => {
            RPMSendAsyncMessage("OasisWelcome:Finished");
          }, 2000);
        } else {
          showAuthError(result.error || 'Authentication failed');
          authSubmitBtn.disabled = false;
          updateAuthUI();
        }
      } catch (error) {
        console.error('Auth error:', error);
        showAuthError(error.message || 'An error occurred');
        authSubmitBtn.disabled = false;
        updateAuthUI();
      }
    });
  }

  if (skipAuthBtn) {
    skipAuthBtn.addEventListener("click", () => {
      RPMSendAsyncMessage("OasisWelcome:Finished");
    });
  }

  function showAuthError(message, type = 'error') {
    if (authError) {
      authError.textContent = message;
      authError.style.display = 'block';
      if (type === 'success') {
        authError.style.background = '#e8f5e9';
        authError.style.color = '#2e7d32';
      } else if (type === 'info') {
        authError.style.background = '#e3f2fd';
        authError.style.color = '#1976d2';
      } else {
        authError.style.background = '#ffebee';
        authError.style.color = '#d32f2f';
      }
    }
  }
});
