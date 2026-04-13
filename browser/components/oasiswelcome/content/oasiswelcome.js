/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global RPMSendAsyncMessage */
/* eslint-disable no-console -- onboarding page logging */

"use strict";

let currentPage = 1;
const userData = {
  name: "",
  importSettings: {
    history: false,
    bookmarks: true,
    extensions: true,
    cookies: false,
  },
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
  if (pageNumber === 4 && window.syncOasisOnboardingAuthState) {
    window.syncOasisOnboardingAuthState("page-4");
  }
}

function showAuthBanner(email) {
  const banner = document.getElementById("auth-banner");
  const emailEl = document.getElementById("auth-banner-email");
  if (banner && emailEl) {
    emailEl.textContent = email;
    banner.style.display = "flex";
  }
}

function hideAuthBanner() {
  const banner = document.getElementById("auth-banner");
  if (banner) {
    banner.style.display = "none";
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
  const oauthGoogleBtn = document.getElementById("oauth-google-btn");
  const oauthAppleBtn = document.getElementById("oauth-apple-btn");
  const oauthAzureBtn = document.getElementById("oauth-azure-btn");

  let authMode = "signup"; // 'signup' or 'signin'
  let oauthHandoffInFlight = false;
  let onboardingFinished = false;
  let authSyncIntervalId = null;
  let onboardingFinishTimeoutId = null;
  let intervalSyncCount = 0;

  // Check if already authenticated
  function checkAuthStatus() {
    if (onboardingFinished) {
      return true;
    }
    const authState = window.oasisAuthState;
    if (authState && authState.isAuthenticated && authState.user) {
      console.log("User already authenticated:", authState.user.email);
      showAuthBanner(authState.user.email);
      if (currentPage === 4) {
        finishOnboarding(authState.user);
      }
      return true;
    }
    return false;
  }

  // Listen for auth state changes
  window.addEventListener("oasis-auth-update", e => {
    if (onboardingFinished) {
      return;
    }
    const authState = e.detail || window.oasisAuthState;
    if (authState && authState.isAuthenticated && authState.user) {
      console.log("Auth state updated:", authState.user.email);
      showAuthBanner(authState.user.email);
      if (currentPage === 4) {
        finishOnboarding(authState.user);
      }
    } else {
      hideAuthBanner();
    }
  });

  async function syncOnboardingAuthState(reason = "unknown") {
    if (currentPage !== 4 || onboardingFinished) {
      return false;
    }

    if (checkAuthStatus()) {
      return true;
    }

    if (reason === "interval") {
      intervalSyncCount++;
      if (intervalSyncCount <= 3 || intervalSyncCount % 10 === 0) {
        console.log(
          "Syncing onboarding auth state:",
          `${reason} ${intervalSyncCount}`
        );
      }
    } else {
      console.log("Syncing onboarding auth state:", reason);
    }
    await consumeStoredOAuthHandoff();
    if (window.oasisAuthState?.isAuthenticated) {
      return true;
    }

    const restored = await window.oasisWelcomeAuth?.restoreExistingSession?.();
    if (restored && !restored.ignored && restored.success) {
      finishOnboarding(restored.user);
      return true;
    }

    return false;
  }

  window.syncOasisOnboardingAuthState = syncOnboardingAuthState;

  // Check auth status after a delay to ensure Supabase Auth is loaded
  setTimeout(() => syncOnboardingAuthState("startup-500ms"), 500);
  setTimeout(() => syncOnboardingAuthState("startup-1500ms"), 1500);
  window.addEventListener("storage", () => syncOnboardingAuthState("storage"));
  window.addEventListener("focus", () => syncOnboardingAuthState("focus"));
  window.addEventListener("pageshow", () =>
    syncOnboardingAuthState("pageshow")
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncOnboardingAuthState("visibilitychange");
    }
  });
  authSyncIntervalId = setInterval(
    () => syncOnboardingAuthState("interval"),
    1000
  );

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

        showPage(4);
      } else {
        nameInput.focus();
      }
    });
  }

  if (nameInput) {
    nameInput.addEventListener("keypress", e => {
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

  // Back button - go to page 1
  if (importBackBtn) {
    importBackBtn.addEventListener("click", () => {
      showPage(1);
    });
  }

  // Skip button - go to name input page (page 3)
  if (importSkipBtn) {
    importSkipBtn.addEventListener("click", () => {
      console.log("Skipping import, going to name input...");
      showPage(3);
    });
  }

  // Import button - save settings and go to name input page (page 3)
  if (importConfirmBtn) {
    importConfirmBtn.addEventListener("click", () => {
      console.log("Import settings:", userData.importSettings);
      // Save import preferences
      RPMSendAsyncMessage(
        "OasisWelcome:SetImportSettings",
        userData.importSettings
      );
      showPage(3);
    });
  }

  if (browserSelectorBtn) {
    browserSelectorBtn.addEventListener("click", () => {});
  }

  if (authToggleLink) {
    authToggleLink.addEventListener("click", e => {
      e.preventDefault();
      authMode = authMode === "signup" ? "signin" : "signup";
      updateAuthUI();
    });
  }

  function setOauthLoadingState(loading) {
    [authSubmitBtn, oauthGoogleBtn, oauthAppleBtn, oauthAzureBtn].forEach(
      button => {
        if (button) {
          button.disabled = loading;
        }
      }
    );
  }

  function finishOnboarding(user) {
    if (onboardingFinished) {
      return;
    }

    onboardingFinished = true;
    if (authSyncIntervalId) {
      clearInterval(authSyncIntervalId);
      authSyncIntervalId = null;
    }
    if (onboardingFinishTimeoutId) {
      clearTimeout(onboardingFinishTimeoutId);
    }

    const email = user.email || user.id;
    showAuthError("Success! Signed in as " + email, "success");
    showAuthBanner(email);
    onboardingFinishTimeoutId = setTimeout(() => {
      RPMSendAsyncMessage("OasisWelcome:Finished");
    }, 4000);
  }

  async function consumeStoredOAuthHandoff() {
    if (
      oauthHandoffInFlight ||
      currentPage !== 4 ||
      !window.oasisWelcomeAuth?.consumeStoredOAuthHandoff
    ) {
      return;
    }

    oauthHandoffInFlight = true;
    try {
      const result = await window.oasisWelcomeAuth.consumeStoredOAuthHandoff();
      if (!result || result.ignored) {
        const restored = await window.oasisWelcomeAuth.restoreExistingSession();
        if (restored?.pendingHandoff) {
          const pendingResult =
            await window.oasisWelcomeAuth.consumeStoredOAuthHandoff();
          if (
            pendingResult &&
            !pendingResult.ignored &&
            pendingResult.success
          ) {
            finishOnboarding(pendingResult.user);
          }
          return;
        }
        if (restored && !restored.ignored && restored.success) {
          finishOnboarding(restored.user);
        }
        return;
      }
      if (!result.success) {
        throw new Error(result.error || "Failed to complete OAuth sign-in.");
      }
      finishOnboarding(result.user);
    } catch (error) {
      console.error("Stored OAuth completion error:", error);
      showAuthError(error.message || "Failed to complete OAuth sign-in.");
    } finally {
      oauthHandoffInFlight = false;
    }
  }

  async function handleOAuthStart(provider) {
    setOauthLoadingState(true);
    showAuthError("Opening sign-in in a new tab...", "info");

    try {
      const result = await window.oasisWelcomeAuth.startOAuth(provider);
      if (!result.success) {
        throw new Error(result.error || "Failed to start OAuth sign-in.");
      }

      if (result.user) {
        finishOnboarding(result.user);
        return;
      }

      if (result.oauthUrl) {
        const opened = window.oasisWelcomeAuth.openOAuthTab(result.oauthUrl);
        if (!opened) {
          throw new Error("Failed to open the OAuth tab. Please try again.");
        }
        showAuthError(
          "Finish sign-in in the opened tab. Oasis will complete sign-in automatically.",
          "info"
        );
      }
    } catch (error) {
      console.error("OAuth start error:", error);
      showAuthError(error.message || "Failed to start OAuth sign-in.");
    } finally {
      setOauthLoadingState(false);
    }
  }

  function updateAuthUI() {
    if (authMode === "signup") {
      authSubmitText.textContent = "Sign Up";
      authToggleText.textContent = "Already have an account?";
      authToggleLink.textContent = "Sign In";
      authModeSubtitle.textContent =
        "Sign up to sync your tabs and access AI assistant";
    } else {
      authSubmitText.textContent = "Sign In";
      authToggleText.textContent = "Don't have an account?";
      authToggleLink.textContent = "Sign Up";
      authModeSubtitle.textContent = "Sign in to access all features";
    }
    if (authError) {
      authError.style.display = "none";
    }
  }

  if (authForm) {
    authForm.addEventListener("submit", async e => {
      e.preventDefault();

      const email = authEmail.value.trim();
      const password = authPassword.value;
      const name = userData.name || email.split("@")[0];

      if (!email || !password) {
        showAuthError("Please enter email and password");
        return;
      }

      // Show loading state
      authSubmitBtn.disabled = true;
      authSubmitText.textContent = "Processing...";
      if (authError) {
        authError.style.display = "none";
      }

      try {
        // Wait for auth service to be ready
        if (!window.oasisWelcomeAuth || !window.supabaseAuth) {
          console.log("Waiting for auth service to initialize...");
          console.log(
            "  - window.oasisWelcomeAuth:",
            typeof window.oasisWelcomeAuth
          );
          console.log("  - window.supabaseAuth:", typeof window.supabaseAuth);
          console.log(
            "  - Scripts loaded:",
            window.oasisWelcomeDebug?.scriptsLoaded
          );
          console.log(
            "  - Scripts failed:",
            window.oasisWelcomeDebug?.scriptsFailed
          );

          showAuthError("Initializing authentication service...", "info");

          // Wait up to 10 seconds for auth service
          let attempts = 0;
          while (
            (!window.oasisWelcomeAuth || !window.supabaseAuth) &&
            attempts < 100
          ) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;

            if (attempts % 10 === 0) {
              console.log("Still waiting... attempt " + attempts);
            }
          }

          if (!window.oasisWelcomeAuth) {
            throw new Error(
              "Authentication bridge failed to initialize. Please refresh the page and try again."
            );
          }

          if (!window.supabaseAuth) {
            throw new Error(
              "Supabase Auth service failed to load. Please check your internet connection and refresh the page."
            );
          }

          if (authError) {
            authError.style.display = "none";
          }
        }

        let result;
        if (authMode === "signup") {
          result = await window.oasisWelcomeAuth.signUp(email, password, name);
        } else {
          result = await window.oasisWelcomeAuth.signIn(email, password);
        }

        if (result.success) {
          finishOnboarding(result.user);
        } else {
          showAuthError(result.error || "Authentication failed");
          authSubmitBtn.disabled = false;
          updateAuthUI();
        }
      } catch (error) {
        console.error("Auth error:", error);
        showAuthError(error.message || "An error occurred");
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

  if (oauthGoogleBtn) {
    oauthGoogleBtn.addEventListener("click", () => handleOAuthStart("google"));
  }

  if (oauthAppleBtn) {
    oauthAppleBtn.addEventListener("click", () => handleOAuthStart("apple"));
  }

  if (oauthAzureBtn) {
    oauthAzureBtn.addEventListener("click", () => handleOAuthStart("azure"));
  }

  function showAuthError(message, type = "error") {
    if (authError) {
      authError.textContent = message;
      authError.style.display = "block";
      if (type === "success") {
        authError.style.background = "#e8f5e9";
        authError.style.color = "#2e7d32";
      } else if (type === "info") {
        authError.style.background = "#e3f2fd";
        authError.style.color = "#1976d2";
      } else {
        authError.style.background = "#ffebee";
        authError.style.color = "#d32f2f";
      }
    }
  }
});
