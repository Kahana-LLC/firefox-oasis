/**
 * Subscription service — usage tracking and plan limits.
 *
 * Tracks usage units per command (text=1, voice=10), checks monthly
 * limits based on the user's plan (free=50, basic=1500, pro=3000),
 * persists to both Supabase and local IndexedDB (fail-safe).
 * Called before each assistant run to check availability.
 *
 * Feedback bonus tokens: public.feedback_token_grants (UTC day). Quota APIs should add
 * public.sum_feedback_bonus_tokens_for_user(user_id) to base daily_limit / remaining.
 */
import { supabaseAuth } from "./supabase";
import { localMemory } from "./localMemory";
import { assistantLogger } from "../utils/assistantLogger.js";
import type { UsageMeta } from "../assistant/messageUtils.js";
import type { QuotaResult } from "../proxyClient.js";

// Plan Limits (Units per month)
// Plan A ($20): 1500 units
// Plan B ($40): 3000 units
// Default/Free: 50 units (trial)
const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  basic: 1500, // $20/mo
  pro: 3000, // $40/mo
};

const PLAN_DAILY_TOKEN_LIMITS: Record<string, number> = {
  free: 100_000,
  basic: 1_000_000,
  pro: 2_000_000,
};

const DEFAULT_LIMIT = 50;
const DEFAULT_DAILY_TOKEN_LIMIT = 100_000;

// Unit Costs
const COST_TEXT = 1;
const COST_VOICE = 10;

const logDebug = (message: unknown, ...meta: unknown[]): void => {
  assistantLogger.debug(
    "subscription",
    String(message ?? ""),
    meta.length === 0 ? undefined : meta.length === 1 ? meta[0] : meta
  );
};

const logWarn = (message: unknown, ...meta: unknown[]): void => {
  assistantLogger.warn(
    "subscription",
    String(message ?? ""),
    meta.length === 0 ? undefined : meta.length === 1 ? meta[0] : meta
  );
};

const logError = (message: unknown, ...meta: unknown[]): void => {
  assistantLogger.error(
    "subscription",
    String(message ?? ""),
    meta.length === 0 ? undefined : meta.length === 1 ? meta[0] : meta
  );
};

export interface UsageStats {
  totalUnits: number;
  limit: number;
  remaining: number;
  isLimitReached: boolean;
}

export type DailyTokenUsageDisplay = {
  used: number;
  limit: number;
  baseLimit: number;
  bonusTokens: number;
  remaining: number;
  percentUsed: number;
  percentOfBase: number;
};

export class SubscriptionService {
  private static instance: SubscriptionService;

  // Cache current plan details to avoid hitting DB on every keystroke
  private cachedLimit: number | null = null;
  private cachedUsage: number = 0;
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL = 60 * 1000; // 1 minute cache

  private cachedDailyLimit: number | null = null;
  private cachedDailyUsedFromApi: number | null = null;
  private cachedDailyRemainingFromApi: number | null = null;
  private cachedDailyTokensFromDb: number = 0;
  private cachedDailyTokenLimitSupabase: number | null = null;
  private cachedFeedbackBonusTokensToday: number = 0;

  private constructor() {}

  public static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  public updateFromQuota(quota: QuotaResult | undefined | null): void {
    if (!quota) return;
    if (quota.monthly_limit !== undefined) {
      this.cachedLimit = quota.monthly_limit;
    }
    if (quota.monthly_used !== undefined) {
      this.cachedUsage = quota.monthly_used;
    }
    if (quota.daily_limit !== undefined) {
      this.cachedDailyLimit = quota.daily_limit;
    }
    if (quota.daily_used !== undefined) {
      this.cachedDailyUsedFromApi = quota.daily_used;
    }
    if (quota.daily_remaining !== undefined) {
      this.cachedDailyRemainingFromApi = quota.daily_remaining;
    }
    this.lastFetchTime = Date.now();
    logDebug(
      `updateFromQuota: monthly limit=${this.cachedLimit} used=${this.cachedUsage}; daily limit=${this.cachedDailyLimit} used=${this.cachedDailyUsedFromApi}`
    );
  }

  public getDailyTokenUsageForDisplay(): DailyTokenUsageDisplay {
    const fromApiLimit =
      this.cachedDailyLimit !== null && this.cachedDailyLimit > 0
        ? this.cachedDailyLimit
        : null;
    const fromSupabaseLimit =
      this.cachedDailyTokenLimitSupabase !== null &&
      this.cachedDailyTokenLimitSupabase > 0
        ? this.cachedDailyTokenLimitSupabase
        : null;
    const baseLimit = Math.max(
      1,
      fromApiLimit ?? fromSupabaseLimit ?? DEFAULT_DAILY_TOKEN_LIMIT
    );
    const bonusTokens = Math.max(0, this.cachedFeedbackBonusTokensToday);
    const limit = baseLimit + bonusTokens;
    const fromApi = this.cachedDailyUsedFromApi ?? 0;
    const fromDb = this.cachedDailyTokensFromDb;
    const used = Math.max(0, Math.max(fromApi, fromDb));
    const remaining = Math.max(0, limit - used);
    const percentOfBase =
      baseLimit > 0
        ? Math.min(9999, Math.round((used / baseLimit) * 1000) / 10)
        : 0;
    const percentUsed =
      limit > 0
        ? Math.min(9999, Math.round((used / limit) * 1000) / 10)
        : 0;
    return {
      used,
      limit,
      baseLimit,
      bonusTokens,
      remaining,
      percentUsed,
      percentOfBase,
    };
  }

  public async getUsageBarData(): Promise<DailyTokenUsageDisplay> {
    await this.forceRefresh();
    return this.getDailyTokenUsageForDisplay();
  }

  /**
   * Track usage for a command
   * @param type 'text' or 'voice'
   * @param model Optional model name for record keeping
   */
  public async trackUsage(
    type: "text" | "voice",
    model: string = "gemini-1.5-flash",
    meta?: UsageMeta
  ): Promise<void> {
    const user = await supabaseAuth.getCurrentUser();
    if (!user) {
      logWarn("trackUsage: No user found.");
      return;
    }

    // Calculate units
    const units = type === "voice" ? COST_VOICE : COST_TEXT;
    logDebug(
      `trackUsage: Tracking ${units} units for ${type} (User: ${user.id})`
    );

    // Optimistically update cache
    this.cachedUsage += units;
    logDebug(`trackUsage: cachedUsage is now ${this.cachedUsage}`);

    // Fail-safe: Save to local memory immediately so we don't lose it if DB fails
    localMemory
      .saveUsage(user.id, this.cachedUsage)
      .catch(e => logError("Failed to save local usage:", e));

    // Async fire-and-forget insert to not block UI
    const supabase = (supabaseAuth as any).supabase;

    supabase
      .from("llm_usage")
      .insert({
        user_id: user.id,
        tokens_used: units,
        usage_count: units,
        model_used: `${type}:${model}`,
        success: true,
        command_type: meta?.command_type ?? null,
        user_intent: meta?.user_intent ?? null,
        input_tokens: meta?.input_tokens ?? 0,
        output_tokens: meta?.output_tokens ?? 0,
      })
      .then(({ error }: any) => {
        if (error) logError("Failed to track usage (DB Insert):", error);
        else logDebug("trackUsage: DB insert successful");
      });
  }

  /**
   * Check if the user can proceed with a command
   */
  public async checkAvailability(): Promise<UsageStats> {
    const user = await supabaseAuth.getCurrentUser();

    // If not logged in, they can't use it anyway (handled by auth check),
    // but safe fallback:
    if (!user) {
      return { totalUnits: 0, limit: 0, remaining: 0, isLimitReached: true };
    }

    // Refresh cache if stale or never fetched
    if (
      this.lastFetchTime === 0 ||
      Date.now() - this.lastFetchTime > this.CACHE_TTL
    ) {
      await this.refreshUsageData(user.id);
    }

    const limit = this.cachedLimit ?? DEFAULT_LIMIT;
    // Ensure non-negative
    const remaining = Math.max(0, limit - this.cachedUsage);

    return {
      totalUnits: this.cachedUsage,
      limit,
      remaining,
      isLimitReached: this.cachedUsage >= limit,
    };
  }

  public getSubscriptionUrl(): string {
    return "https://kahana.co/oasis-pricing";
  }

  public async forceRefresh(): Promise<void> {
    const user = await supabaseAuth.getCurrentUser();
    if (user) {
      this.lastFetchTime = 0;
      await this.refreshUsageData(user.id);
    }
  }

  private async refreshUsageData(userId: string): Promise<void> {
    const supabase = (supabaseAuth as any).supabase;
    logDebug("refreshUsageData: syncing usage...");

    // 1. Get User Plan Limit
    let limit = DEFAULT_LIMIT;

    const { data: planData, error: planError } = await supabase
      .from("user_plans")
      .select(
        `
                plan_id,
                stripe_subscription_id,
                is_active,
                plans ( name, llm_call_limit )
            `
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    logDebug(`refreshUsageData: Primary query result:`, {
      planData,
      planError,
      hasPlansJoin: planData && planData.plans ? true : false,
      userId,
    });

    let planNameKey = "free";
    let planIdForDaily: string | null = null;
    if (planData) {
      if (planData.plan_id != null) {
        planIdForDaily = String(planData.plan_id);
      }
      const joined = planData.plans as { name?: string } | null | undefined;
      if (joined && typeof joined.name === "string" && joined.name) {
        planNameKey = joined.name.toLowerCase();
      }
    }

    if (planData && planData.plans) {
      const dbLimit = planData.plans.llm_call_limit;
      const planName = (planData.plans.name || "").toLowerCase();
      if (dbLimit) {
        limit = dbLimit;
        logDebug(`refreshUsageData: Using plan limit from DB: ${limit}`);
      } else if (PLAN_LIMITS[planName]) {
        limit = PLAN_LIMITS[planName];
        logDebug(
          `refreshUsageData: Using plan limit from name mapping: ${limit}`
        );
      }
    } else if (planData && planData.is_active) {
      const stripeSubId = planData.stripe_subscription_id;
      const hasStripeSubscription =
        stripeSubId &&
        typeof stripeSubId === "string" &&
        stripeSubId.trim() !== "";

      logDebug(
        `refreshUsageData: Plans join failed but planData exists, checking stripe_subscription_id:`,
        {
          stripeSubId,
          hasStripeSubscription,
          is_active: planData.is_active,
        }
      );

      if (hasStripeSubscription) {
        limit = PLAN_LIMITS["basic"];
        planNameKey = "basic";
        logDebug(
          `refreshUsageData: Using Basic plan limit (1500) based on stripe_subscription_id from primary query: ${stripeSubId}`
        );
      } else {
        logWarn(
          "refreshUsageData: Plan data exists but no valid stripe_subscription_id, trying fallback query"
        );
      }
    }

    if (limit === DEFAULT_LIMIT) {
      logWarn(
        "refreshUsageData: Limit still at default, trying fallback query without join"
      );
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("user_plans")
        .select("plan_id, stripe_subscription_id, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      logDebug(`refreshUsageData: Fallback query result:`, {
        fallbackData,
        fallbackError,
        userId,
      });

      if (fallbackError) {
        logError("refreshUsageData: Fallback query error:", fallbackError);
      }

      if (fallbackData && fallbackData.is_active) {
        if (planIdForDaily === null && fallbackData.plan_id != null) {
          planIdForDaily = String(fallbackData.plan_id);
        }
        const stripeSubId = fallbackData.stripe_subscription_id;
        const hasStripeSubscription =
          stripeSubId &&
          typeof stripeSubId === "string" &&
          stripeSubId.trim() !== "";

        logDebug(`refreshUsageData: Checking stripe_subscription_id:`, {
          stripeSubId,
          hasStripeSubscription,
          type: typeof stripeSubId,
        });

        if (hasStripeSubscription) {
          limit = PLAN_LIMITS["basic"];
          planNameKey = "basic";
          logDebug(
            `refreshUsageData: Using Basic plan limit (1500) based on stripe_subscription_id: ${stripeSubId}`
          );
        } else {
          logWarn(
            "refreshUsageData: Active plan found but no valid stripe_subscription_id, using free plan limit"
          );
        }
      } else {
        logWarn(
          "refreshUsageData: No active plan found for user, using free plan limit",
          {
            fallbackData,
            userId,
          }
        );
      }
    }

    logDebug(`refreshUsageData: Final limit set to: ${limit}`);
    this.cachedLimit = limit;

    // 2. Get Current Month Usage from DB
    let dbTotal = 0;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usageData, error: usageError } = await supabase
      .from("llm_usage")
      .select("usage_count")
      .eq("user_id", userId)
      .gte("created_at", startOfMonth.toISOString());

    if (usageData) {
      dbTotal = usageData.reduce(
        (acc: number, row: any) => acc + (row.usage_count || 0),
        0
      );
    }

    // 3. Get Local Usage (Fail-safe)
    const localTotal = await localMemory.getUsage(userId);

    // 4. Reconcile: DB is source of truth if fetch succeeds
    if (!usageError && usageData) {
      this.cachedUsage = dbTotal;
      // Sync local down to DB truth (resets at month rollover)
      localMemory
        .saveUsage(userId, dbTotal)
        .catch(e => logWarn("refreshUsageData: sync local:", e));
    } else {
      if (usageError) {
        logWarn(
          "refreshUsageData: DB fetch failed (RLS?), using local only.",
          usageError.message
        );
      }
      this.cachedUsage = Math.max(dbTotal, localTotal);
    }

    logDebug(
      `refreshUsageData: DB=${dbTotal}, Local=${localTotal} -> Final=${this.cachedUsage}`
    );

    let dailyTokLimit: number | null = null;
    if (planIdForDaily) {
      const { data: planRow, error: planRowErr } = await supabase
        .from("plans")
        .select("daily_token_limit")
        .eq("id", planIdForDaily)
        .maybeSingle();
      if (!planRowErr && planRow && planRow.daily_token_limit != null) {
        const n = Number(planRow.daily_token_limit);
        if (Number.isFinite(n) && n > 0) {
          dailyTokLimit = n;
        }
      }
    }
    this.cachedDailyTokenLimitSupabase =
      dailyTokLimit ??
      PLAN_DAILY_TOKEN_LIMITS[planNameKey] ??
      DEFAULT_DAILY_TOKEN_LIMIT;

    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);
    const utcGrantDate = startOfUtcDay.toISOString().slice(0, 10);

    const { data: grantRows, error: grantErr } = await supabase
      .from("feedback_token_grants")
      .select("tokens")
      .eq("user_id", userId)
      .eq("grant_date_utc", utcGrantDate);

    if (!grantErr && grantRows) {
      this.cachedFeedbackBonusTokensToday = grantRows.reduce(
        (acc: number, row: { tokens?: number }) =>
          acc + (Number(row.tokens) || 0),
        0
      );
    } else {
      if (grantErr) {
        logWarn(
          "refreshUsageData: feedback_token_grants fetch failed",
          grantErr.message
        );
      }
      this.cachedFeedbackBonusTokensToday = 0;
    }

    const { data: dayRows, error: dayErr } = await supabase
      .from("llm_usage")
      .select("input_tokens, output_tokens")
      .eq("user_id", userId)
      .gte("created_at", startOfUtcDay.toISOString());

    if (!dayErr && dayRows) {
      this.cachedDailyTokensFromDb = dayRows.reduce(
        (acc: number, row: { input_tokens?: number; output_tokens?: number }) =>
          acc +
          (Number(row.input_tokens) || 0) +
          (Number(row.output_tokens) || 0),
        0
      );
    } else {
      if (dayErr) {
        logWarn(
          "refreshUsageData: daily token aggregate failed",
          dayErr.message
        );
      }
    }

    this.lastFetchTime = Date.now();
  }
}

export const subscriptionService = SubscriptionService.getInstance();
