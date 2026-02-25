// Supabase Authentication Service for Browser Assistant
import {
    createClient,
    SupabaseClient,
    User,
    Session,
    AuthError,
    AuthChangeEvent,
} from '@supabase/supabase-js';
import { ENV } from '../config/env.js';
import { UserProfile, UserSession, AuthState } from '../types/auth.js';
import { assistantLogger } from '../utils/assistantLogger.js';

type OAuthCallbackData = {
    code?: string;
    access_token?: string;
    refresh_token?: string;
};

const logDebug = (message: unknown, ...meta: unknown[]): void => {
    assistantLogger.debug(
        'supabase',
        String(message ?? ''),
        meta.length === 0 ? undefined : meta.length === 1 ? meta[0] : meta
    );
};

const logWarn = (message: unknown, ...meta: unknown[]): void => {
    assistantLogger.warn(
        'supabase',
        String(message ?? ''),
        meta.length === 0 ? undefined : meta.length === 1 ? meta[0] : meta
    );
};

const logError = (message: unknown, ...meta: unknown[]): void => {
    assistantLogger.error(
        'supabase',
        String(message ?? ''),
        meta.length === 0 ? undefined : meta.length === 1 ? meta[0] : meta
    );
};

export default class SupabaseAuth {
    private static instance: SupabaseAuth;
    private supabase: SupabaseClient;
    private currentSession: UserSession | null = null;
    private authStateCallbacks: Array<(state: AuthState) => void> = [];

    private constructor() {
        // Initialize Supabase client
        this.supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);
        
        // Set up auth state change listener
        this.supabase.auth.onAuthStateChange((event, session) => {
            logDebug('Auth state changed:', event);
            this.handleAuthStateChange(event, session);
        });
    }

    public static getInstance(): SupabaseAuth {
        if (!SupabaseAuth.instance) {
            SupabaseAuth.instance = new SupabaseAuth();
        }
        return SupabaseAuth.instance;
    }

    // Google OAuth Authentication
    public async signInWithGoogle(): Promise<{ user: User | null; error: AuthError | null }> {
        try {
            logDebug('Attempting Google sign in with manual URL approach');
            
            // Check if user is already authenticated
            const currentUser = await this.getCurrentUser();
            if (currentUser) {
                logDebug('User already authenticated:', currentUser.id);
                return { user: currentUser, error: null };
            }
            
                   // Generate OAuth URL with Supabase
                   const { data, error } = await this.supabase.auth.signInWithOAuth({
                       provider: 'google',
                       options: {
                           skipBrowserRedirect: true,
                           // Use Kahana's official domain for OAuth callback
                           redirectTo: 'https://kahana.co/oauth-callback',
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
                logError('Failed to generate OAuth URL:', error);
                return { user: null, error: error || { message: 'Failed to generate OAuth URL', status: 500 } as AuthError };
            }
            
            logDebug('Generated OAuth URL:', data.url);
            
            // Since window.open() is blocked from chrome://, we'll show a modal with the URL
            // and let the user manually open it in a new tab
            return { 
                user: null, 
                error: new Error(`GOOGLE_OAUTH_URL:${data.url}`) as AuthError 
            };
            
        } catch (error) {
            logError('Google sign in error:', error);
            return { user: null, error: error as AuthError };
        }
    }

    // Email/Password Authentication
    public async signInWithEmail(email: string, password: string): Promise<{ user: User | null; error: AuthError | null }> {
        try {
            logDebug('Attempting email sign in for:', email);

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                logError('Email sign in error:', error.message);
                return { user: null, error };
            }

            if (data.user) {
                await this.updateLastLogin(data.user.id);
                await this.createSession(data.user.id);
                logDebug('Email sign in successful for user:', data.user.id);
            }

            return { user: data.user, error: null };
        } catch (error) {
            logError('Sign in error:', error);
            return { user: null, error: error as AuthError };
        }
    }

    public async signUp(email: string, password: string, name?: string): Promise<{ user: User | null; error: AuthError | null }> {
        try {
            logDebug('Attempting sign up for:', email);
            
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
                logError('Sign up error:', error.message);
                return { user: null, error };
            }

            if (data.user) {
                // Create user profile in our custom users table
                await this.createUserProfile(data.user, name);
                logDebug('Sign up successful for user:', data.user.id);
            }

            return { user: data.user, error: null };
        } catch (error) {
            logError('Sign up error:', error);
            return { user: null, error: error as AuthError };
        }
    }

    public async signOut(): Promise<{ error: AuthError | null }> {
        try {
            logDebug('Attempting sign out');
            
            // End current session if exists
            if (this.currentSession) {
                await this.endSession(this.currentSession.session_id);
            }

            const { error } = await this.supabase.auth.signOut();
            
            if (error) {
                logError('Sign out error:', error.message);
                return { error };
            }

            this.currentSession = null;
            logDebug('Sign out successful');
            return { error: null };
        } catch (error) {
            logError('Sign out error:', error);
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

    /**
     * Handle OAuth callback data (similar to Electron's handleOAuthRedirectCallback)
     * Processes auth data from manual input and exchanges it for a session
     */
    public async handleOAuthCallbackData(authData: unknown): Promise<{ success: boolean; error?: string }> {
        try {
            const parsedData = this.parseOAuthCallbackData(authData);
            logDebug('Handling OAuth callback data:', parsedData);
            
            // Handle auth code exchange (preferred method)
            if (parsedData.code) {
                logDebug('Exchanging auth code for session...');
                const { data, error } = await this.supabase.auth.exchangeCodeForSession(parsedData.code);
                if (error) {
                    logError('Failed to exchange code for session:', error.message);
                    return { success: false, error: error.message };
                } else {
                    logDebug('Exchanged code for session for user:', data.user?.id);
                    
                    // Ensure user profile exists
                    if (data.user) {
                        const existingProfile = await this.getUserProfile();
                        if (!existingProfile) {
                            await this.createUserProfile(data.user, data.user.user_metadata?.name);
                            logDebug('Created user profile from OAuth callback');
                        }
                        
                        // Update last login and create session
                        await this.updateLastLogin(data.user.id);
                        await this.createSession(data.user.id);
                    }
                    
                    return { success: true };
                }
            }

            // Handle direct token setting (fallback)
            if (parsedData.access_token && parsedData.refresh_token) {
                logDebug('Setting session from tokens...');
                const { data, error } = await this.supabase.auth.setSession({
                    access_token: parsedData.access_token,
                    refresh_token: parsedData.refresh_token
                });
                if (error) {
                    logError('Failed to set session from tokens:', error.message);
                    return { success: false, error: error.message };
                } else {
                    logDebug('Set session from tokens for user:', data.user?.id);
                    
                    // Ensure user profile exists
                    if (data.user) {
                        const existingProfile = await this.getUserProfile();
                        if (!existingProfile) {
                            await this.createUserProfile(data.user, data.user.user_metadata?.name);
                            logDebug('Created user profile from tokens');
                        }
                        
                        // Update last login and create session
                        await this.updateLastLogin(data.user.id);
                        await this.createSession(data.user.id);
                    }
                    
                    return { success: true };
                }
            }
            
            logWarn('No valid OAuth data found');
            return { success: false, error: 'No valid OAuth data' };
            
        } catch (error) {
            logError('Error handling OAuth callback data:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
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
                logError('Error fetching user profile:', error.message);
                return null;
            }

            return data as UserProfile;
        } catch (error) {
            logError('Error fetching user profile:', error);
            return null;
        }
    }

    // Auth State Management
    public onAuthStateChange(callback: (state: AuthState) => void): void {
        this.authStateCallbacks.push(callback);
    }

    private async handleAuthStateChange(event: AuthChangeEvent, session: Session | null): Promise<void> {
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
                logError('Error in auth state callback:', error);
            }
        });

        // Handle session creation/destruction
        if (event === 'SIGNED_IN' && user) {
            // Ensure user profile exists before creating a session
            const profile = await this.getUserProfile();
            if (profile) {
                await this.createSession(user.id);
            }
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
                logError('Error creating user profile:', error.message);
            } else {
                logDebug('User profile created successfully');
            }
        } catch (error) {
            logError('Error creating user profile:', error);
        }
    }

    private async updateLastLogin(userId: string): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('users')
                .update({ last_login: new Date().toISOString() })
                .eq('user_id', userId);

            if (error) {
                logError('Error updating last login:', error.message);
            }
        } catch (error) {
            logError('Error updating last login:', error);
        }
    }

    private async createSession(userId: string): Promise<void> {
        try {
            const deviceInfo = {
                platform: 'browser',
                version: ENV.APP_VERSION,
                userAgent: window.navigator.userAgent
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
                // Ignore RLS errors as they might happen if the user is not fully synced yet
                if (error.message.includes('row-level security policy')) {
                    logWarn('Session tracking skipped due to RLS policy (non-critical):', error.message);
                } else {
                    logError('Error creating session:', error.message);
                }
            } else if (data) {
                this.currentSession = data as UserSession;
                logDebug('Session created:', data.session_id);
            }
        } catch (error) {
            logError('Error creating session:', error);
        }
    }

    private async endSession(sessionId: string): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('sessions')
                .update({ ended_at: new Date().toISOString() })
                .eq('session_id', sessionId);

            if (error) {
                logError('Error ending session:', error.message);
            } else {
                logDebug('Session ended:', sessionId);
            }
        } catch (error) {
            logError('Error ending session:', error);
        }
    }

    private parseOAuthCallbackData(authData: unknown): OAuthCallbackData {
        if (!authData || typeof authData !== "object") {
            return {};
        }
        const raw = authData as Record<string, unknown>;
        return {
            code: typeof raw.code === "string" ? raw.code : undefined,
            access_token: typeof raw.access_token === "string" ? raw.access_token : undefined,
            refresh_token: typeof raw.refresh_token === "string" ? raw.refresh_token : undefined,
        };
    }

    // Utility Methods
    public handleAuthError(error: AuthError): string {
        // Handle special OAuth URL case
        if (error.message && error.message.startsWith('GOOGLE_OAUTH_URL:')) {
            return error.message; // Return the full message with URL
        }
        
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
            case 'OAuth provider not found':
                return 'Google sign-in is not configured. Please contact support.';
            case 'OAuth account not linked':
                return 'This Google account is not linked to an existing account.';
            case 'Google sign-in is blocked by browser security. Please use email/password authentication instead.':
                return 'Google sign-in is blocked by browser security. Please use email/password authentication instead.';
            case 'Popup blocked. Please allow popups for this site and try again.':
                return 'Popup blocked. Please allow popups for this site and try again.';
            case 'Google sign-in was cancelled or failed. Please try again.':
                return 'Google sign-in was cancelled or failed. Please try again.';
            case 'Google sign-in timed out. Please try again.':
                return 'Google sign-in timed out. Please try again.';
            case 'Failed to generate OAuth URL':
                return 'Failed to generate OAuth URL. Please try again.';
            case 'Failed to open OAuth URL. Please allow popups and try again.':
                return 'Failed to open OAuth URL. Please allow popups and try again.';
            default:
                return error.message || 'An unexpected error occurred. Please try again.';
        }
    }
}

// Export singleton instance
export const supabaseAuth = SupabaseAuth.getInstance();
