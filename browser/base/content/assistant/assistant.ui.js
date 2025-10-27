import { runAssistantStream, resetAssistantSession } from "./assistant.bundle.js";

// SupabaseAuth should be available from the bundle
// The bundle now exposes window.supabaseAuth directly
console.log('SupabaseAuth available:', !!window.supabaseAuth);

// Check current authentication status on page load
async function checkCurrentAuthStatus() {
    if (window.supabaseAuth && window.supabaseAuth.supabase) {
        try {
            const { data: { user }, error } = await window.supabaseAuth.supabase.auth.getUser();
            if (user && !error) {
                console.log('User is already authenticated:', user.email);
                updateAuthUI(true, user);
            } else {
                console.log('User is not authenticated');
                updateAuthUI(false);
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            updateAuthUI(false);
        }
    }
}

// Check auth status after a short delay to ensure everything is loaded
setTimeout(checkCurrentAuthStatus, 1000);

const log = document.getElementById("log");
const q   = document.getElementById("q");
const go  = document.getElementById("go");

// Stop button
const bar = document.getElementById("bar") || q.parentElement;
const stop = document.createElement("button");
stop.textContent = "Stop";
stop.disabled = true;
bar.appendChild(stop);

// Clear context button
const clearContext = document.createElement("button");
clearContext.textContent = "Clear Context";
clearContext.style.marginLeft = "8px";
clearContext.title = "Clear conversation history (start fresh)";
bar.appendChild(clearContext);
clearContext.addEventListener("click", () => {
  resetAssistantSession();
  append("\n🔄 Conversation context cleared. Starting fresh!\n");
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
    
    // Update auth status display - wait for element to exist
    waitForElement('#authStatus').then(authStatus => {
        console.log('Auth status element found:', authStatus);
        const statusSpan = authStatus.querySelector('span:last-child');
        if (statusSpan) {
            if (authenticated) {
                statusSpan.textContent = `Signed in as ${user?.email || 'User'}`;
                statusSpan.style.color = '#51cf66';
                console.log('Updated auth status to authenticated');
            } else {
                statusSpan.textContent = 'Not Authenticated';
                statusSpan.style.color = '#ff6b6b';
                console.log('Updated auth status to not authenticated');
            }
        } else {
            console.warn('Status span not found within authStatus');
        }
    }).catch(error => {
        console.warn('Auth status element not found:', error.message);
    });
    
    // Show/hide auth buttons - wait for element to exist
    waitForElement('#authButtons').then(authButtons => {
        console.log('Auth buttons container found:', authButtons);
        const loginButton = authButtons.querySelector('.login-btn');
        const signupButton = authButtons.querySelector('.signup-btn');
        const menuButton = authButtons.querySelector('.menu-btn');

        if (loginButton) loginButton.style.display = authenticated ? 'none' : 'inline-block';
        if (signupButton) signupButton.style.display = authenticated ? 'none' : 'inline-block';
        if (menuButton) menuButton.style.display = authenticated ? 'inline-block' : 'none';
        
    }).catch(error => {
        console.warn('Auth buttons container not found:', error.message);
    });
    
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
        // Don't spam the console with localStorage errors
        if (!e.message.includes('NS_ERROR_NOT_AVAILABLE')) {
            console.error('Error checking auth callback:', e);
        }
    }
}

// Check for auth callback data when the page loads
checkForAuthCallback();

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

// Add a simple "Check Authentication" button for after OAuth
function addAuthCheckButton() {
    // Check if button already exists
    if (document.getElementById('checkAuthBtn')) {
        return;
    }
    
    // Try to find the auth header, if not found, add it to the log area
    let authHeader = document.getElementById('authHeader');
    if (!authHeader) {
        // Create auth header in the log area
        const log = document.getElementById('log');
        if (log) {
            authHeader = document.createElement('div');
            authHeader.id = 'authHeader';
            authHeader.style.cssText = `
                background: #f3f4f6;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                padding: 12px;
                margin: 8px 0;
                text-align: center;
            `;
            log.appendChild(authHeader);
        } else {
            return;
        }
    }
    
    const checkAuthBtn = document.createElement('button');
    checkAuthBtn.id = 'checkAuthBtn';
    checkAuthBtn.textContent = 'Check Authentication';
    checkAuthBtn.style.cssText = `
        background: #10b981;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        margin-left: 10px;
        font-weight: 500;
    `;
    
    checkAuthBtn.addEventListener('click', async () => {
        // Create a more detailed input dialog for the full OAuth data
        const instructions = `Please copy the FULL callback URL from your browser address bar and paste it here.
        
The URL should look like:
https://kahana.co/oauth-callback#access_token=...&expires_at=...&expires_in=...&provider_token=...&refresh_token=...&token_type=bearer

Or just paste the access_token part if you prefer:`;
        
        const input = prompt(instructions);
        if (input && input.trim()) {
            try {
                console.log('Processing OAuth data manually...');
                
                let authData = {};
                
                // Check if it's a full URL or just a token
                if (input.includes('#')) {
                    // It's a full URL, parse it
                    const url = new URL(input);
                    const hashParams = new URLSearchParams(url.hash.substring(1));
                    
                    authData = {
                        access_token: hashParams.get('access_token'),
                        refresh_token: hashParams.get('refresh_token'),
                        expires_at: hashParams.get('expires_at'),
                        expires_in: hashParams.get('expires_in'),
                        token_type: hashParams.get('token_type'),
                        timestamp: Date.now(),
                        source: 'manual_url'
                    };
                } else {
                    // It's just a token, create minimal auth data
                    authData = {
                        access_token: input.trim(),
                        refresh_token: '', // We'll need to handle this differently
                        timestamp: Date.now(),
                        source: 'manual_token'
                    };
                }
                
                console.log('Auth data:', authData);
                
                // Try to set the session with the auth data
                if (window.supabaseAuth && window.supabaseAuth.supabase && authData.access_token) {
                    console.log('Setting session with auth data...');
                    const { data, error } = await window.supabaseAuth.supabase.auth.setSession({
                        access_token: authData.access_token,
                        refresh_token: authData.refresh_token || ''
                    });
                    
                    if (error) {
                        console.error('Failed to set session:', error.message);
                        showAuthError(`Authentication failed: ${error.message}`);
                    } else {
                        console.log('Session set successfully for user:', data.user?.id);
                        showAuthSuccess('Authentication successful! You are now signed in.');
                        
                        // Update the UI immediately
                        updateAuthUI(true, data.user);
                        
                        // Also reload after a delay to ensure everything is synced
                        setTimeout(() => {
                            window.location.reload();
                        }, 2000);
                    }
                    return;
                }
                
                // Fallback: Use the OAuth callback handler
                if (window.supabaseAuth && window.supabaseAuth.handleOAuthCallbackData) {
                    const result = await window.supabaseAuth.handleOAuthCallbackData(authData);
                    if (result.success) {
                        showAuthSuccess('Authentication successful! You are now signed in.');
                        
                        // Update the UI immediately
                        updateAuthUI(true, data.user);
                        
                        // Also reload after a delay to ensure everything is synced
                        setTimeout(() => {
                            window.location.reload();
                        }, 2000);
                    } else {
                        showAuthError(`Authentication failed: ${result.error}`);
                    }
                } else {
                    showAuthError('Authentication service not available.');
                }
            } catch (error) {
                console.error('Error processing OAuth data:', error);
                showAuthError('Error processing OAuth data. Please try again.');
            }
        }
    });
    
    authHeader.appendChild(checkAuthBtn);
}

// Add the check authentication button
setTimeout(addAuthCheckButton, 1000);

// Also try to add it immediately
addAuthCheckButton();

// Try multiple times to ensure the button gets added
setTimeout(addAuthCheckButton, 2000);
setTimeout(addAuthCheckButton, 3000);

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

// Create a clean authentication header
const authHeader = document.createElement("div");
authHeader.style.cssText = `
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 16px;
  border-radius: 8px 8px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
`;
bar.parentElement.insertBefore(authHeader, bar);

// Auth status display
const authStatus = document.createElement("div");
authStatus.id = "authStatus";
authStatus.style.cssText = "display: flex; align-items: center; gap: 8px;";
authStatus.innerHTML = `
  <span style="font-size: 16px;">🔒</span>
  <span>Not Authenticated</span>
`;
authHeader.appendChild(authStatus);

// Auth buttons container
const authButtons = document.createElement("div");
authButtons.id = "authButtons";
authButtons.style.cssText = "display: flex; gap: 8px;";
authHeader.appendChild(authButtons);

const loginButton = document.createElement("button");
loginButton.textContent = "Sign In";
loginButton.className = "login-btn";
loginButton.style.cssText = `
  background: rgba(255,255,255,0.2);
  color: white;
  border: 1px solid rgba(255,255,255,0.3);
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
`;
loginButton.addEventListener("mouseenter", () => {
  loginButton.style.background = "rgba(255,255,255,0.3)";
});
loginButton.addEventListener("mouseleave", () => {
  loginButton.style.background = "rgba(255,255,255,0.2)";
});
authButtons.appendChild(loginButton);

const signupButton = document.createElement("button");
signupButton.textContent = "Sign Up";
signupButton.className = "signup-btn";
signupButton.style.cssText = `
  background: rgba(255,255,255,0.9);
  color: #667eea;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
`;
signupButton.addEventListener("mouseenter", () => {
  signupButton.style.background = "white";
});
signupButton.addEventListener("mouseleave", () => {
  signupButton.style.background = "rgba(255,255,255,0.9)";
});
authButtons.appendChild(signupButton);

// Create three-dot menu button
const menuButton = document.createElement("button");
menuButton.className = "menu-btn";
menuButton.innerHTML = "&#8942;"; // Vertical ellipsis
menuButton.style.cssText = `
  background: transparent;
  color: white;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0 8px;
  display: none; /* Hidden by default */
`;
authButtons.appendChild(menuButton);

// Create dropdown menu
const dropdownMenu = document.createElement("div");
dropdownMenu.className = "dropdown-menu";
dropdownMenu.style.cssText = `
  display: none;
  position: absolute;
  top: 40px;
  right: 10px;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 1000;
`;
authHeader.appendChild(dropdownMenu);

// Dropdown items
const dropdownItems = [
    { label: "Account", action: () => alert("Account clicked") },
    { label: "Subscription", action: () => alert("Subscription clicked") },
    { label: "Settings", action: () => alert("Settings clicked") },
    { label: "Logout", action: () => logout() }
];

dropdownItems.forEach(item => {
    const menuItem = document.createElement("a");
    menuItem.textContent = item.label;
    menuItem.style.cssText = `
        display: block;
        padding: 8px 16px;
        color: #333;
        text-decoration: none;
        cursor: pointer;
    `;
    menuItem.addEventListener("mouseenter", () => menuItem.style.backgroundColor = "#f4f4f4");
    menuItem.addEventListener("mouseleave", () => menuItem.style.backgroundColor = "white");
    menuItem.addEventListener("click", item.action);
    dropdownMenu.appendChild(menuItem);
});

// Toggle dropdown menu
menuButton.addEventListener("click", () => {
    const isDisplayed = dropdownMenu.style.display === "block";
    dropdownMenu.style.display = isDisplayed ? "none" : "block";
});

// Hide dropdown if clicked outside
document.addEventListener("click", (event) => {
    if (!menuButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
        dropdownMenu.style.display = "none";
    }
});


let busy = false;
let stopped = false;

function setBusy(v) {
  busy = v;
  q.disabled = v;
  go.disabled = v;
  stop.disabled = !v;
  go.textContent = v ? "…" : "Send";
}

function append(text) {
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
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
  note.textContent = "After completing authentication, return here and click 'Check Authentication'";
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
  append(`\n> ${prompt}\n`);
  stopped = false;
  setBusy(true);

  try {
    // Double-check authentication before making the API call
    if (!window.oasisAuthState?.isAuthenticated) {
      throw new Error('Authentication lost during request. Please sign in again.');
    }
    
    // Session context is automatically managed
    await runAssistantStream(prompt, (chunk) => {
      if (!stopped) {
        append(chunk);
        // Forward the chunk to iframe if it exists
        if (typeof window.notifyIframeCommandResult === 'function') {
          window.notifyIframeCommandResult(chunk);
        }
      }
    });
    if (!stopped) {
      append("\n");
      // Forward completion to iframe
      if (typeof window.notifyIframeCommandResult === 'function') {
        window.notifyIframeCommandResult("\n");
      }
    }
  } catch (e) {
    const errorMessage = e?.message?.includes('Authentication required') 
      ? `🔒 ${e.message}\nPlease sign in to continue using the AI assistant.`
      : `Error: ${e?.message || e}`;
    
    append(`\n${errorMessage}\n`);
    
    // Forward error to iframe if we're in main window
    if (!window.isInIframe && typeof window.notifyIframeCommandResult === 'function') {
      window.notifyIframeCommandResult(null, errorMessage);
    }
  } finally {
    setBusy(false);
  }
}

go.addEventListener("click", send);
q.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
stop.addEventListener("click", () => { stopped = true; setBusy(false); append("\n(stopped)\n"); });
loginButton.addEventListener("click", showLoginForm);
signupButton.addEventListener("click", showSignupForm);

// Initialize UI
updateAuthUI();

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
