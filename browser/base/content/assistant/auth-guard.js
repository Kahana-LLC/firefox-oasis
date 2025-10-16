// Authentication Guard for AI Assistant
// This module provides authentication checks for the AI assistant API calls

(function() {
    'use strict';
    
    // Store original functions
    let originalRouteRemote = null;
    let originalChatRemote = null;
    
    // Authentication check function
    function checkAuthentication() {
        const authState = window.oasisAuthState;
        if (!authState || !authState.isAuthenticated) {
            console.warn('AI Assistant: Unauthenticated access attempt blocked');
            throw new Error('Authentication required: Please sign in to use the AI assistant');
        }
        return true;
    }
    
    // Wrapper for routeRemote function
    async function protectedRouteRemote(system, messages, options) {
        checkAuthentication();
        
        const authState = window.oasisAuthState;
        console.log(`AI Assistant: Authenticated request from user ${authState?.user?.email || 'unknown'}`);
        
        return originalRouteRemote(system, messages, options);
    }
    
    // Wrapper for chatRemote function
    async function protectedChatRemote(system, messages) {
        checkAuthentication();
        
        const authState = window.oasisAuthState;
        console.log(`AI Assistant: Authenticated chat request from user ${authState?.user?.email || 'unknown'}`);
        
        return originalChatRemote(system, messages);
    }
    
    // Function to install authentication guards
    function installAuthGuards() {
        // Wait for the assistant bundle to load
        if (typeof window.runAssistantStream === 'undefined') {
            setTimeout(installAuthGuards, 100);
            return;
        }
        
        // Try to access the proxy client functions
        // Since they're bundled, we need to intercept them at the module level
        console.log('Installing authentication guards for AI Assistant...');
        
        // The functions are likely in the global scope or accessible via the bundle
        // We'll need to patch them when they become available
        const checkForFunctions = () => {
            // Look for the functions in various possible locations
            if (window.routeRemote && !originalRouteRemote) {
                originalRouteRemote = window.routeRemote;
                window.routeRemote = protectedRouteRemote;
                console.log('Protected routeRemote function');
            }
            
            if (window.chatRemote && !originalChatRemote) {
                originalChatRemote = window.chatRemote;
                window.chatRemote = protectedChatRemote;
                console.log('Protected chatRemote function');
            }
            
            // If we haven't found them yet, keep checking
            if (!originalRouteRemote || !originalChatRemote) {
                setTimeout(checkForFunctions, 100);
            } else {
                console.log('Authentication guards successfully installed');
            }
        };
        
        checkForFunctions();
    }
    
    // Install guards when the page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installAuthGuards);
    } else {
        installAuthGuards();
    }
    
    // Also try to install immediately
    installAuthGuards();
    
    // Export for manual installation if needed
    window.installAuthGuards = installAuthGuards;
    
})();
