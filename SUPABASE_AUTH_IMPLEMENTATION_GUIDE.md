# Supabase Authentication Implementation Guide

## Overview

This guide provides complete information for re-implementing the Supabase authentication system from the Oasis Electron browser in any other project. It includes all necessary configuration, database schema, authentication methods, and implementation details.

## Table of Contents

1. [Environment Configuration](#environment-configuration)
2. [Database Schema](#database-schema)
3. [Supabase Project Setup](#supabase-project-setup)
4. [Authentication Service Implementation](#authentication-service-implementation)
5. [OAuth Flow Implementation](#oauth-flow-implementation)
6. [Session Management](#session-management)
7. [Error Handling](#error-handling)
8. [Usage Examples](#usage-examples)
9. [Security Considerations](#security-considerations)

## Environment Configuration

### Required Environment Variables

Create a `.env` file with the following variables:

```env
# Supabase Configuration
SUPABASE_URL=https://wvclepquxxczgrukfqyr.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y2xlcHF1eHhjemdydWtmcXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwODU5OTksImV4cCI6MjA3MDY2MTk5OX0.T-hZ_8QxtVnOt0mtCY_Zch87SYEcsyQZwnvvFAtZiNY

# Google OAuth Configuration (Optional - for OAuth flow)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Application Configuration
APP_VERSION=1.0.0
LOG_LEVEL=info
```

**ℹ️ Note about Supabase Anon Key:**
- The anon key is designed to be public and safe to include in client-side code
- Data access is controlled by Row Level Security (RLS) policies
- Supabase has built-in rate limiting to prevent abuse
- This key can be safely committed to version control

### Environment Configuration Class

```typescript
// config/env.ts
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const ENV = {
    // Supabase configuration
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    
    // Google OAuth configuration
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    
    // Application configuration
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    
    // Validate environment variables
    validate(): void {
        if (!this.SUPABASE_URL) {
            throw new Error('SUPABASE_URL is required');
        }
        if (!this.SUPABASE_ANON_KEY) {
            throw new Error('SUPABASE_ANON_KEY is required');
        }
    }
};
```

## Database Schema

### Required Supabase Tables

#### 1. Users Table

```sql
-- Create users table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT, -- Handled by Supabase Auth
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended'))
);

-- Create index for email lookups
CREATE INDEX idx_users_email ON users(email);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = user_id);
```

#### 2. Sessions Table

```sql
-- Create sessions table
CREATE TABLE sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    device_info JSONB
);

-- Create index for user sessions
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Enable Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access their own sessions
CREATE POLICY "Users can view own sessions" ON sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
```

#### 3. LLM Usage Table (Optional - for AI features)

```sql
-- Create llm_usage table for tracking AI assistant usage
CREATE TABLE llm_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    tokens_used INTEGER NOT NULL,
    usage_count INTEGER DEFAULT 1,
    prompt_summary TEXT,
    model_used TEXT,
    success BOOLEAN DEFAULT true,
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user usage tracking
CREATE INDEX idx_llm_usage_user_id ON llm_usage(user_id);

-- Enable Row Level Security
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access their own usage data
CREATE POLICY "Users can view own usage" ON llm_usage
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own usage" ON llm_usage
    FOR INSERT WITH CHECK (auth.uid() = user_id);
```

#### 4. Bookmarks History Table (Optional - for browser features)

```sql
-- Create bookmarks_history table
CREATE TABLE bookmarks_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    is_bookmarked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user bookmarks
CREATE INDEX idx_bookmarks_user_id ON bookmarks_history(user_id);

-- Enable Row Level Security
ALTER TABLE bookmarks_history ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access their own bookmarks
CREATE POLICY "Users can view own bookmarks" ON bookmarks_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks" ON bookmarks_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);
```

## Supabase Project Setup

### 1. Supabase Project Configuration

- **Project URL**: `https://wvclepquxxczgrukfqyr.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Y2xlcHF1eHhjemdydWtmcXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwODU5OTksImV4cCI6MjA3MDY2MTk5OX0.T-hZ_8QxtVnOt0mtCY_Zch87SYEcsyQZwnvvFAtZiNY`

### 2. Authentication Providers Setup

In your Supabase dashboard:

1. Go to Authentication > Providers
2. Enable Email provider
3. Enable Google OAuth provider
4. Configure Google OAuth with your client credentials
5. Set redirect URLs for your application

### 3. Custom Protocol Setup (for OAuth)

For the OAuth flow, configure a custom protocol handler:
- **Protocol**: `kahana://auth-callback`
- **Redirect URL**: `kahana://auth-callback`

## Authentication Service Implementation

### TypeScript Interfaces

```typescript
// types/auth.ts
import { User, Session, AuthError } from '@supabase/supabase-js';

export interface UserProfile {
    user_id: string;
    name?: string;
    email: string;
    created_at: string;
    last_login?: string;
    status: 'active' | 'suspended';
}

export interface UserSession {
    session_id: string;
    user_id: string;
    started_at: string;
    ended_at?: string;
    device_info?: {
        platform: string;
        version: string;
        userAgent?: string;
    };
}

export interface AuthState {
    user: User | null;
    session: Session | null;
    isAuthenticated: boolean;
}
```

### Main Authentication Service

```typescript
// services/SupabaseAuth.ts
import { createClient, SupabaseClient, User, Session, AuthError } from '@supabase/supabase-js';
import { ENV } from '../config/env';
import { UserProfile, UserSession, AuthState } from '../types/auth';

export class SupabaseAuth {
    private static instance: SupabaseAuth;
    private supabase: SupabaseClient;
    private currentSession: UserSession | null = null;
    private authStateCallbacks: Array<(state: AuthState) => void> = [];

    private constructor() {
        // Initialize Supabase client
        this.supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
        
        // Set up auth state change listener
        this.supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            this.handleAuthStateChange(event, session);
        });
    }

    public static getInstance(): SupabaseAuth {
        if (!SupabaseAuth.instance) {
            SupabaseAuth.instance = new SupabaseAuth();
        }
        return SupabaseAuth.instance;
    }

    // Email/Password Authentication
    public async signInWithEmail(email: string, password: string): Promise<{ user: User | null; error: AuthError | null }> {
        try {
            console.log('Attempting email sign in for:', email);

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                console.error('Email sign in error:', error.message);
                return { user: null, error };
            }

            if (data.user) {
                await this.updateLastLogin(data.user.id);
                await this.createSession(data.user.id);
                console.log('Email sign in successful for user:', data.user.id);
            }

            return { user: data.user, error: null };
        } catch (error) {
            console.error('Sign in error:', error);
            return { user: null, error: error as AuthError };
        }
    }

    public async signUp(email: string, password: string, name?: string): Promise<{ user: User | null; error: AuthError | null }> {
        try {
            console.log('Attempting sign up for:', email);
            
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name: name || email.split('@')[0]
                    }
                }
            });

            if (error) {
                console.error('Sign up error:', error.message);
                return { user: null, error };
            }

            if (data.user) {
                // Create user profile in our custom users table
                await this.createUserProfile(data.user, name);
                console.log('Sign up successful for user:', data.user.id);
            }

            return { user: data.user, error: null };
        } catch (error) {
            console.error('Sign up error:', error);
            return { user: null, error: error as AuthError };
        }
    }

    public async signOut(): Promise<{ error: AuthError | null }> {
        try {
            console.log('Attempting sign out');
            
            // End current session if exists
            if (this.currentSession) {
                await this.endSession(this.currentSession.session_id);
            }

            const { error } = await this.supabase.auth.signOut();
            
            if (error) {
                console.error('Sign out error:', error.message);
                return { error };
            }

            this.currentSession = null;
            console.log('Sign out successful');
            return { error: null };
        } catch (error) {
            console.error('Sign out error:', error);
            return { error: error as AuthError };
        }
    }

    // Session Management
    public async getCurrentUser(): Promise<User | null> {
        const { data: { user } } = await this.supabase.auth.getUser();
        return user;
    }

    public async getSession(): Promise<Session | null> {
        const { data: { session } } = await this.supabase.auth.getSession();
        return session;
    }

    public async isAuthenticated(): Promise<boolean> {
        const user = await this.getCurrentUser();
        return user !== null;
    }

    // User Profile Management
    public async getUserProfile(): Promise<UserProfile | null> {
        try {
            const user = await this.getCurrentUser();
            if (!user) return null;

            const { data, error } = await this.supabase
                .from('users')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (error) {
                console.error('Error fetching user profile:', error.message);
                return null;
            }

            return data as UserProfile;
        } catch (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
    }

    public async updateUserProfile(updates: Partial<UserProfile>): Promise<{ error: string | null }> {
        try {
            const user = await this.getCurrentUser();
            if (!user) {
                return { error: 'No authenticated user' };
            }

            const { error } = await this.supabase
                .from('users')
                .update(updates)
                .eq('user_id', user.id);

            if (error) {
                console.error('Error updating user profile:', error.message);
                return { error: error.message };
            }

            return { error: null };
        } catch (error) {
            console.error('Error updating user profile:', error);
            return { error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    // Password Management
    public async updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
        try {
            const { error } = await this.supabase.auth.updateUser({
                password: newPassword
            });

            if (error) {
                console.error('Error updating password:', error.message);
                return { error };
            }

            return { error: null };
        } catch (error) {
            console.error('Error updating password:', error);
            return { error: error as AuthError };
        }
    }

    public async resetPassword(email: string): Promise<{ error: AuthError | null }> {
        try {
            const { error } = await this.supabase.auth.resetPasswordForEmail(email);

            if (error) {
                console.error('Error sending password reset:', error.message);
                return { error };
            }

            return { error: null };
        } catch (error) {
            console.error('Error sending password reset:', error);
            return { error: error as AuthError };
        }
    }

    // Auth State Management
    public onAuthStateChange(callback: (state: AuthState) => void): void {
        this.authStateCallbacks.push(callback);
    }

    private async handleAuthStateChange(event: string, session: Session | null): Promise<void> {
        const user = session?.user || null;
        const authState: AuthState = {
            user,
            session,
            isAuthenticated: user !== null
        };

        // Notify all callbacks
        this.authStateCallbacks.forEach(callback => {
            try {
                callback(authState);
            } catch (error) {
                console.error('Error in auth state callback:', error);
            }
        });

        // Handle session creation/destruction
        if (event === 'SIGNED_IN' && user) {
            await this.createSession(user.id);
        } else if (event === 'SIGNED_OUT' && this.currentSession) {
            await this.endSession(this.currentSession.session_id);
            this.currentSession = null;
        }
    }

    // Database Operations
    private async createUserProfile(user: User, name?: string): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('users')
                .insert({
                    user_id: user.id,
                    email: user.email!,
                    name: name || user.user_metadata?.name || user.email!.split('@')[0],
                    password_hash: '', // Supabase handles this
                    status: 'active'
                });

            if (error) {
                console.error('Error creating user profile:', error.message);
            } else {
                console.log('User profile created successfully');
            }
        } catch (error) {
            console.error('Error creating user profile:', error);
        }
    }

    private async updateLastLogin(userId: string): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('user_id', userId);

            if (error) {
                console.error('Error updating last login:', error.message);
            }
        } catch (error) {
            console.error('Error updating last login:', error);
        }
    }

    private async createSession(userId: string): Promise<void> {
        try {
            const deviceInfo = {
                platform: typeof window !== 'undefined' ? 'browser' : 'server',
                version: ENV.APP_VERSION,
                userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Server'
            };

            const { data, error } = await this.supabase
                .from('sessions')
                .insert({
                    user_id: userId,
                    device_info: deviceInfo
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating session:', error.message);
            } else if (data) {
                this.currentSession = data as UserSession;
                console.log('Session created:', data.session_id);
            }
        } catch (error) {
            console.error('Error creating session:', error);
        }
    }

    private async endSession(sessionId: string): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('sessions')
                .update({ ended_at: new Date().toISOString() })
                .eq('session_id', sessionId);

            if (error) {
                console.error('Error ending session:', error.message);
            } else {
                console.log('Session ended:', sessionId);
            }
        } catch (error) {
            console.error('Error ending session:', error);
        }
    }

    // Utility Methods
    public handleAuthError(error: AuthError): string {
        switch (error.message) {
            case 'Invalid login credentials':
                return 'Invalid email or password. Please try again.';
            case 'Email not confirmed':
                return 'Please check your email and click the confirmation link.';
            case 'User already registered':
                return 'An account with this email already exists.';
            case 'Password should be at least 6 characters':
                return 'Password must be at least 6 characters long.';
            case 'Unable to validate email address: invalid format':
                return 'Please enter a valid email address.';
            default:
                return error.message || 'An unexpected error occurred. Please try again.';
        }
    }

    // Check if email exists in database
    public async checkEmailExists(email: string): Promise<{ exists: boolean; user?: UserProfile; error?: string }> {
        try {
            const { data, error } = await this.supabase
                .from('users')
                .select('user_id, name, email, created_at, status')
                .eq('email', email.toLowerCase().trim())
                .single();

            if (error) {
                // PGRST116 means no rows found, which is expected for new users
                if (error.code === 'PGRST116') {
                    return { exists: false };
                }
                console.error('Email check error:', error.message);
                return { exists: false, error: 'Database error' };
            }

            return { exists: true, user: data as UserProfile };
        } catch (error) {
            console.error('Email verification error:', error);
            return { exists: false, error: 'Verification failed' };
        }
    }
}

// Export singleton instance
export const supabaseAuth = SupabaseAuth.getInstance();
```

## OAuth Flow Implementation

### Google OAuth with Custom Protocol

```typescript
// Add to SupabaseAuth class
public async signInWithGoogle(): Promise<{ user: User | null; error: AuthError | null }> {
    try {
        console.log('Attempting Google sign in with OAuth flow');
        
        // Check if user is already authenticated
        const currentUser = await this.getCurrentUser();
        if (currentUser) {
            console.log('User already authenticated:', currentUser.id);
            return { user: currentUser, error: null };
        }
        
        // Generate OAuth URL with Supabase
        const { data, error } = await this.supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                skipBrowserRedirect: true,
                // Use a custom protocol the app can handle
                redirectTo: 'kahana://auth-callback',
                // Request consent prompt and offline access for refresh token
                queryParams: { 
                    prompt: 'select_account', 
                    access_type: 'offline',
                    include_granted_scopes: 'true',
                    response_type: 'code'
                }
            }
        });
        
        if (error || !data.url) {
            console.error('Failed to generate OAuth URL:', error);
            return { user: null, error: error || { message: 'Failed to generate OAuth URL', status: 500 } as AuthError };
        }
        
        console.log('Generated OAuth URL, opening in browser...');
        
        // Open the OAuth URL in browser
        if (typeof window !== 'undefined') {
            window.open(data.url, '_blank');
        }
        
        // Return a success message indicating OAuth was initiated
        return { user: null, error: null };
        
    } catch (error) {
        console.error('Google sign in error:', error);
        return { user: null, error: error as AuthError };
    }
}

/**
 * Handle OAuth redirect deep link (e.g., kahana://auth-callback?code=...)
 * Exchanges the code for a session or sets the session from hash tokens.
 */
public async handleOAuthRedirectCallback(callbackUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
        console.log('Handling OAuth redirect callback:', callbackUrl);
        const urlObj = new URL(callbackUrl);
        if (urlObj.protocol !== 'kahana:') {
            console.warn('Invalid protocol in callback URL:', urlObj.protocol);
            return { success: false, error: 'Invalid protocol' };
        }

        // Prefer PKCE code exchange
        const authCode = urlObj.searchParams.get('code');
        const errorParam = urlObj.searchParams.get('error');
        const errorDescription = urlObj.searchParams.get('error_description');
        
        if (errorParam) {
            console.error('OAuth redirect contained error:', errorParam, errorDescription);
            return { success: false, error: errorDescription || errorParam };
        }

        if (authCode) {
            console.log('Exchanging auth code for session...');
            const { data, error } = await this.supabase.auth.exchangeCodeForSession(authCode);
            if (error) {
                console.error('Failed to exchange code for session:', error.message);
                return { success: false, error: error.message };
            } else {
                console.log('Exchanged code for session for user:', data.user?.id);
                
                // Ensure user profile exists
                if (data.user) {
                    const existingProfile = await this.getUserProfile();
                    if (!existingProfile) {
                        await this.createUserProfile(data.user, data.user.user_metadata?.name);
                        console.log('Created user profile from OAuth callback');
                    }
                    
                    // Update last login and create session
                    await this.updateLastLogin(data.user.id);
                    await this.createSession(data.user.id);
                }
                
                return { success: true };
            }
        }

        // Fallback: handle implicit flow fragments (access_token in hash)
        if (urlObj.hash && urlObj.hash.startsWith('#')) {
            console.log('Handling implicit flow with hash tokens...');
            const hashParams = new URLSearchParams(urlObj.hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            if (accessToken && refreshToken) {
                const { data, error } = await this.supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });
                if (error) {
                    console.error('Failed to set session from hash tokens:', error.message);
                    return { success: false, error: error.message };
                } else {
                    console.log('Set session from hash tokens for user:', data.user?.id);
                    
                    // Ensure user profile exists
                    if (data.user) {
                        const existingProfile = await this.getUserProfile();
                        if (!existingProfile) {
                            await this.createUserProfile(data.user, data.user.user_metadata?.name);
                            console.log('Created user profile from hash tokens');
                        }
                        
                        // Update last login and create session
                        await this.updateLastLogin(data.user.id);
                        await this.createSession(data.user.id);
                    }
                    
                    return { success: true };
                }
            } else {
                console.warn('OAuth redirect missing tokens in hash');
                return { success: false, error: 'Missing tokens in hash' };
            }
        }
        
        console.warn('No valid OAuth response found in callback');
        return { success: false, error: 'No valid OAuth response' };
        
    } catch (error) {
        console.error('Error handling OAuth redirect callback:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
```

### Custom Protocol Handler (Electron)

For Electron applications, register the custom protocol:

```typescript
// main.ts (Electron main process)
import { app, protocol } from 'electron';
import { supabaseAuth } from './services/SupabaseAuth';

// Register custom protocol
app.setAsDefaultProtocolClient('kahana');

// Handle protocol URLs
app.on('open-url', async (event, url) => {
    event.preventDefault();
    console.log('Received protocol URL:', url);
    
    if (url.startsWith('kahana://auth-callback')) {
        const result = await supabaseAuth.handleOAuthRedirectCallback(url);
        if (result.success) {
            console.log('OAuth authentication successful');
        } else {
            console.error('OAuth authentication failed:', result.error);
        }
    }
});

// Handle protocol URLs on Windows
app.on('second-instance', async (event, commandLine, workingDirectory) => {
    const url = commandLine.find(arg => arg.startsWith('kahana://'));
    if (url) {
        console.log('Received protocol URL from second instance:', url);
        
        if (url.startsWith('kahana://auth-callback')) {
            const result = await supabaseAuth.handleOAuthRedirectCallback(url);
            if (result.success) {
                console.log('OAuth authentication successful');
            } else {
                console.error('OAuth authentication failed:', result.error);
            }
        }
    }
});
```

## Session Management

### Session Tracking

The authentication service automatically tracks user sessions in the database. Each session includes:

- **Session ID**: Unique identifier
- **User ID**: Reference to the user
- **Start Time**: When the session began
- **End Time**: When the session ended (null for active sessions)
- **Device Info**: Platform, version, and user agent information

### Session Lifecycle

1. **Session Creation**: Automatically created when user signs in
2. **Session Updates**: Last login time updated on each authentication
3. **Session Termination**: Automatically ended when user signs out

## Error Handling

### Common Authentication Errors

```typescript
// Error handling utility
export const handleAuthError = (error: AuthError): string => {
    switch (error.message) {
        case 'Invalid login credentials':
            return 'Invalid email or password. Please try again.';
        case 'Email not confirmed':
            return 'Please check your email and click the confirmation link.';
        case 'User already registered':
            return 'An account with this email already exists.';
        case 'Password should be at least 6 characters':
            return 'Password must be at least 6 characters long.';
        case 'Unable to validate email address: invalid format':
            return 'Please enter a valid email address.';
        case 'Too many requests':
            return 'Too many attempts. Please try again later.';
        default:
            return error.message || 'An unexpected error occurred. Please try again.';
    }
};
```

## Usage Examples

### Basic Authentication Flow

```typescript
import { supabaseAuth } from './services/SupabaseAuth';

// Sign up a new user
const signUpUser = async (email: string, password: string, name: string) => {
    const { user, error } = await supabaseAuth.signUp(email, password, name);
    
    if (error) {
        console.error('Sign up failed:', supabaseAuth.handleAuthError(error));
        return false;
    }
    
    console.log('User signed up successfully:', user?.id);
    return true;
};

// Sign in existing user
const signInUser = async (email: string, password: string) => {
    const { user, error } = await supabaseAuth.signInWithEmail(email, password);
    
    if (error) {
        console.error('Sign in failed:', supabaseAuth.handleAuthError(error));
        return false;
    }
    
    console.log('User signed in successfully:', user?.id);
    return true;
};

// Sign in with Google OAuth
const signInWithGoogle = async () => {
    const { user, error } = await supabaseAuth.signInWithGoogle();
    
    if (error) {
        console.error('Google sign in failed:', supabaseAuth.handleAuthError(error));
        return false;
    }
    
    console.log('Google sign in initiated');
    return true;
};

// Check authentication status
const checkAuthStatus = async () => {
    const isAuthenticated = await supabaseAuth.isAuthenticated();
    const user = await supabaseAuth.getCurrentUser();
    const profile = await supabaseAuth.getUserProfile();
    
    console.log('Auth status:', { isAuthenticated, user: user?.id, profile });
    return { isAuthenticated, user, profile };
};

// Sign out
const signOutUser = async () => {
    const { error } = await supabaseAuth.signOut();
    
    if (error) {
        console.error('Sign out failed:', supabaseAuth.handleAuthError(error));
        return false;
    }
    
    console.log('User signed out successfully');
    return true;
};
```

### Auth State Monitoring

```typescript
// Listen for authentication state changes
supabaseAuth.onAuthStateChange((authState) => {
    console.log('Auth state changed:', authState);
    
    if (authState.isAuthenticated) {
        console.log('User is authenticated:', authState.user?.email);
        // Update UI to show authenticated state
    } else {
        console.log('User is not authenticated');
        // Update UI to show unauthenticated state
    }
});
```

### User Profile Management

```typescript
// Get user profile
const getUserProfile = async () => {
    const profile = await supabaseAuth.getUserProfile();
    
    if (profile) {
        console.log('User profile:', profile);
        return profile;
    } else {
        console.log('No user profile found');
        return null;
    }
};

// Update user profile
const updateProfile = async (updates: Partial<UserProfile>) => {
    const { error } = await supabaseAuth.updateUserProfile(updates);
    
    if (error) {
        console.error('Profile update failed:', error);
        return false;
    }
    
    console.log('Profile updated successfully');
    return true;
};
```

## Security Considerations

### 1. Environment Variables
- Never commit `.env` files to version control
- Use different credentials for development and production
- Rotate API keys regularly

### 2. Row Level Security (RLS)
- All database tables have RLS enabled
- Users can only access their own data
- Policies are enforced at the database level

### 3. Session Management
- Sessions are tracked in the database
- Automatic session cleanup on sign out
- Device information is logged for security

### 4. OAuth Security
- Use PKCE flow for OAuth
- Validate redirect URLs
- Handle OAuth errors gracefully

### 5. Password Security
- Passwords are handled by Supabase Auth
- Minimum 6 character requirement
- Password reset functionality included

## Dependencies

### Required NPM Packages

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.38.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Installation

```bash
npm install @supabase/supabase-js dotenv
npm install -D @types/node typescript
```

## Conclusion

This guide provides everything needed to re-implement the Supabase authentication system in any project. The implementation includes:

- Complete database schema with RLS policies
- Full authentication service with all methods
- OAuth flow with custom protocol handling
- Session management and tracking
- Error handling and user feedback
- Security best practices

The authentication system is production-ready and includes all the features from the original Oasis browser implementation.
