// Supabase Authentication Service for Browser Assistant
import {
  createClient,
  SupabaseClient,
  User,
  Session,
  AuthError,
} from "@supabase/supabase-js";
import { ENV } from "../config/env.js";
import { UserProfile, UserSession, AuthState } from "../types/auth.js";
import {
  DEFAULT_CALLBACK_BASE_URL,
  getHandoffFlowId,
  isOAuthDevEnvironment,
  normalizeAllowedCallbackBaseUrl,
  validateHandoffPayload,
} from "../utils/oauthHandoff.js";

export default class SupabaseAuth {
  private static instance: SupabaseAuth;
  private supabase: SupabaseClient;
  private currentSession: UserSession | null = null;
  private authStateCallbacks: Array<(state: AuthState) => void> = [];
  private lastTrackedSessionUserId: string | null = null;
  private sessionTrackInFlight: {
    userId: string;
    promise: Promise<void>;
  } | null = null;
  private oauthCallbackBaseUrl: string | null = null;
  private activeOAuthLaunch: {
    provider: "google" | "azure" | "apple";
    target: "assistant" | "onboarding";
    flowId: string;
    launcherUrl: string;
    startedAt: number;
  } | null = null;

  private constructor() {
    // Initialize Supabase client
    this.supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);

    // Set up auth state change listener
    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state changed:", event);
      this.handleAuthStateChange(event, session);
    });
  }

  public static getInstance(): SupabaseAuth {
    if (!SupabaseAuth.instance) {
      SupabaseAuth.instance = new SupabaseAuth();
    }
    return SupabaseAuth.instance;
  }

  public setOAuthCallbackBaseUrl(url?: string | null): string {
    const normalized = normalizeAllowedCallbackBaseUrl(url);
    if (!normalized) {
      console.warn(
        "OAuth callback base URL rejected (not on allowlist):",
        url
      );
      return this.getOAuthCallbackBaseUrl();
    }
    this.oauthCallbackBaseUrl = normalized;
    if (typeof window !== "undefined") {
      (window as any).__oasisOAuthCallbackBaseUrl = normalized;
    }
    return normalized;
  }

  public getOAuthCallbackBaseUrl(): string {
    if (this.oauthCallbackBaseUrl) {
      const cached = normalizeAllowedCallbackBaseUrl(this.oauthCallbackBaseUrl);
      if (cached) {
        return cached;
      }
      this.oauthCallbackBaseUrl = null;
    }
    if (typeof window !== "undefined") {
      const runtimeOverride = (window as any).__oasisOAuthCallbackBaseUrl;
      const normalizedRuntime =
        normalizeAllowedCallbackBaseUrl(runtimeOverride);
      if (normalizedRuntime) {
        this.oauthCallbackBaseUrl = normalizedRuntime;
        return normalizedRuntime;
      }
      if (isOAuthDevEnvironment()) {
        try {
          const override = window.localStorage?.getItem(
            "oasis_oauth_callback_base_url"
          );
          const normalizedStorage =
            normalizeAllowedCallbackBaseUrl(override);
          if (normalizedStorage) {
            this.oauthCallbackBaseUrl = normalizedStorage;
            return normalizedStorage;
          }
        } catch (e) {}
      }
    }
    return DEFAULT_CALLBACK_BASE_URL;
  }

  public getActiveOAuthFlowId(): string | null {
    if (!this.activeOAuthLaunch) {
      return null;
    }
    if (Date.now() - this.activeOAuthLaunch.startedAt > 600000) {
      this.activeOAuthLaunch = null;
      return null;
    }
    return this.activeOAuthLaunch.flowId;
  }

  private createOAuthFlowId(): string {
    return `oauth_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  private getActiveOAuthLaunch(
    provider: "google" | "azure" | "apple",
    target: "assistant" | "onboarding"
  ) {
    if (!this.activeOAuthLaunch) {
      return null;
    }

    if (Date.now() - this.activeOAuthLaunch.startedAt > 600000) {
      this.activeOAuthLaunch = null;
      return null;
    }

    if (
      this.activeOAuthLaunch.provider === provider &&
      this.activeOAuthLaunch.target === target
    ) {
      return this.activeOAuthLaunch;
    }

    return null;
  }

  private beginOAuthLaunch(
    provider: "google" | "azure" | "apple",
    target: "assistant" | "onboarding"
  ) {
    const existingLaunch = this.getActiveOAuthLaunch(provider, target);
    if (existingLaunch) {
      console.warn(
        `[Oasis OAuth][${existingLaunch.flowId}] Reusing active OAuth launcher URL`
      );
      return existingLaunch;
    }

    const flowId = this.createOAuthFlowId();
    this.setFirefoxOAuthMarker(target, provider, flowId);
    const launcherUrl = this.getOAuthLauncherUrl(provider, target, flowId);
    const launch = {
      provider,
      target,
      flowId,
      launcherUrl,
      startedAt: Date.now(),
    };
    this.activeOAuthLaunch = launch;
    return launch;
  }

  private clearActiveOAuthLaunch(flowId?: string) {
    if (!this.activeOAuthLaunch) {
      return;
    }
    if (!flowId || this.activeOAuthLaunch.flowId === flowId) {
      this.activeOAuthLaunch = null;
    }
  }

  private getOAuthRedirectUrl(
    target: "assistant" | "onboarding" = "assistant",
    flowId?: string
  ) {
    const params = new URLSearchParams({
      flow: "assistant",
      handoff_target: target,
    });
    if (flowId) {
      params.set("flow_id", flowId);
    }
    return `${this.getOAuthCallbackBaseUrl()}/oauth-callback?${params.toString()}`;
  }

  private getOAuthLauncherUrl(
    provider: "google" | "azure" | "apple",
    target: "assistant" | "onboarding" = "assistant",
    flowId?: string
  ) {
    const params = new URLSearchParams({
      flow: "assistant",
      handoff_target: target,
      provider,
    });
    if (flowId) {
      params.set("flow_id", flowId);
    }
    return `${this.getOAuthCallbackBaseUrl()}/oasis-auth?${params.toString()}`;
  }

  private setFirefoxOAuthMarker(
    target: "assistant" | "onboarding",
    provider: "google" | "azure" | "apple",
    flowId: string
  ) {
    if (typeof window === "undefined") {
      return;
    }

    const Services =
      (window as any).Services ||
      ((globalThis as any).ChromeUtils
        ? (globalThis as any).ChromeUtils.import(
            "resource://gre/modules/Services.jsm"
          ).Services
        : null);
    const Ci = (window as any).Ci || (globalThis as any).Ci;

    if (!Services?.cookies || !Ci?.nsICookie) {
      return;
    }

    const payload = encodeURIComponent(
      JSON.stringify({
        target,
        provider,
        flowId,
        timestamp: Date.now(),
        callbackBaseUrl: this.getOAuthCallbackBaseUrl(),
      })
    );
    const expiry = Date.now() + 3 * 60 * 1000;

    const writeCookie = (baseUrl: string) => {
      try {
        const parsed = new URL(baseUrl);
        const schemeMap =
          parsed.protocol === "https:"
            ? Ci.nsICookie.SCHEME_HTTPS
            : Ci.nsICookie.SCHEME_HTTP;
        Services.cookies.add(
          parsed.hostname,
          "/",
          "oasis_firefox_oauth_target",
          payload,
          parsed.protocol === "https:",
          false,
          false,
          expiry,
          {},
          Ci.nsICookie.SAMESITE_LAX,
          schemeMap
        );
      } catch (e) {
        console.warn("Failed to set Firefox OAuth marker cookie:", e);
      }
    };

    const callbackBaseUrl = this.getOAuthCallbackBaseUrl();
    writeCookie(callbackBaseUrl);
    if (!callbackBaseUrl.includes("kahana.co")) {
      writeCookie("https://kahana.co");
    }
  }

  // Google OAuth Authentication
  public async signInWithGoogle(
    target: "assistant" | "onboarding" = "assistant"
  ): Promise<{
    user: User | null;
    error: AuthError | null;
  }> {
    try {
      const launch = this.beginOAuthLaunch("google", target);
      const { flowId, launcherUrl } = launch;
      console.log(
        `[Oasis OAuth][${flowId}] Preparing Google OAuth launcher URL`
      );

      // Check if user is already authenticated
      const currentUser = await this.getCurrentUser();
      if (currentUser) {
        console.log(
          `[Oasis OAuth][${flowId}] User already authenticated:`,
          currentUser.id
        );
        return { user: currentUser, error: null };
      }

      console.log(
        `[Oasis OAuth][${flowId}] Generated launcher URL:`,
        launcherUrl
      );
      return {
        user: null,
        error: new Error(`GOOGLE_OAUTH_URL:${launcherUrl}`) as AuthError,
      };
    } catch (error) {
      console.error("Google sign in error:", error);
      return { user: null, error: error as AuthError };
    }
  }

  public async signInWithAzure(
    target: "assistant" | "onboarding" = "assistant"
  ): Promise<{
    user: User | null;
    error: AuthError | null;
  }> {
    try {
      const launch = this.beginOAuthLaunch("azure", target);
      const { flowId, launcherUrl } = launch;
      console.log(
        `[Oasis OAuth][${flowId}] Preparing Azure OAuth launcher URL`
      );

      const currentUser = await this.getCurrentUser();
      if (currentUser) {
        console.log(
          `[Oasis OAuth][${flowId}] User already authenticated:`,
          currentUser.id
        );
        return { user: currentUser, error: null };
      }

      console.log(
        `[Oasis OAuth][${flowId}] Generated launcher URL:`,
        launcherUrl
      );
      return {
        user: null,
        error: new Error(`AZURE_OAUTH_URL:${launcherUrl}`) as AuthError,
      };
    } catch (error) {
      console.error("Azure sign in error:", error);
      return { user: null, error: error as AuthError };
    }
  }

  public async signInWithApple(
    target: "assistant" | "onboarding" = "assistant"
  ): Promise<{
    user: User | null;
    error: AuthError | null;
  }> {
    try {
      const launch = this.beginOAuthLaunch("apple", target);
      const { flowId, launcherUrl } = launch;
      console.log(
        `[Oasis OAuth][${flowId}] Preparing Apple OAuth launcher URL`
      );

      const currentUser = await this.getCurrentUser();
      if (currentUser) {
        console.log(
          `[Oasis OAuth][${flowId}] User already authenticated:`,
          currentUser.id
        );
        return { user: currentUser, error: null };
      }

      console.log(
        `[Oasis OAuth][${flowId}] Generated launcher URL:`,
        launcherUrl
      );
      return {
        user: null,
        error: new Error(`APPLE_OAUTH_URL:${launcherUrl}`) as AuthError,
      };
    } catch (error) {
      console.error("Apple sign in error:", error);
      return { user: null, error: error as AuthError };
    }
  }

  // Email/Password Authentication
  public async signInWithEmail(
    email: string,
    password: string
  ): Promise<{ user: User | null; error: AuthError | null }> {
    try {
      console.log("Attempting email sign in for:", email);

      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Email sign in error:", error.message);
        return { user: null, error };
      }

      if (data.user) {
        await this.updateLastLogin(data.user.id);
        await this.createSession(data.user.id);
        console.log("Email sign in successful for user:", data.user.id);
      }

      return { user: data.user, error: null };
    } catch (error) {
      console.error("Sign in error:", error);
      return { user: null, error: error as AuthError };
    }
  }

  public async signUp(
    email: string,
    password: string,
    name?: string
  ): Promise<{ user: User | null; error: AuthError | null }> {
    try {
      console.log("Attempting sign up for:", email);

      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || email.split("@")[0],
          },
        },
      });

      if (error) {
        console.error("Sign up error:", error.message);
        return { user: null, error };
      }

      if (data.user) {
        // Create user profile in our custom users table
        await this.createUserProfile(data.user, name);
        console.log("Sign up successful for user:", data.user.id);
      }

      return { user: data.user, error: null };
    } catch (error) {
      console.error("Sign up error:", error);
      return { user: null, error: error as AuthError };
    }
  }

  public async resetPasswordForEmail(
    email: string
  ): Promise<{ error: AuthError | null }> {
    try {
      console.log("Attempting password reset for:", email);
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://kahana.co/update-password",
      });

      if (error) {
        console.error("Password reset error:", error.message);
        return { error };
      }

      console.log("Password reset email sent");
      return { error: null };
    } catch (error) {
      console.error("Password reset error:", error);
      return { error: error as AuthError };
    }
  }

  public async signOut(): Promise<{ error: AuthError | null }> {
    try {
      console.log("Attempting sign out");

      // End current session if exists
      if (this.currentSession) {
        await this.endSession(this.currentSession.session_id);
      }

      const { error } = await this.supabase.auth.signOut();

      if (error) {
        console.error("Sign out error:", error.message);
        return { error };
      }

      this.currentSession = null;
      console.log("Sign out successful");
      return { error: null };
    } catch (error) {
      console.error("Sign out error:", error);
      return { error: error as AuthError };
    }
  }

  // Session Management
  public async getCurrentUser(): Promise<User | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    return user;
  }

  public async getSession(): Promise<Session | null> {
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    return session;
  }

  public async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }

  private normalizeOAuthCallbackPayload(authData: any): {
    code?: string;
    access_token?: string;
    refresh_token?: string;
  } {
    const out: {
      code?: string;
      access_token?: string;
      refresh_token?: string;
    } = {};
    if (!authData || typeof authData !== "object") {
      return out;
    }
    if (typeof authData.code === "string" && authData.code) {
      out.code = authData.code;
    }
    if (authData.access_token && authData.refresh_token) {
      out.access_token = authData.access_token;
      out.refresh_token = authData.refresh_token;
      return out;
    }

    const tryParseHash = (raw: string) => {
      const h = raw.replace(/^#/, "");
      const params = new URLSearchParams(h);
      const at = params.get("access_token");
      const rt = params.get("refresh_token");
      if (at && rt) {
        out.access_token = at;
        out.refresh_token = rt;
        return true;
      }
      return false;
    };

    const urlLike =
      typeof authData.redirect_url === "string"
        ? authData.redirect_url
        : typeof authData.redirectUrl === "string"
          ? authData.redirectUrl
          : typeof authData.url === "string"
            ? authData.url
            : typeof authData.callback_url === "string"
              ? authData.callback_url
              : null;
    if (urlLike?.includes("#")) {
      const frag = urlLike.split("#")[1];
      if (frag) {
        tryParseHash(frag);
      }
    }
    if (
      !out.access_token &&
      typeof authData.fragment === "string" &&
      authData.fragment
    ) {
      tryParseHash(authData.fragment);
    }
    if (authData.access_token) {
      out.access_token = authData.access_token;
    }
    if (authData.refresh_token) {
      out.refresh_token = authData.refresh_token;
    }
    return out;
  }

  /**
   * Handle OAuth callback data (similar to Electron's handleOAuthRedirectCallback)
   * Processes auth data from manual input and exchanges it for a session
   */
  public async handleOAuthCallbackData(
    authData: any
  ): Promise<{ success: boolean; error?: string }> {
    const flowId = authData?.flow_id || authData?.flowId || "unknown";
    try {
      console.log(`[Oasis OAuth][${flowId}] Handling callback data:`, authData);

      const activeFlowId = this.getActiveOAuthFlowId();
      if (activeFlowId) {
        const payloadFlowId = getHandoffFlowId(
          authData && typeof authData === "object" ? authData : {}
        );
        if (!payloadFlowId || payloadFlowId !== activeFlowId) {
          console.warn(
            `[Oasis OAuth][${flowId}] Handoff flow_id does not match active OAuth launch`
          );
          return {
            success: false,
            error: "Authentication failed. Please try signing in again.",
          };
        }
      }

      if (authData && typeof authData === "object" && authData.timestamp) {
        const handoffCheck = validateHandoffPayload(authData, {
          expectedFlowId: activeFlowId || undefined,
          callbackBaseUrl: this.getOAuthCallbackBaseUrl(),
        });
        if (!handoffCheck.ok) {
          console.warn(
            `[Oasis OAuth][${flowId}] Handoff validation failed:`,
            handoffCheck.error
          );
          this.clearActiveOAuthLaunch(flowId);
          return {
            success: false,
            error: "Authentication failed. Please try signing in again.",
          };
        }
      }

      const normalized = this.normalizeOAuthCallbackPayload(authData);
      if (
        !normalized.code &&
        !(normalized.access_token && normalized.refresh_token)
      ) {
        const safeKeys = Object.keys(authData || {}).filter(
          k => !/^(access_token|refresh_token|provider_token)$/i.test(k)
        );
        console.warn(
          `[Oasis OAuth][${flowId}] Incomplete handoff (no code or tokens). Keys: ${safeKeys.join(", ")}`
        );
        this.clearActiveOAuthLaunch(flowId);
        return {
          success: false,
          error:
            "Complete sign-in in the browser window that opened, then return here.",
        };
      }

      // Handle auth code exchange (preferred method)
      if (normalized.code) {
        console.log(
          `[Oasis OAuth][${flowId}] Exchanging auth code for session...`
        );
        const { data, error } = await this.supabase.auth.exchangeCodeForSession(
          normalized.code
        );
        if (error) {
          console.error(
            `[Oasis OAuth][${flowId}] Failed to exchange code for session:`,
            error.message
          );
          this.clearActiveOAuthLaunch(flowId);
          return { success: false, error: error.message };
        } else {
          console.log(
            `[Oasis OAuth][${flowId}] Exchanged code for session for user:`,
            data.user?.id
          );

          // Ensure user profile exists
          if (data.user) {
            await this.rpcEnsureUserProfile(data.user);
            const existingProfile = await this.getUserProfile();
            if (!existingProfile) {
              await this.createUserProfile(
                data.user,
                data.user.user_metadata?.name
              );
              console.log(
                `[Oasis OAuth][${flowId}] Created user profile from OAuth callback`
              );
            }

            // Update last login and create session
            await this.updateLastLogin(data.user.id);
            await this.createSession(data.user.id);
          }

          this.clearActiveOAuthLaunch(flowId);
          return { success: true };
        }
      }

      // Handle direct token setting (fallback; deprecated)
      if (normalized.access_token && normalized.refresh_token) {
        console.warn(
          `[Oasis OAuth][${flowId}] Token handoff is deprecated; use authorization code`
        );
        console.log(`[Oasis OAuth][${flowId}] Setting session from tokens...`);
        const { data, error } = await this.supabase.auth.setSession({
          access_token: normalized.access_token,
          refresh_token: normalized.refresh_token,
        });
        if (error) {
          console.error(
            `[Oasis OAuth][${flowId}] Failed to set session from tokens:`,
            error.message
          );
          this.clearActiveOAuthLaunch(flowId);
          return { success: false, error: error.message };
        } else {
          console.log(
            `[Oasis OAuth][${flowId}] Set session from tokens for user:`,
            data.user?.id
          );

          // Ensure user profile exists
          if (data.user) {
            await this.rpcEnsureUserProfile(data.user);
            const existingProfile = await this.getUserProfile();
            if (!existingProfile) {
              await this.createUserProfile(
                data.user,
                data.user.user_metadata?.name
              );
              console.log(
                `[Oasis OAuth][${flowId}] Created user profile from tokens`
              );
            }

            // Update last login and create session
            await this.updateLastLogin(data.user.id);
            await this.createSession(data.user.id);
          }

          this.clearActiveOAuthLaunch(flowId);
          return { success: true };
        }
      }

      console.warn(
        `[Oasis OAuth][${flowId}] No valid OAuth data after normalization`
      );
      this.clearActiveOAuthLaunch(flowId);
      return {
        success: false,
        error:
          "Complete sign-in in the browser window that opened, then return here.",
      };
    } catch (error) {
      console.error(
        `[Oasis OAuth][${flowId}] Error handling callback data:`,
        error
      );
      this.clearActiveOAuthLaunch(flowId);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // User Profile Management
  public async getUserProfile(): Promise<UserProfile | null> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return null;

      const { data, error } = await this.supabase
        .from("users")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error fetching user profile:", error.message);
        return null;
      }

      return data as UserProfile;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
  }

  // Auth State Management
  public onAuthStateChange(callback: (state: AuthState) => void): void {
    this.authStateCallbacks.push(callback);
  }

  private async handleAuthStateChange(
    event: string,
    session: Session | null
  ): Promise<void> {
    const user = session?.user || null;
    const authState: AuthState = {
      user,
      session,
      isAuthenticated: user !== null,
    };

    // Notify all callbacks
    this.authStateCallbacks.forEach(callback => {
      try {
        callback(authState);
      } catch (error) {
        console.error("Error in auth state callback:", error);
      }
    });

    // Handle session creation/destruction
    if (event === "SIGNED_IN" && user) {
      await this.rpcEnsureUserProfile(user);
      await this.trackSessionForUser(user.id);
    } else if (event === "SIGNED_OUT" && this.currentSession) {
      this.lastTrackedSessionUserId = null;
      await this.endSession(this.currentSession.session_id);
      this.currentSession = null;
    } else if (event === "SIGNED_OUT") {
      this.lastTrackedSessionUserId = null;
    }
  }

  private async rpcEnsureUserProfile(user: User): Promise<void> {
    try {
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const fullName =
        typeof meta?.full_name === "string" ? meta.full_name : undefined;
      const metaName = typeof meta?.name === "string" ? meta.name : undefined;
      const { error } = await this.supabase.rpc("ensure_user_profile", {
        p_email: user.email ?? "",
        p_name: fullName ?? metaName ?? null,
      });
      if (error) {
        console.warn("ensure_user_profile RPC:", error.message);
      }
    } catch (error) {
      console.warn("ensure_user_profile RPC failed:", error);
    }
  }

  // Database Operations
  private async createUserProfile(user: User, name?: string): Promise<void> {
    try {
      const { error } = await this.supabase.from("users").insert({
        user_id: user.id,
        email: user.email!,
        name: name || user.user_metadata?.name || user.email!.split("@")[0],
        password_hash: "", // Supabase handles this
        status: "active",
      });

      if (error) {
        console.error("Error creating user profile:", error.message);
      } else {
        console.log("User profile created successfully");
      }
    } catch (error) {
      console.error("Error creating user profile:", error);
    }
  }

  private async updateLastLogin(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("users")
        .update({ last_login: new Date().toISOString() })
        .eq("user_id", userId);

      if (error) {
        console.error("Error updating last login:", error.message);
      }
    } catch (error) {
      console.error("Error updating last login:", error);
    }
  }

  private async trackSessionForUser(userId: string): Promise<void> {
    if (
      this.currentSession?.user_id === userId &&
      !(this.currentSession as any)?.ended_at
    ) {
      this.lastTrackedSessionUserId = userId;
      return;
    }

    if (this.lastTrackedSessionUserId === userId) {
      return;
    }

    if (this.sessionTrackInFlight?.userId === userId) {
      await this.sessionTrackInFlight.promise;
      return;
    }

    const pendingTrack = {
      userId,
      promise: Promise.resolve(),
    };

    pendingTrack.promise = this.createSession(userId).finally(() => {
      if (this.sessionTrackInFlight === pendingTrack) {
        this.sessionTrackInFlight = null;
      }
    });

    this.sessionTrackInFlight = pendingTrack;
    await pendingTrack.promise;
    this.lastTrackedSessionUserId = userId;
  }

  private async createSession(userId: string): Promise<void> {
    try {
      const deviceInfo = {
        platform: "browser",
        version: ENV.APP_VERSION,
        userAgent: window.navigator.userAgent,
      };

      const { data, error } = await this.supabase
        .from("sessions")
        .insert({
          user_id: userId,
          device_info: deviceInfo,
        })
        .select()
        .single();

      if (error) {
        // Ignore RLS errors as they might happen if the user is not fully synced yet
        if (error.message.includes("row-level security policy")) {
          console.warn(
            "Session tracking skipped due to RLS policy (non-critical):",
            error.message
          );
        } else {
          console.error("Error creating session:", error.message);
        }
      } else if (data) {
        this.currentSession = data as UserSession;
        console.log("Session created:", data.session_id);
      }
    } catch (error) {
      console.error("Error creating session:", error);
    }
  }

  private async endSession(sessionId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("session_id", sessionId);

      if (error) {
        console.error("Error ending session:", error.message);
      } else {
        console.log("Session ended:", sessionId);
      }
    } catch (error) {
      console.error("Error ending session:", error);
    }
  }

  // Utility Methods
  public handleAuthError(error: AuthError): string {
    // Handle special OAuth URL case
    if (
      error.message &&
      (error.message.startsWith("GOOGLE_OAUTH_URL:") ||
        error.message.startsWith("AZURE_OAUTH_URL:") ||
        error.message.startsWith("APPLE_OAUTH_URL:"))
    ) {
      return error.message; // Return the full message with URL
    }

    switch (error.message) {
      case "Invalid login credentials":
        return "Invalid email or password. Please try again.";
      case "Email not confirmed":
        return "Please check your email and click the confirmation link.";
      case "User already registered":
        return "An account with this email already exists.";
      case "Password should be at least 6 characters":
        return "Password must be at least 6 characters long.";
      case "Unable to validate email address: invalid format":
        return "Please enter a valid email address.";
      case "OAuth provider not found":
        return "Google sign-in is not configured. Please contact support.";
      case "OAuth account not linked":
        return "This Google account is not linked to an existing account.";
      case "Google sign-in is blocked by browser security. Please use email/password authentication instead.":
        return "Google sign-in is blocked by browser security. Please use email/password authentication instead.";
      case "Popup blocked. Please allow popups for this site and try again.":
        return "Popup blocked. Please allow popups for this site and try again.";
      case "Google sign-in was cancelled or failed. Please try again.":
        return "Google sign-in was cancelled or failed. Please try again.";
      case "Google sign-in timed out. Please try again.":
        return "Google sign-in timed out. Please try again.";
      case "Failed to generate OAuth URL":
        return "Failed to generate OAuth URL. Please try again.";
      case "Failed to open OAuth URL. Please allow popups and try again.":
        return "Failed to open OAuth URL. Please allow popups and try again.";
      default:
        return (
          error.message || "An unexpected error occurred. Please try again."
        );
    }
  }
}

// Export singleton instance
export const supabaseAuth = SupabaseAuth.getInstance();
if (typeof window !== "undefined") {
  (window as unknown as { supabaseAuth: typeof supabaseAuth }).supabaseAuth =
    supabaseAuth;
}
