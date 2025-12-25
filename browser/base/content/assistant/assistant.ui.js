import { runAssistantStream, resetAssistantSession } from "./assistant.bundle.js";
// Try to get Services from global scope or import it
const Services = window.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

// Import voice input service - it will be bundled
let voiceInputService = null;
try {
  // The voice input service will be available in the bundle
  voiceInputService = window.voiceInputService;
} catch (e) {
  console.warn("Voice input service not available:", e);
}

// SupabaseAuth should be available from the bundle
// The bundle now exposes window.supabaseAuth directly
console.log('SupabaseAuth available:', !!window.supabaseAuth);

// Check current authentication status on page load
async function checkCurrentAuthStatus() {
    console.log('Checking current auth status...');
    // First try to load from secure storage
    const restoredSession = await securelyLoadSession();
    if (restoredSession) {
        console.log('Session restored from secure storage', restoredSession.user?.email);
        updateAuthUI(true, restoredSession.user);
        
        // Verify with Supabase (background check)
        if (window.supabaseAuth && window.supabaseAuth.supabase) {
            window.supabaseAuth.supabase.auth.getUser().then(({ data: { user }, error }) => {
                if (error || !user) {
                    console.warn('Restored session invalid, clearing:', error);
                    securelyClearSession();
                    updateAuthUI(false);
                } else {
                    console.log('Restored session verified valid');
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
        try {
            const { data: { user }, error } = await window.supabaseAuth.supabase.auth.getUser();
            if (user && !error) {
                console.log('User is already authenticated (Supabase):', user.email);
                updateAuthUI(true, user);
                
                // Ensure session is saved
                const { data: { session } } = await window.supabaseAuth.supabase.auth.getSession();
                if (session) {
                    securelySaveSession(session);
                }
            } else {
                console.log('User is not authenticated');
                updateAuthUI(false);
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            updateAuthUI(false);
        } finally {
            initialAuthCheckComplete = true;
            console.log('Initial auth check completed');
        }
    }
}

// Flag to track if the initial auth check has completed
let initialAuthCheckComplete = false;

// Check auth status after a short delay to ensure everything is loaded
setTimeout(checkCurrentAuthStatus, 1000);

// --- Secure Session Storage (Services.logins) ---

const LOGIN_HOSTNAME = "https://kahana.co"; // Use the service domain
const LOGIN_REALM = "Oasis Assistant";
const LOGIN_USERNAME = "oasis_assistant_session"; // Fixed username for the session token

async function securelySaveSession(session) {
    if (!session || !session.access_token) return;

    try {
        // Remove existing login if any
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
            null, // formSubmitURL
            LOGIN_REALM,
            LOGIN_USERNAME,
            JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                expires_at: session.expires_at,
                user: session.user
            }), // password (store full session as JSON)
            "", // usernameField
            ""  // passwordField
        );

        // Add new login
        await Services.logins.addLoginAsync(loginInfo);
        console.log("Session securely saved to Password Manager (overwrote existing: " + !!existingLogin + ")");
    } catch (e) {
        console.error("Failed to save session securely:", e);
    }
}

async function securelyLoadSession() {
    try {
        const logins = Services.logins.findLogins(LOGIN_HOSTNAME, null, LOGIN_REALM);
        console.log(`Found ${logins.length} logins for ${LOGIN_REALM}`);
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
                    // If restore fails (e.g. expired), clear it
                    securelyClearSession();
                }
            }
        } else {
            console.log("No secure session found");
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

const log = document.getElementById("log");
const q   = document.getElementById("q");
const go  = document.getElementById("go");

// Replace send button with SVG icon button
go.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="18" fill="#7A9200"/>
  <path d="M18 26V10M18 10L24 16M18 10L12 16" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
go.style.cssText = `
  padding: 0;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
`;
go.addEventListener("mouseenter", () => {
  go.style.transform = "translateY(-1px)";
  go.style.opacity = "0.9";
});
go.addEventListener("mouseleave", () => {
  go.style.transform = "translateY(0)";
  go.style.opacity = "1";
});

// Voice button with microphone icon
const bar = document.getElementById("bar") || q.parentElement;

// Create input row wrapper
const inputRow = document.createElement("div");
inputRow.id = "input-row";

// Add just the input field to input row
if (q.parentElement === bar) {
  inputRow.appendChild(q);
}
bar.appendChild(inputRow);

// Create buttons row for feedback, voice, and send
const buttonsRow = document.createElement("div");
buttonsRow.id = "buttons-row";
bar.appendChild(buttonsRow);

const voiceBtn = document.createElement("button");
voiceBtn.id = "voice-btn";
voiceBtn.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="18" fill="#F8FAF2"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M14.9576 12.8511C14.9576 12.0442 15.2782 11.2703 15.8487 10.6997C16.4193 10.1291 17.1932 9.80859 18.0001 9.80859C18.8071 9.80859 19.5809 10.1291 20.1515 10.6997C20.7221 11.2703 21.0427 12.0442 21.0427 12.8511V18.4681C21.0427 19.2751 20.7221 20.0489 20.1515 20.6195C19.5809 21.1901 18.8071 21.5107 18.0001 21.5107C17.1932 21.5107 16.4193 21.1901 15.8487 20.6195C15.2782 20.0489 14.9576 19.2751 14.9576 18.4681V12.8511ZM18.0001 11.2128C17.5656 11.2128 17.1489 11.3854 16.8417 11.6927C16.5345 11.9999 16.3618 12.4166 16.3618 12.8511V18.4681C16.3618 18.9026 16.5345 19.3193 16.8417 19.6266C17.1489 19.9338 17.5656 20.1064 18.0001 20.1064C18.4346 20.1064 18.8513 19.9338 19.1586 19.6266C19.4658 19.3193 19.6384 18.9026 19.6384 18.4681V12.8511C19.6384 12.4166 19.4658 11.9999 19.1586 11.6927C18.8513 11.3854 18.4346 11.2128 18.0001 11.2128ZM13.3193 17.766C13.5055 17.766 13.6841 17.84 13.8158 17.9716C13.9475 18.1033 14.0214 18.2819 14.0214 18.4681C14.0214 19.5233 14.4406 20.5353 15.1868 21.2815C15.9329 22.0276 16.9449 22.4468 18.0001 22.4468C19.0554 22.4468 20.0674 22.0276 20.8135 21.2815C21.5597 20.5353 21.9788 19.5233 21.9788 18.4681C21.9788 18.2819 22.0528 18.1033 22.1845 17.9716C22.3162 17.84 22.4947 17.766 22.681 17.766C22.8672 17.766 23.0458 17.84 23.1774 17.9716C23.3091 18.1033 23.3831 18.2819 23.3831 18.4681C23.3831 19.7742 22.9083 21.0357 22.0471 22.0176C21.186 22.9995 19.9972 23.6348 18.7023 23.8052V24.7872H20.8086C20.9948 24.7872 21.1734 24.8612 21.3051 24.9929C21.4368 25.1246 21.5108 25.3031 21.5108 25.4894C21.5108 25.6756 21.4368 25.8542 21.3051 25.9858C21.1734 26.1175 20.9948 26.1915 20.8086 26.1915H15.1916C15.0054 26.1915 14.8268 26.1175 14.6952 25.9858C14.5635 25.8542 14.4895 25.6756 14.4895 25.4894C14.4895 25.3031 14.5635 25.1246 14.6952 24.9929C14.8268 24.8612 15.0054 24.7872 15.1916 24.7872H17.298V23.8052C16.0031 23.6348 14.8143 22.9995 13.9531 22.0176C13.092 21.0357 12.6172 19.7742 12.6172 18.4681C12.6172 18.2819 12.6912 18.1033 12.8228 17.9716C12.9545 17.84 13.1331 17.766 13.3193 17.766Z" fill="#94A833"/>
</svg>`;
voiceBtn.style.cssText = `
  padding: 0;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
`;
voiceBtn.addEventListener("mouseenter", () => {
  voiceBtn.style.transform = "translateY(-1px)";
  voiceBtn.style.opacity = "0.9";
});
voiceBtn.addEventListener("mouseleave", () => {
  voiceBtn.style.transform = "translateY(0)";
  voiceBtn.style.opacity = "1";
});

// Feedback button with text - positioned below input
const feedbackBtn = document.createElement("button");
feedbackBtn.id = "feedback-btn";
feedbackBtn.textContent = "Feedback?";
feedbackBtn.style.cssText = `
  padding: 4px 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  color: var(--primary-green, #7A9200);
  font-weight: 500;
  border-radius: 8px;
  white-space: nowrap;
`;
feedbackBtn.title = "Submit feedback";
feedbackBtn.addEventListener("mouseenter", () => {
  feedbackBtn.style.background = "var(--primary-50, #F2F4E5)";
});
feedbackBtn.addEventListener("mouseleave", () => {
  feedbackBtn.style.background = "transparent";
});
feedbackBtn.addEventListener("click", () => {
  try {
    const feedbackUrl = "https://tally.so/r/3jkNN6";
    if (typeof openWebLinkIn === 'function') {
      openWebLinkIn(feedbackUrl, "tab", {});
    } else if (window.top && window.top.openWebLinkIn) {
      window.top.openWebLinkIn(feedbackUrl, "tab", {});
    } else {
      window.open(feedbackUrl, "_blank");
    }
  } catch (error) {
    console.log("Could not open feedback URL:", error);
  }
});

// Add all buttons to buttons row: feedback, voice, send
buttonsRow.appendChild(feedbackBtn);
buttonsRow.appendChild(voiceBtn);
if (go.parentElement === bar) {
  buttonsRow.appendChild(go);
}

// Define setBusy function with send button toggle to pause
let busy = false;
let stopped = false;

function setBusy(v) {
  busy = v;
  q.disabled = v;
  
  // Toggle send button to pause icon when busy
  if (v) {
    go.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="18" fill="#f8faf2"/>
      <rect x="11" y="11" width="14" height="14" rx="2" fill="#7A9200"/>
    </svg>`;
    go.title = "Click to stop";
  } else {
    go.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="18" fill="#7A9200"/>
      <path d="M18 26V10M18 10L24 16M18 10L12 16" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    go.title = "Send message";
  }
}

// Use the voiceBtn as micButton for compatibility with existing code
const micButton = voiceBtn;
micButton.title = "Click to start voice input";

let isRecording = false;

micButton.addEventListener("click", async () => {
  if (!isAuthenticated) {
    append("\n❌ Please sign in to use voice input.\n");
    return;
  }

  if (!voiceInputService) {
    append("\n❌ Voice input service not available.\n");
    return;
  }

  if (isRecording) {
    // Stop recording - show stop icon while processing
    micButton.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="18" fill="#f8faf2"/>
      <rect x="11" y="11" width="14" height="14" rx="2" fill="#7A9200"/>
    </svg>`;
    micButton.disabled = true;
    micButton.style.cssText = `
      padding: 0;
      width: 36px;
      height: 36px;
      border-radius: 18px;
      border: none;
      background: transparent;
      cursor: not-allowed;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.6;
    `;
    
    try {
      const transcribedText = await voiceInputService.stopRecording();
      
      if (transcribedText && transcribedText.trim()) {
        q.value = transcribedText;
        append(`\n🎤 Transcribed: ${transcribedText}\n`);
      } else {
        append("\n⚠️ No speech detected.\n");
      }
    } catch (error) {
      console.error("Transcription error:", error);
      append(`\n❌ Transcription failed: ${error.message}\n`);
    } finally {
      isRecording = false;
      micButton.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="18" fill="#F8FAF2"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M14.9576 12.8511C14.9576 12.0442 15.2782 11.2703 15.8487 10.6997C16.4193 10.1291 17.1932 9.80859 18.0001 9.80859C18.8071 9.80859 19.5809 10.1291 20.1515 10.6997C20.7221 11.2703 21.0427 12.0442 21.0427 12.8511V18.4681C21.0427 19.2751 20.7221 20.0489 20.1515 20.6195C19.5809 21.1901 18.8071 21.5107 18.0001 21.5107C17.1932 21.5107 16.4193 21.1901 15.8487 20.6195C15.2782 20.0489 14.9576 19.2751 14.9576 18.4681V12.8511ZM18.0001 11.2128C17.5656 11.2128 17.1489 11.3854 16.8417 11.6927C16.5345 11.9999 16.3618 12.4166 16.3618 12.8511V18.4681C16.3618 18.9026 16.5345 19.3193 16.8417 19.6266C17.1489 19.9338 17.5656 20.1064 18.0001 20.1064C18.4346 20.1064 18.8513 19.9338 19.1586 19.6266C19.4658 19.3193 19.6384 18.9026 19.6384 18.4681V12.8511C19.6384 12.4166 19.4658 11.9999 19.1586 11.6927C18.8513 11.3854 18.4346 11.2128 18.0001 11.2128ZM13.3193 17.766C13.5055 17.766 13.6841 17.84 13.8158 17.9716C13.9475 18.1033 14.0214 18.2819 14.0214 18.4681C14.0214 19.5233 14.4406 20.5353 15.1868 21.2815C15.9329 22.0276 16.9449 22.4468 18.0001 22.4468C19.0554 22.4468 20.0674 22.0276 20.8135 21.2815C21.5597 20.5353 21.9788 19.5233 21.9788 18.4681C21.9788 18.2819 22.0528 18.1033 22.1845 17.9716C22.3162 17.84 22.4947 17.766 22.681 17.766C22.8672 17.766 23.0458 17.84 23.1774 17.9716C23.3091 18.1033 23.3831 18.2819 23.3831 18.4681C23.3831 19.7742 22.9083 21.0357 22.0471 22.0176C21.186 22.9995 19.9972 23.6348 18.7023 23.8052V24.7872H20.8086C20.9948 24.7872 21.1734 24.8612 21.3051 24.9929C21.4368 25.1246 21.5108 25.3031 21.5108 25.4894C21.5108 25.6756 21.4368 25.8542 21.3051 25.9858C21.1734 26.1175 20.9948 26.1915 20.8086 26.1915H15.1916C15.0054 26.1915 14.8268 26.1175 14.6952 25.9858C14.5635 25.8542 14.4895 25.6756 14.4895 25.4894C14.4895 25.3031 14.5635 25.1246 14.6952 24.9929C14.8268 24.8612 15.0054 24.7872 15.1916 24.7872H17.298V23.8052C16.0031 23.6348 14.8143 22.9995 13.9531 22.0176C13.092 21.0357 12.6172 19.7742 12.6172 18.4681C12.6172 18.2819 12.6912 18.1033 12.8228 17.9716C12.9545 17.84 13.1331 17.766 13.3193 17.766Z" fill="#94A833"/>
      </svg>`;
      micButton.disabled = false;
      micButton.style.cssText = `
        padding: 0;
        width: 36px;
        height: 36px;
        border-radius: 18px;
        border: none;
        background: transparent;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 8px;
      `;
      micButton.title = "Click to start voice input";
    }
  } else {
    // Start recording - change to stop icon from Figma design
    try {
      await voiceInputService.startRecording();
      isRecording = true;
      micButton.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="18" fill="#f8faf2"/>
        <rect x="11" y="11" width="14" height="14" rx="2" fill="#7A9200"/>
      </svg>`;
      micButton.style.cssText = `
        padding: 0;
        width: 36px;
        height: 36px;
        border-radius: 18px;
        border: none;
        background: transparent;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 8px;
        animation: pulse 1.5s ease-in-out infinite;
      `;
      micButton.title = "Click to stop recording";
      append("\n🎤 Recording... Click again to stop.\n");
      
      // Add pulse animation for recording state
      if (!document.getElementById('recording-pulse-style')) {
        const style = document.createElement('style');
        style.id = 'recording-pulse-style';
        style.textContent = `
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        `;
        document.head.appendChild(style);
      }
    } catch (error) {
      console.error("Recording error:", error);
      append(`\n❌ Failed to start recording: ${error.message}\n`);
    }
  }
});

// Authentication state
let isAuthenticated = false;
let currentUser = null;

// Cross-frame authentication synchronization and command coordination
function setupCrossFrameAuthSync() {
    // Check if we're in an iframe (popup) or main window
    const isInIframe = window !== window.top;
    
    // Listen for messages from parent window (if in iframe) or iframe (if parent)
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'OASIS_AUTH_STATE_CHANGE') {
            console.log('Received auth state change from parent:', event.data);
            const { authenticated, user } = event.data;
            updateAuthUI(authenticated, user);
        } else if (event.data && event.data.type === 'OASIS_COMMAND_RESULT') {
            // Handle command results from parent window (if in iframe)
            console.log('Received command result from parent:', event.data);
            const { result, error } = event.data;
            if (error) {
                append(`\nError: ${error}\n`);
            } else if (result) {
                append(`\n${result}\n`);
            }
        }
    });

    // Send authentication state to iframe (if we're the parent)
    function notifyIframeAuthChange(authenticated, user) {
        try {
            const iframe = document.getElementById('oasis-assistant-frame');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'OASIS_AUTH_STATE_CHANGE',
                    authenticated,
                    user
                }, '*');
                console.log('Sent auth state change to iframe:', { authenticated, user: user?.email });
            }
        } catch (error) {
            console.warn('Failed to notify iframe of auth change:', error);
        }
    }

    // Send command result to iframe (if we're the parent)
    function notifyIframeCommandResult(result, error = null) {
        try {
            const iframe = document.getElementById('oasis-assistant-frame');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'OASIS_COMMAND_RESULT',
                    result,
                    error
                }, '*');
                console.log('Sent command result to iframe:', { result, error });
            }
        } catch (error) {
            console.warn('Failed to notify iframe of command result:', error);
        }
    }

    // Expose functions globally
    window.notifyIframeAuthChange = notifyIframeAuthChange;
    window.notifyIframeCommandResult = notifyIframeCommandResult;
    window.isInIframe = isInIframe;
}

// Function to wait for an element to exist
function waitForElement(selector, timeout = 1000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }
        
        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(selector);
            if (element) {
                obs.disconnect();
                resolve(element);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

// Function to update the authentication UI
function updateAuthUI(authenticated, user = null) {
    console.log('updateAuthUI called with:', { authenticated, user: user?.email });
    
    isAuthenticated = authenticated;
    currentUser = user;
    
    // Set global authentication state for the proxy client to access
    window.oasisAuthState = {
        isAuthenticated: authenticated,
        user: user
    };
    
    console.log('Global auth state set:', window.oasisAuthState);
    
    // Update the input field placeholder
    const inputField = document.getElementById('q');
    console.log('Input field found:', inputField);
    if (inputField) {
        if (authenticated) {
            inputField.placeholder = 'Ask me anything...';
            inputField.disabled = false;
            console.log('Input field enabled for authenticated user');
        } else {
            inputField.placeholder = 'Please sign in first...';
            inputField.disabled = true;
            console.log('Input field disabled for unauthenticated user');
        }
    } else {
        console.warn('Input field not found');
    }
    
    // Update send button
    const sendButton = document.getElementById('go');
    if (sendButton) {
        sendButton.disabled = !authenticated;
    }
    
    // Update dropdown menu if it exists
    if (typeof updateDropdownMenu === 'function') {
        updateDropdownMenu();
    }
    
    // Update authentication banner (wrapped in try-catch for Firefox chrome context)
    try {
        const authBanner = document.getElementById('authBanner');
        const bannerUserEmail = document.getElementById('bannerUserEmail');
        const hideBanner = sessionStorage.getItem("hideBanner");
        
        if (authBanner && bannerUserEmail) {
            if (authenticated && user?.email && !hideBanner) {
                authBanner.style.display = "flex";
                bannerUserEmail.textContent = user.email;
                console.log('Auth banner shown for:', user.email);
            } else {
                authBanner.style.display = "none";
            }
        }
    } catch (error) {
        // Banner elements not yet in DOM, will be updated on next call
        console.log('Auth banner not yet available:', error.name);
    }
    
    // Clear banner preference when logging out
    if (!authenticated) {
        sessionStorage.removeItem("hideBanner");
    }
    
    console.log('Auth UI updated:', { authenticated, user: user?.email });
    
    // Notify iframe of authentication state change (if we're the parent window)
    if (typeof window.notifyIframeAuthChange === 'function') {
        window.notifyIframeAuthChange(authenticated, user);
    }
}

// Custom protocol handler for kahana:// URLs
function handleKahanaProtocol(url) {
    console.log('Received kahana:// protocol URL:', url);
    
    if (url.startsWith('kahana://auth-callback')) {
        // Parse the URL to extract auth parameters
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);
        
        // Check for error
        const error = params.get('error');
        const errorDescription = params.get('error_description');
        
        // Check for success
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const code = params.get('code');
        
        if (error) {
            console.error('OAuth error:', error, errorDescription);
            showAuthError(`Authentication failed: ${error}`);
        } else if (accessToken || code) {
            console.log('OAuth success, tokens received');
            // The Supabase client should automatically handle the session
            // We'll let the auth state change listener handle the rest
            showAuthSuccess('Authentication successful!');
        } else {
            console.log('No auth parameters found in callback');
            showAuthError('No authentication data received');
        }
    }
}

// Simple OAuth flow - no complex message handling needed
// The user will complete OAuth in a new tab, then we'll check their auth status

// Check for auth callback data in localStorage
// Check for auth callback data in localStorage
function checkForAuthCallback() {
    try {
        const authData = localStorage.getItem('oasis_auth_callback');
        if (authData) {
            const parsed = JSON.parse(authData);
            // Only process if it's recent (within last 30 seconds)
            if (parsed.timestamp && (Date.now() - parsed.timestamp) < 30000) {
                console.log('Found recent auth callback data:', parsed);
                handleAuthSuccess(parsed);
                // Clear the data after processing
                localStorage.removeItem('oasis_auth_callback');
            }
        }
    } catch (e) {
        // Don't spam the console with localStorage errors (common in some contexts)
        // Check for NS_ERROR_NOT_AVAILABLE (0x80040111)
        if (e.name === 'NS_ERROR_NOT_AVAILABLE' || 
            e.message?.includes('NS_ERROR_NOT_AVAILABLE') || 
            e.result === 2147746065) {
            // Silently ignore
        } else {
            console.error('Error checking auth callback:', e);
        }
    }
}

// Check for auth callback data when the page loads
checkForAuthCallback();

// Subscribe to Supabase auth state changes
if (window.supabaseAuth) {
    console.log("Subscribing to Supabase auth state changes...");
    window.supabaseAuth.onAuthStateChange((authState) => {
        console.log("UI received auth state change:", authState.isAuthenticated);
        
        if (authState.isAuthenticated && authState.session) {
            console.log("Auth state is authenticated, saving session...");
            securelySaveSession(authState.session);
            updateAuthUI(true, authState.user);
        } else if (!authState.isAuthenticated) {
            console.log("Auth state is unauthenticated...");
            // Only clear the secure session if we've finished our initial check
            // This prevents the initial "no session" state from wiping our saved session
            if (initialAuthCheckComplete) {
                console.log("Clearing secure session (user explicitly logged out or session expired)");
                securelyClearSession();
            } else {
                console.log("Skipping secure session clear (initial check pending)");
            }
            updateAuthUI(false);
        }
    });
}

// Also check periodically in case the message was missed (disabled due to localStorage issues)
// setInterval(checkForAuthCallback, 2000);

// Check for OAuth callback data in localStorage (fallback for postMessage issues)
function checkOAuthCallbackData() {
    try {
        const callbackData = localStorage.getItem('oasis_auth_callback');
        if (callbackData) {
            const authData = JSON.parse(callbackData);
            console.log('Found OAuth callback data in localStorage:', authData);
            
            // Process the auth data
            if (window.supabaseAuth && window.supabaseAuth.handleOAuthCallbackData) {
                window.supabaseAuth.handleOAuthCallbackData(authData).then(result => {
                    if (result.success) {
                        showAuthSuccess('Authentication successful! You are now signed in.');
                        // Clear the localStorage data
                        localStorage.removeItem('oasis_auth_callback');
                        // Refresh the auth state
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    } else {
                        showAuthError(`Authentication failed: ${result.error}`);
                    }
                });
            }
        }
    } catch (e) {
        // Don't spam the console with localStorage errors
        if (!e.message.includes('NS_ERROR_NOT_AVAILABLE')) {
            console.error('Error checking OAuth callback data:', e);
        }
    }
}

// Check for OAuth callback data periodically (disabled due to localStorage issues)
// setInterval(checkOAuthCallbackData, 1000);

// Listen for OAuth callback messages from the redirect page
window.addEventListener('message', async (event) => {
    // Only accept messages from our OAuth callback page
    if (event.origin !== 'https://kahana.co') {
        return;
    }
    
    if (event.data && event.data.type === 'oauth-success') {
        console.log('Received OAuth success message:', event.data.data);
        
        // Use the new OAuth callback handler
        if (window.supabaseAuth && window.supabaseAuth.handleOAuthCallbackData) {
            const result = await window.supabaseAuth.handleOAuthCallbackData(event.data.data);
            if (result.success) {
                showAuthSuccess('Authentication successful! You are now signed in.');
                // Refresh the auth state
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                showAuthError(`Authentication failed: ${result.error}`);
            }
        } else {
            // Fallback to old method
            handleAuthSuccess(event.data.data);
        }
    }
});

// Check Authentication button and feature removed

// Handle successful authentication
function handleAuthSuccess(authData) {
    console.log('Handling auth success:', authData);
    
    // Show success message
    showAuthSuccess('Authentication successful! Signing you in...');
    
    // The Supabase client should automatically detect the session change
    // We'll let the auth state change listener handle the rest
    // But we can also try to refresh the auth state manually
    if (window.supabaseAuth) {
        window.supabaseAuth.getCurrentUser().then(user => {
            if (user) {
                console.log('User authenticated:', user.email);
                // Update the UI to show authenticated state
                updateAuthUI(true, user);
                
                // Save session if available
                window.supabaseAuth.supabase.auth.getSession().then(({ data }) => {
                    if (data.session) {
                        securelySaveSession(data.session);
                    }
                });
            }
        }).catch(error => {
            console.error('Error getting current user:', error);
        });
    }
}

// Helper functions for auth feedback
function showAuthSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #51cf66;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10000;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.parentNode.removeChild(successDiv);
        }
    }, 3000);
}

function showAuthError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff6b6b;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10000;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

// Create draggable top bar with window controls
const authHeader = document.createElement("div");
authHeader.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 35px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: #F0F6F1;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.20);
  cursor: grab;
  z-index: 2147483647;
  pointer-events: auto;
  box-sizing: border-box;
  margin: 16px;
`;
document.body.appendChild(authHeader);

// Add padding to main content to account for fixed header
const mainElement = log.parentElement;
mainElement.style.paddingTop = "64px";

// Left side: Logo + Title
const leftSection = document.createElement("div");
leftSection.style.cssText = `
  display: flex;
  align-items: center;
  gap: 8px;
`;

// Sloth logo
const logoContainer = document.createElement("div");
logoContainer.style.cssText = `
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
`;
logoContainer.innerHTML = `
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="16.5" cy="16.5" rx="12.5" ry="10.5" fill="#978455"/>
    <ellipse cx="16.5" cy="18.5" rx="10.5" ry="8.5" fill="#F8FAF2"/>
    <ellipse cx="10.3268" cy="19.2453" rx="2.45004" ry="5.0274" transform="rotate(46.2818 10.3268 19.2453)" fill="#978455"/>
    <circle cx="1" cy="1" r="1" transform="matrix(1 0 0 -1 12 18)" fill="#F8FAF2"/>
    <ellipse cx="2.45004" cy="5.0274" rx="2.45004" ry="5.0274" transform="matrix(-0.691112 0.722747 0.722747 0.691112 20.7334 14)" fill="#978455"/>
    <circle cx="1" cy="1" r="1" transform="matrix(1 0 0 -1 19 18)" fill="#F8FAF2"/>
  </svg>
`;
leftSection.appendChild(logoContainer);

// Title
const titleText = document.createElement("p");
titleText.textContent = "Oasis AI";
titleText.style.cssText = `
  margin: 0;
  font-size: 16px;
  font-weight: 400;
  color: var(--text-headings, #333);
  line-height: 24px;
`;
leftSection.appendChild(titleText);

authHeader.appendChild(leftSection);

// Right side: Window controls + Menu buttons
const rightSection = document.createElement("div");
rightSection.style.cssText = `
  display: flex;
  align-items: center;
  gap: 8px;
`;

// Minimize button
const minimizeBtn = document.createElement("button");
minimizeBtn.innerHTML = `−`;
minimizeBtn.title = "Minimize";
minimizeBtn.style.cssText = `
  border: 0;
  background: #F0F6F1;
  cursor: pointer;
  pointer-events: auto;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 14px;
  color: #333;
  transition: background-color 0.2s ease;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
`;
minimizeBtn.addEventListener("mouseenter", () => {
  minimizeBtn.style.backgroundColor = "#E5E7EB";
});
minimizeBtn.addEventListener("mouseleave", () => {
  minimizeBtn.style.backgroundColor = "#F0F6F1";
});

let minimizeClickTimeout = null;
minimizeBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  
  // Debounce to prevent double-clicks
  if (minimizeClickTimeout) {
    console.log("Minimize click ignored (debounce)");
    return;
  }
  
  console.log("Minimize button clicked, parent:", window.parent !== window);
  try {
    window.parent.postMessage({ type: "oasisOverlayMinimize" }, "*");
    console.log("Minimize message sent successfully");
    
    // Set debounce timeout
    minimizeClickTimeout = setTimeout(() => {
      minimizeClickTimeout = null;
    }, 300);
  } catch (err) {
    console.error("Error sending minimize message:", err);
  }
}, true);
rightSection.appendChild(minimizeBtn);

// Maximize/Expand button with toggle
let isMaximized = false;
const expandBtn = document.createElement("button");
expandBtn.innerHTML = `⛶`;
expandBtn.title = "Maximize";
expandBtn.style.cssText = `
  border: 0;
  background: #F0F6F1;
  cursor: pointer;
  pointer-events: auto;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 14px;
  color: #333;
  transition: background-color 0.2s ease;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
`;
expandBtn.addEventListener("mouseenter", () => {
  expandBtn.style.backgroundColor = "#E5E7EB";
});
expandBtn.addEventListener("mouseleave", () => {
  expandBtn.style.backgroundColor = "#F0F6F1";
});

let expandClickTimeout = null;
expandBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  
  // Debounce to prevent double-clicks
  if (expandClickTimeout) {
    console.log("Expand click ignored (debounce)");
    return;
  }
  
  console.log("Expand button clicked, isMaximized:", isMaximized, "parent:", window.parent !== window);
  try {
    if (isMaximized) {
      // Restore to normal size
      window.parent.postMessage({ type: "oasisOverlayExitFullscreen" }, "*");
      expandBtn.title = "Maximize";
      isMaximized = false;
      console.log("Restore message sent successfully");
    } else {
      // Maximize
      window.parent.postMessage({ type: "oasisOverlayExpand" }, "*");
      expandBtn.title = "Restore";
      isMaximized = true;
      console.log("Maximize message sent successfully");
    }
    
    // Set debounce timeout
    expandClickTimeout = setTimeout(() => {
      expandClickTimeout = null;
    }, 300);
  } catch (err) {
    console.error("Error sending expand message:", err);
  }
}, true);
rightSection.appendChild(expandBtn);

// Close button
const closeBtn = document.createElement("button");
closeBtn.innerHTML = `✕`;
closeBtn.title = "Close";
closeBtn.style.cssText = `
  border: 0;
  background: #F0F6F1;
  cursor: pointer;
  pointer-events: auto;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 14px;
  color: #333;
  transition: background-color 0.2s ease;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
`;
closeBtn.addEventListener("mouseenter", () => {
  closeBtn.style.backgroundColor = "#E5E7EB";
});
closeBtn.addEventListener("mouseleave", () => {
  closeBtn.style.backgroundColor = "#F0F6F1";
});

let closeClickTimeout = null;
closeBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  
  // Debounce to prevent double-clicks
  if (closeClickTimeout) {
    console.log("Close click ignored (debounce)");
    return;
  }
  
  console.log("Close button clicked, parent:", window.parent !== window);
  try {
    window.parent.postMessage({ type: "oasisOverlayClose" }, "*");
    console.log("Close message sent successfully");
    
    // Set debounce timeout
    closeClickTimeout = setTimeout(() => {
      closeClickTimeout = null;
    }, 300);
  } catch (err) {
    console.error("Error sending close message:", err);
  }
}, true);
rightSection.appendChild(closeBtn);

// Separator
const separator = document.createElement("div");
separator.style.cssText = `
  width: 1px;
  height: 20px;
  background: #E5E7EB;
  margin: 0 4px;
`;
rightSection.appendChild(separator);

// Three-dot menu button
const menuButton = document.createElement("button");
menuButton.className = "menu-btn";
menuButton.innerHTML = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="6" r="1.5" fill="#333"/>
    <circle cx="12" cy="12" r="1.5" fill="#333"/>
    <circle cx="12" cy="18" r="1.5" fill="#333"/>
  </svg>
`;
menuButton.style.cssText = `
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s ease;
`;
menuButton.addEventListener("mouseenter", () => {
  menuButton.style.opacity = "0.7";
});
menuButton.addEventListener("mouseleave", () => {
  menuButton.style.opacity = "1";
});
rightSection.appendChild(menuButton);

authHeader.appendChild(rightSection);

// Make header draggable - RAF smoothing with light damping
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let accumulatedDeltaX = 0;
let accumulatedDeltaY = 0;
let rafId = null;

const DRAG_DAMPING = 0.88; // Light damping for smooth, responsive feel

function sendDragUpdate() {
  if (!isDragging) {
    rafId = null;
    return;
  }
  
  if (Math.abs(accumulatedDeltaX) > 0.1 || Math.abs(accumulatedDeltaY) > 0.1) {
    window.parent.postMessage({
      type: "oasisOverlayMoveRelative",
      deltaX: accumulatedDeltaX,
      deltaY: accumulatedDeltaY
    }, "*");
    
    accumulatedDeltaX = 0;
    accumulatedDeltaY = 0;
  }
  
  rafId = requestAnimationFrame(sendDragUpdate);
}

authHeader.addEventListener("mousedown", (e) => {
  // Don't start drag when clicking buttons or menu
  if (e.target.closest('button') || e.target.closest('.dropdown-menu')) {
    console.log("Skipping drag - clicked on button/menu");
    return;
  }
  console.log("Starting drag");
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  accumulatedDeltaX = 0;
  accumulatedDeltaY = 0;
  authHeader.style.cursor = "grabbing";
  e.preventDefault();
  e.stopPropagation();
  
  if (!rafId) {
    rafId = requestAnimationFrame(sendDragUpdate);
  }
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  
  const deltaX = (e.clientX - lastMouseX) * DRAG_DAMPING;
  const deltaY = (e.clientY - lastMouseY) * DRAG_DAMPING;
  
  accumulatedDeltaX += deltaX;
  accumulatedDeltaY += deltaY;
  
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

document.addEventListener("mouseup", () => {
  if (isDragging) {
    console.log("Ending drag");
    isDragging = false;
    authHeader.style.cursor = "grab";
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
});

// Create authentication banner (shown when authenticated)
const authBanner = document.createElement("div");
authBanner.id = "authBanner";
authBanner.style.cssText = `
  display: none;
  background-color: #f2f4e5;
  padding: 8px 16px;
  border-radius: 8px;
  margin-top: 8px;
  align-items: center;
  gap: 8px;
`;

const bannerText = document.createElement("p");
bannerText.style.cssText = `
  margin: 0;
  font-size: 12px;
  color: #808080;
  line-height: 20px;
  flex: 1;
  display: flex;
  gap: 4px;
  align-items: center;
`;

const signedInLabel = document.createElement("span");
signedInLabel.textContent = "Signed in as";
bannerText.appendChild(signedInLabel);

const userEmail = document.createElement("span");
userEmail.id = "bannerUserEmail";
userEmail.style.cssText = `
  text-decoration: underline;
  color: #808080;
`;
bannerText.appendChild(userEmail);

authBanner.appendChild(bannerText);

// Close button for banner
const bannerCloseBtn = document.createElement("button");
bannerCloseBtn.innerHTML = `
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4L4 12M4 4L12 12" stroke="#7A9200" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
`;
bannerCloseBtn.style.cssText = `
  width: 24px;
  height: 24px;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 64px;
  transition: background-color 0.2s ease;
`;
bannerCloseBtn.addEventListener("mouseenter", () => {
  bannerCloseBtn.style.backgroundColor = "rgba(122, 146, 0, 0.1)";
});
bannerCloseBtn.addEventListener("mouseleave", () => {
  bannerCloseBtn.style.backgroundColor = "transparent";
});
bannerCloseBtn.addEventListener("click", () => {
  authBanner.style.display = "none";
  // Store preference to not show banner again in this session
  sessionStorage.setItem("hideBanner", "true");
});
authBanner.appendChild(bannerCloseBtn);

// Insert banner after header
log.parentElement.insertBefore(authBanner, log);

// Hidden auth buttons for login/signup (will be shown in dropdown)
const authButtons = document.createElement("div");
authButtons.id = "authButtons";
authButtons.style.display = "none";

const loginButton = document.createElement("button");
loginButton.textContent = "Sign In";
loginButton.className = "login-btn";
authButtons.appendChild(loginButton);

const signupButton = document.createElement("button");
signupButton.textContent = "Sign Up";
signupButton.className = "signup-btn";
authButtons.appendChild(signupButton);

// Hidden auth status (for backwards compatibility)
const authStatus = document.createElement("div");
authStatus.id = "authStatus";
authStatus.style.display = "none";

// Create dropdown menu
const dropdownMenu = document.createElement("div");
dropdownMenu.className = "dropdown-menu";
dropdownMenu.style.cssText = `
  display: none;
  position: absolute;
  top: 48px;
  right: 10px;
  background-color: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1), 0 4px 10px rgba(0,0,0,0.05);
  z-index: 1000;
  overflow: hidden;
  min-width: 160px;
`;
document.body.appendChild(dropdownMenu);

// Function to update dropdown menu based on auth state
function updateDropdownMenu() {
    dropdownMenu.innerHTML = "";
    
    if (isAuthenticated && currentUser) {
        // Show user info
        const userInfo = document.createElement("div");
        userInfo.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid #e5e7eb;
            background: #f9fafb;
        `;
        userInfo.innerHTML = `
            <div style="font-size: 13px; color: #6b7280;">Signed in as</div>
            <div style="font-size: 14px; font-weight: 500; color: #333; margin-top: 2px;">${currentUser.email}</div>
        `;
        dropdownMenu.appendChild(userInfo);
        
        // Authenticated menu items
        const authenticatedItems = [
            { label: "Account", action: () => { alert("Account settings coming soon"); dropdownMenu.style.display = "none"; }},
            { label: "Settings", action: () => { alert("Settings coming soon"); dropdownMenu.style.display = "none"; }},
            { label: "Sign Out", action: () => {
                logout();
                securelyClearSession();
                dropdownMenu.style.display = "none";
            }}
        ];
        
        authenticatedItems.forEach((item, index) => {
            const menuItem = document.createElement("a");
            menuItem.textContent = item.label;
            menuItem.style.cssText = `
                display: block;
                padding: 10px 16px;
                color: ${item.label === "Sign Out" ? "#ef4444" : "#374151"};
                text-decoration: none;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.15s ease;
                ${index < authenticatedItems.length - 1 ? "border-bottom: 1px solid #f3f4f6;" : ""}
            `;
            menuItem.addEventListener("mouseenter", () => {
                menuItem.style.backgroundColor = item.label === "Sign Out" ? "#fee2e2" : "#f9fafb";
            });
            menuItem.addEventListener("mouseleave", () => {
                menuItem.style.backgroundColor = "transparent";
            });
            menuItem.addEventListener("click", item.action);
            dropdownMenu.appendChild(menuItem);
        });
    } else {
        // Not authenticated menu items
        const unauthenticatedItems = [
            { label: "Sign In", action: () => {
                showLoginForm();
                dropdownMenu.style.display = "none";
            }},
            { label: "Sign Up", action: () => {
                showSignupForm();
                dropdownMenu.style.display = "none";
            }}
        ];
        
        unauthenticatedItems.forEach((item, index) => {
            const menuItem = document.createElement("a");
            menuItem.textContent = item.label;
            menuItem.style.cssText = `
                display: block;
                padding: 12px 16px;
                color: #374151;
                text-decoration: none;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.15s ease;
                ${index === 0 ? "border-bottom: 1px solid #e5e7eb;" : ""}
            `;
            menuItem.addEventListener("mouseenter", () => {
                menuItem.style.backgroundColor = "#f9fafb";
            });
            menuItem.addEventListener("mouseleave", () => {
                menuItem.style.backgroundColor = "transparent";
            });
            menuItem.addEventListener("click", item.action);
            dropdownMenu.appendChild(menuItem);
        });
    }
}

// Toggle dropdown menu
menuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    const isDisplayed = dropdownMenu.style.display === "block";
    dropdownMenu.style.display = isDisplayed ? "none" : "block";
    if (!isDisplayed) {
        updateDropdownMenu();
    }
});

// Hide dropdown if clicked outside
document.addEventListener("click", (event) => {
    if (!menuButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
        dropdownMenu.style.display = "none";
    }
});


// Legacy append function for backward compatibility
function append(text) {
  // For system messages, create a simple text node
  if (text.includes('🔓') || text.includes('Session') || text.includes('📚')) {
    const systemMsg = document.createElement("div");
    systemMsg.style.cssText = `
      color: #999;
      font-size: 12px;
      text-align: center;
      margin: 8px 0;
    `;
    systemMsg.textContent = text.trim();
    log.appendChild(systemMsg);
  }
  log.scrollTop = log.scrollHeight;
}

// Add user message bubble
function addUserMessage(text) {
  const messageContainer = document.createElement("div");
  messageContainer.className = "message-bubble message-user";
  
  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  messageContent.textContent = text;
  
  messageContainer.appendChild(messageContent);
  log.appendChild(messageContainer);
  log.scrollTop = log.scrollHeight;
}

// Add AI response bubble
function addAIMessage(text) {
  const messageContainer = document.createElement("div");
  messageContainer.className = "message-bubble message-ai";
  
  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  messageContent.textContent = text;
  
  messageContainer.appendChild(messageContent);
  log.appendChild(messageContainer);
  log.scrollTop = log.scrollHeight;
  
  return messageContent; // Return reference for streaming updates
}

// Update existing AI message (for streaming)
function updateAIMessage(element, text) {
  if (element && element.classList.contains('message-content')) {
    element.textContent = text;
    log.scrollTop = log.scrollHeight;
  }
}


// Show Google OAuth instructions
function showGoogleOAuthInstructions(oauthUrl) {
  const instructions = document.createElement("div");
  instructions.style.cssText = "display: flex; flex-direction: column; gap: 20px; text-align: center;";
  
  const title = document.createElement("h3");
  title.textContent = "Complete Google Sign-In";
  title.style.cssText = "margin: 0; color: #1f2937; font-size: 20px; font-weight: 600;";
  
  const description = document.createElement("p");
  description.textContent = "Click the button below to open Google sign-in in a new tab:";
  description.style.cssText = "margin: 0; color: #6b7280; font-size: 16px;";
  
  const openButton = document.createElement("button");
  openButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    Open Google Sign-In
  `;
  openButton.style.cssText = `
    background: #4285F4;
    color: white;
    border: none;
    padding: 14px 28px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    transition: background-color 0.2s;
  `;
  
  openButton.addEventListener("click", () => {
    // Try to open in new tab
    try {
      window.open(oauthUrl, '_blank');
      // Close the modal
      document.body.removeChild(document.querySelector('.modal'));
    } catch (error) {
      console.log('Could not open URL directly:', error);
      // Fallback: copy to clipboard and show instructions
      navigator.clipboard.writeText(oauthUrl).then(() => {
        alert('URL copied to clipboard! Please paste it in a new tab.');
      }).catch(() => {
        alert('Please manually copy this URL and open it in a new tab: ' + oauthUrl);
      });
    }
  });
  
  const note = document.createElement("p");
  note.textContent = "After completing authentication, return here and you will be automatically signed in.";
  note.style.cssText = "margin: 0; color: #6b7280; font-size: 14px; font-style: italic;";
  
  instructions.appendChild(title);
  instructions.appendChild(description);
  instructions.appendChild(openButton);
  instructions.appendChild(note);
  
  const { modal } = createModal("Google Sign-In", instructions);
}

// Create modal dialog system
function createModal(title, content) {
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;
  
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 24px;
    min-width: 400px;
    max-width: 500px;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
  `;
  
  const header = document.createElement("div");
  header.style.cssText = `
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 20px;
    text-align: center;
  `;
  header.textContent = title;
  
  dialog.appendChild(header);
  dialog.appendChild(content);
  modal.appendChild(dialog);
  
  // Close on background click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
  
  document.body.appendChild(modal);
  return { modal, dialog };
}

function showLoginForm() {
  const form = document.createElement("form");
  form.style.cssText = "display: flex; flex-direction: column; gap: 16px;";
  
  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.placeholder = "Enter your email";
  emailInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  emailInput.addEventListener("focus", () => {
    emailInput.style.borderColor = "#667eea";
  });
  emailInput.addEventListener("blur", () => {
    emailInput.style.borderColor = "#e5e7eb";
  });
  
  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.placeholder = "Enter your password";
  passwordInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  passwordInput.addEventListener("focus", () => {
    passwordInput.style.borderColor = "#667eea";
  });
  passwordInput.addEventListener("blur", () => {
    passwordInput.style.borderColor = "#e5e7eb";
  });
  
  // Divider
  const divider = document.createElement("div");
  divider.style.cssText = `
    display: flex;
    align-items: center;
    margin: 16px 0;
    color: #6b7280;
    font-size: 14px;
  `;
  divider.innerHTML = `
    <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
    <span style="margin: 0 16px;">or</span>
    <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
  `;
  
  // Google Sign-In button
  const googleButton = document.createElement("button");
  googleButton.type = "button";
  googleButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" style="margin-right: 8px;">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    Continue with Google
  `;
  googleButton.style.cssText = `
    width: 100%;
    background: white;
    color: #374151;
    border: 2px solid #e5e7eb;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  `;
  googleButton.addEventListener("mouseenter", () => {
    googleButton.style.borderColor = "#d1d5db";
    googleButton.style.backgroundColor = "#f9fafb";
  });
  googleButton.addEventListener("mouseleave", () => {
    googleButton.style.borderColor = "#e5e7eb";
    googleButton.style.backgroundColor = "white";
  });
  
  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = "display: flex; gap: 12px; margin-top: 8px;";
  
  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.textContent = "Sign In";
  submitButton.style.cssText = `
    flex: 1;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
  `;
  submitButton.addEventListener("mouseenter", () => {
    submitButton.style.transform = "translateY(-1px)";
  });
  submitButton.addEventListener("mouseleave", () => {
    submitButton.style.transform = "translateY(0)";
  });
  
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.style.cssText = `
    flex: 1;
    background: #f3f4f6;
    color: #374151;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
  `;
  cancelButton.addEventListener("mouseenter", () => {
    cancelButton.style.background = "#e5e7eb";
  });
  cancelButton.addEventListener("mouseleave", () => {
    cancelButton.style.background = "#f3f4f6";
  });
  
  buttonContainer.appendChild(submitButton);
  buttonContainer.appendChild(cancelButton);
  
  form.appendChild(emailInput);
  form.appendChild(passwordInput);
  form.appendChild(divider);
  form.appendChild(googleButton);
  form.appendChild(buttonContainer);
  
  const { modal } = createModal("Sign In to Oasis", form);
  
  cancelButton.addEventListener("click", () => {
    document.body.removeChild(modal);
  });
  
  googleButton.addEventListener("click", () => {
    document.body.removeChild(modal);
    
    // Use Supabase auth from window
    window.supabaseAuth.signInWithGoogle().then(({ user, error }) => {
      if (error) {
        const errorMessage = window.supabaseAuth.handleAuthError(error);
        
        // Check if this is the special OAuth URL case
        if (errorMessage.startsWith('GOOGLE_OAUTH_URL:')) {
          const oauthUrl = errorMessage.replace('GOOGLE_OAUTH_URL:', '');
          showGoogleOAuthInstructions(oauthUrl);
        } else {
          append(`\n❌ Google sign in failed: ${errorMessage}\n`);
        }
      } else {
        append(`\n🔄 Redirecting to Google for authentication...\n`);
      }
    });
  });
  
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) return;
    
    document.body.removeChild(modal);
    
    // Use Supabase auth from window
    window.supabaseAuth.signInWithEmail(email, password).then(({ user, error }) => {
      if (error) {
        append(`\n❌ Sign in failed: ${window.supabaseAuth.handleAuthError(error)}\n`);
      } else if (user) {
        isAuthenticated = true;
        currentUser = user;
        
        // Save session immediately
        window.supabaseAuth.getSession().then(session => {
            if (session) {
                securelySaveSession(session);
            }
        });

        updateAuthUI(true, user);
        append(`\n🔓 Signed in as ${user.email}\n`);
      }
    });
  });
  
  // Focus first input
  setTimeout(() => emailInput.focus(), 100);
}

function showSignupForm() {
  const form = document.createElement("form");
  form.style.cssText = "display: flex; flex-direction: column; gap: 16px;";
  
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Enter your name (optional)";
  nameInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  nameInput.addEventListener("focus", () => {
    nameInput.style.borderColor = "#667eea";
  });
  nameInput.addEventListener("blur", () => {
    nameInput.style.borderColor = "#e5e7eb";
  });
  
  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.placeholder = "Enter your email";
  emailInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  emailInput.addEventListener("focus", () => {
    emailInput.style.borderColor = "#667eea";
  });
  emailInput.addEventListener("blur", () => {
    emailInput.style.borderColor = "#e5e7eb";
  });
  
  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.placeholder = "Enter your password (min 6 characters)";
  passwordInput.style.cssText = `
    padding: 12px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s;
  `;
  passwordInput.addEventListener("focus", () => {
    passwordInput.style.borderColor = "#667eea";
  });
  passwordInput.addEventListener("blur", () => {
    passwordInput.style.borderColor = "#e5e7eb";
  });
  
  // Divider
  const divider = document.createElement("div");
  divider.style.cssText = `
    display: flex;
    align-items: center;
    margin: 16px 0;
    color: #6b7280;
    font-size: 14px;
  `;
  divider.innerHTML = `
    <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
    <span style="margin: 0 16px;">or</span>
    <div style="flex: 1; height: 1px; background: #e5e7eb;"></div>
  `;
  
  // Google Sign-In button
  const googleButton = document.createElement("button");
  googleButton.type = "button";
  googleButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" style="margin-right: 8px;">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    Continue with Google
  `;
  googleButton.style.cssText = `
    width: 100%;
    background: white;
    color: #374151;
    border: 2px solid #e5e7eb;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  `;
  googleButton.addEventListener("mouseenter", () => {
    googleButton.style.borderColor = "#d1d5db";
    googleButton.style.backgroundColor = "#f9fafb";
  });
  googleButton.addEventListener("mouseleave", () => {
    googleButton.style.borderColor = "#e5e7eb";
    googleButton.style.backgroundColor = "white";
  });
  
  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = "display: flex; gap: 12px; margin-top: 8px;";
  
  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.textContent = "Create Account";
  submitButton.style.cssText = `
    flex: 1;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
  `;
  submitButton.addEventListener("mouseenter", () => {
    submitButton.style.transform = "translateY(-1px)";
  });
  submitButton.addEventListener("mouseleave", () => {
    submitButton.style.transform = "translateY(0)";
  });
  
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.style.cssText = `
    flex: 1;
    background: #f3f4f6;
    color: #374151;
    border: none;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
  `;
  cancelButton.addEventListener("mouseenter", () => {
    cancelButton.style.background = "#e5e7eb";
  });
  cancelButton.addEventListener("mouseleave", () => {
    cancelButton.style.background = "#f3f4f6";
  });
  
  buttonContainer.appendChild(submitButton);
  buttonContainer.appendChild(cancelButton);
  
  form.appendChild(nameInput);
  form.appendChild(emailInput);
  form.appendChild(passwordInput);
  form.appendChild(divider);
  form.appendChild(googleButton);
  form.appendChild(buttonContainer);
  
  const { modal } = createModal("Create Oasis Account", form);
  
  cancelButton.addEventListener("click", () => {
    document.body.removeChild(modal);
  });
  
  googleButton.addEventListener("click", () => {
    document.body.removeChild(modal);
    
    // Use Supabase auth from window
    window.supabaseAuth.signInWithGoogle().then(({ user, error }) => {
      if (error) {
        const errorMessage = window.supabaseAuth.handleAuthError(error);
        
        // Check if this is the special OAuth URL case
        if (errorMessage.startsWith('GOOGLE_OAUTH_URL:')) {
          const oauthUrl = errorMessage.replace('GOOGLE_OAUTH_URL:', '');
          showGoogleOAuthInstructions(oauthUrl);
        } else {
          append(`\n❌ Google sign in failed: ${errorMessage}\n`);
        }
      } else {
        append(`\n🔄 Redirecting to Google for authentication...\n`);
      }
    });
  });
  
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if (!email || !password) return;
    
    document.body.removeChild(modal);
    
    // Use Supabase auth from window
    window.supabaseAuth.signUp(email, password, name || undefined).then(({ user, error }) => {
      if (error) {
        append(`\n❌ Sign up failed: ${window.supabaseAuth.handleAuthError(error)}\n`);
        append(`\nDebug info: ${JSON.stringify(error, null, 2)}\n`);
      } else if (user) {
        append(`\n✅ Account created! Please check your email to confirm your account.\n`);
        append(`\nUser ID: ${user.id}\n`);
      } else {
        append(`\n⚠️ Sign up completed but no user returned. Check your email for confirmation.\n`);
      }
    }).catch((err) => {
      append(`\n❌ Sign up error: ${err.message}\n`);
    });
  });
  
  // Focus first input
  setTimeout(() => nameInput.focus(), 100);
}

async function logout() {
  // Use Supabase auth from window
  const { error } = await window.supabaseAuth.signOut();
  
  if (error) {
    append(`\n❌ Logout failed: ${error.message}\n`);
  } else {
    isAuthenticated = false;
    currentUser = null;
    updateAuthUI();
    append(`\n🔒 Logged out\n`);
  }
}

let currentAIMessageElement = null;

async function send() {
  if (busy) return;
  
  // Check authentication - both local state and global state
  if (!isAuthenticated || !window.oasisAuthState?.isAuthenticated) {
    append("\n❌ Authentication required: Please sign in to use the AI assistant\n");
    append("🔒 This protects our API tokens from unauthorized usage\n");
    return;
  }
  
  const prompt = q.value.trim();
  if (!prompt) return;
  q.value = "";
  
  // Add user message bubble
  addUserMessage(prompt);
  
  stopped = false;
  setBusy(true);

  // Create AI response bubble
  currentAIMessageElement = addAIMessage("");
  let fullResponse = "";

  try {
    // Double-check authentication before making the API call
    if (!window.oasisAuthState?.isAuthenticated) {
      throw new Error('Authentication lost during request. Please sign in again.');
    }
    
    // Session context is automatically managed
    await runAssistantStream(prompt, (chunk) => {
      if (!stopped) {
        fullResponse += chunk;
        updateAIMessage(currentAIMessageElement, fullResponse);
        
        // Forward the chunk to iframe if it exists
        if (typeof window.notifyIframeCommandResult === 'function') {
          window.notifyIframeCommandResult(chunk);
        }
      }
    });
    
    if (!stopped) {
      // Forward completion to iframe
      if (typeof window.notifyIframeCommandResult === 'function') {
        window.notifyIframeCommandResult("\n");
      }
    }
  } catch (e) {
    const errorMessage = e?.message?.includes('Authentication required') 
      ? `🔒 ${e.message}\nPlease sign in to continue using the AI assistant.`
      : `Error: ${e?.message || e}`;
    
    updateAIMessage(currentAIMessageElement, errorMessage);
    
    // Forward error to iframe if we're in main window
    if (!window.isInIframe && typeof window.notifyIframeCommandResult === 'function') {
      window.notifyIframeCommandResult(null, errorMessage);
    }
  } finally {
    setBusy(false);
    currentAIMessageElement = null;
  }
}

go.addEventListener("click", () => {
  if (busy) {
    // Stop the current operation
    stopped = true;
    setBusy(false);
    append("\n(stopped)\n");
  } else {
    // Send message
    send();
  }
});
q.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
loginButton.addEventListener("click", showLoginForm);
signupButton.addEventListener("click", showSignupForm);

// Initialize UI - start with unauthenticated state
updateAuthUI(false, null);

// Check for existing authentication on load
async function checkExistingAuth() {
  try {
    const user = await window.supabaseAuth.getCurrentUser();
    if (user) {
      isAuthenticated = true;
      currentUser = user;
      updateAuthUI(true, user);
      append(`\n🔓 Already logged in as ${user.email}\n`);
    }
  } catch (error) {
    console.error('Error checking existing auth:', error);
  }
}

checkExistingAuth();

// Setup cross-frame authentication synchronization
setupCrossFrameAuthSync();

// Add a function to manually refresh auth state (for debugging)
window.refreshAuthState = async function() {
    console.log('Manually refreshing authentication state...');
    try {
        const user = await window.supabaseAuth.getCurrentUser();
        console.log('Current user from Supabase:', user);
        
        if (user) {
            isAuthenticated = true;
            currentUser = user;
            updateAuthUI(true, user);
            console.log('Updated UI to authenticated state');
        } else {
            isAuthenticated = false;
            currentUser = null;
            updateAuthUI(false);
            console.log('Updated UI to unauthenticated state');
        }
    } catch (error) {
        console.error('Error refreshing auth state:', error);
    }
};

// Add a function to force update the UI (for debugging)
window.forceUpdateUI = function() {
    console.log('Force updating UI with current state...');
    console.log('Current state:', { isAuthenticated, currentUser: currentUser?.email });
    updateAuthUI(isAuthenticated, currentUser);
};
