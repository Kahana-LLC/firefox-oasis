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
  console.log(`=== showPage called with pageNumber: ${pageNumber} ===`);
  
  try {
    const pages = document.querySelectorAll(".oasis-page");
    console.log(`Found ${pages.length} pages in DOM`);
    
    pages.forEach((page, index) => {
      const pageNum = index + 1;
      const wasActive = page.classList.contains("active");
      
      if (pageNum === pageNumber) {
        page.classList.add("active");
        console.log(`Page ${pageNum}: Added 'active' class`);
      } else {
        page.classList.remove("active");
        if (wasActive) {
          console.log(`Page ${pageNum}: Removed 'active' class`);
        }
      }
    });
    
    currentPage = pageNumber;
    console.log(`currentPage set to ${currentPage}`);
  } catch (err) {
    console.error("Error in showPage:", err);
  }
  
  // When showing page 3, ensure button event listeners are attached
  if (pageNumber === 3) {
    console.log("=== PAGE 3 SHOWN - VERIFYING BUTTONS ===");
    const backBtn = document.getElementById("import-back-btn");
    const skipBtn = document.getElementById("import-skip-btn");
    const confirmBtn = document.getElementById("import-confirm-btn");
    
    console.log("Back button DOM status:", {
      exists: !!backBtn,
      displayed: backBtn ? `${backBtn.offsetWidth}x${backBtn.offsetHeight}` : 'N/A',
      visible: backBtn ? backBtn.offsetParent !== null : 'N/A',
      clickable: backBtn ? window.getComputedStyle(backBtn).pointerEvents : 'N/A'
    });
    
    console.log("Skip button DOM status:", {
      exists: !!skipBtn,
      displayed: skipBtn ? `${skipBtn.offsetWidth}x${skipBtn.offsetHeight}` : 'N/A',
      visible: skipBtn ? skipBtn.offsetParent !== null : 'N/A',
      clickable: skipBtn ? window.getComputedStyle(skipBtn).pointerEvents : 'N/A'
    });
    
    console.log("Import button DOM status:", {
      exists: !!confirmBtn,
      displayed: confirmBtn ? `${confirmBtn.offsetWidth}x${confirmBtn.offsetHeight}` : 'N/A',
      visible: confirmBtn ? confirmBtn.offsetParent !== null : 'N/A',
      clickable: confirmBtn ? window.getComputedStyle(confirmBtn).pointerEvents : 'N/A'
    });
  }
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
  console.log("=== Oasis Welcome DOMContentLoaded ===");
  
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
      showAuthBanner(authState.user.email);
    }
  }

  // Listen for auth state changes
  window.addEventListener('oasis-auth-update', (e) => {
    const authState = e.detail || window.oasisAuthState;
    if (authState && authState.isAuthenticated && authState.user) {
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

  // Page 3: Name Input
  if (nameNextBtn) {
    nameNextBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (name) {
        userData.name = name;

        // Display name on page 4 (auth page)
        if (userNameDisplay) {
          userNameDisplay.textContent = "Welcome to Oasis, " + name + ".";
        }

        // Save name to preferences
        RPMSendAsyncMessage("OasisWelcome:SetUserName", { name });

        // Go to AI sign-up page
        showPage(4);
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

  // Page 2: Import Browser Data
  const importBackBtn = document.getElementById("import-back-btn");
  const importSkipBtn = document.getElementById("import-skip-btn");
  const importConfirmBtn = document.getElementById("import-confirm-btn");
  const browserSelectorBtn = document.getElementById("browser-selector-btn");
  const importCheckboxes = document.querySelectorAll(".oasis-option-checkbox");

  console.log("=== PAGE 2 IMPORT BUTTONS SETUP ===");
  console.log("importBackBtn:", importBackBtn);
  console.log("importSkipBtn:", importSkipBtn);
  console.log("importConfirmBtn:", importConfirmBtn);
  console.log("importCheckboxes:", importCheckboxes.length);

  // Back button - navigate to page 1
  if (importBackBtn) {
    importBackBtn.addEventListener("click", () => {
      console.log("[IMPORT] Back button clicked");
      showPage(1);
    });
  }

  // Skip button - skip import and go to page 3 (name input)
  if (importSkipBtn) {
    importSkipBtn.addEventListener("click", () => {
      console.log("[IMPORT] Skip button clicked");
      
      // Save that import was skipped
      const importData = {
        browserId: null,
        resources: [],
        completed: false
      };
      
      if (typeof RPMSendAsyncMessage !== "undefined") {
        RPMSendAsyncMessage("OasisWelcome:SetImportSettings", importData);
      }
      
      showPage(3);
    });
  }

  // Import button - start migration with selected options
  if (importConfirmBtn) {
    importConfirmBtn.addEventListener("click", () => {
      console.log("[IMPORT] Import button clicked");
      
      // Collect selected resources from checkboxes
      const selectedResources = [];
      importCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
          const optionId = checkbox.id; // import-history, import-bookmarks, etc.
          const resourceName = optionId.replace('import-', '');
          selectedResources.push(resourceName);
          console.log("[IMPORT] Selected resource:", resourceName);
        }
      });
      
      // Save import settings
      const importData = {
        browserId: 'chrome',
        resources: selectedResources,
        completed: true
      };
      
      console.log("[IMPORT] Import data:", importData);
      
      if (typeof RPMSendAsyncMessage !== "undefined") {
        RPMSendAsyncMessage("OasisWelcome:SetImportSettings", importData);
      }
      
      // Proceed to next page (Name input)
      showPage(3);
    });
  }

  // Browser selector button - could open dropdown to select different browser
  if (browserSelectorBtn) {
    browserSelectorBtn.addEventListener("click", () => {
      console.log("[IMPORT] Browser selector clicked");
      // TODO: Implement browser selection dropdown
    });
  }

  // Track import selections
  let importSettings = {
    browserId: null,
    resources: [],
    completed: false
  };

  // Page 4: AI Assistant Sign Up
  const openSignupBtn = document.getElementById("open-signup-btn");
  const skipAiBtn = document.getElementById("skip-ai-btn");

  if (openSignupBtn) {
    openSignupBtn.addEventListener("click", () => {
      // Load auth page in same tab (will replace onboarding)
      RPMSendAsyncMessage("OasisWelcome:OpenSignup");
    });
  }

  if (skipAiBtn) {
    skipAiBtn.addEventListener("click", () => {
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
          showAuthError('Initializing authentication service...', 'info');

          // Wait up to 10 seconds for auth service
          let attempts = 0;
          while ((!window.oasisWelcomeAuth || !window.supabaseAuth) && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
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
