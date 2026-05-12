/**
 * Subscription service — usage tracking and plan limits.
 *
 * Tracks usage units per command (text=1, voice=10), checks monthly
 * limits based on the user's plan (free=50, basic=1500, pro=3000),
 * persists to both Supabase and local IndexedDB (fail-safe).
 * Called before each assistant run to check availability.
 *
 * **Assist tokens (router + inner rounds):** Supabase Edge `oasis-assist` returns
 * `usage_stats` after `record_llm_usage` — call `updateFromAssistUsageStats` so the
 * daily bar matches the server without a second `llm_usage` row. Lambda (and
 * anonymous Edge) return `usage_metadata` only; the router calls
 * `recordAssistRoutingTokens` (token row only, no monthly `usage_count` bump) so
 * `llm_usage` reflects Gemini totals including multi-turn aggregation on the server.
 *
 * Feedback bonus tokens: when `feedback_token_grants` exists, `refreshUsageData` sums today’s
 * UTC grants; otherwise the sum is 0. Successful training also increments a per-UTC-day total in
 * `sessionStorage` so the bar updates without that table. Lambda `quota` may still raise the
 * displayed cap via `getDailyTokenUsageForDisplay` when the triple is self-consistent.
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

const OPTIMISTIC_FEEDBACK_BONUS_KEY = "oasis.daily_training_bonus.verified.";

function utcCalendarDateString(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function readOptimisticFeedbackBonusTokensToday(): number {
  try {
    const raw = sessionStorage.getItem(
      OPTIMISTIC_FEEDBACK_BONUS_KEY + utcCalendarDateString()
    );
    const n = parseInt(String(raw || "0"), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeOptimisticFeedbackBonusTokensToday(total: number): void {
  try {
    sessionStorage.setItem(
      OPTIMISTIC_FEEDBACK_BONUS_KEY + utcCalendarDateString(),
      String(Math.max(0, Math.floor(total)))
    );
  } catch {
    void 0;
  }
}

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
  private cachedDailyTokensFromDbOk: boolean = false;
  private cachedDailyTokenLimitSupabase: number | null = null;
  private cachedFeedbackBonusTokensToday: number = 0;

  private constructor() {}

  public static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  /**
   * Call after a qualifying training save succeeds so the daily bar reflects bonus tokens
   * even when `feedback_token_grants` is unavailable. Persists for the current UTC calendar day.
   */
  public appendOptimisticTrainingBonus(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }
    const add = Math.floor(amount);
    const prevCached = this.cachedFeedbackBonusTokensToday;
    writeOptimisticFeedbackBonusTokensToday(
      readOptimisticFeedbackBonusTokensToday() + add
    );
    const fromStorage = readOptimisticFeedbackBonusTokensToday();
    this.cachedFeedbackBonusTokensToday = Math.max(
      prevCached + add,
      fromStorage
    );
  }

  public getUsageBarSnapshot(): DailyTokenUsageDisplay {
    return this.getDailyTokenUsageForDisplay();
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

  /**
   * Apply `usage_stats` from Supabase Edge assist (post-`record_llm_usage`).
   * Avoid calling `trackUsage` for the same request when this object is present.
   */
  public updateFromAssistUsageStats(
    stats: Record<string, unknown> | null | undefined
  ): void {
    if (!stats || typeof stats !== "object") {
      return;
    }
    const patch: QuotaResult = {};
    if (
      typeof stats.total_tokens === "number" &&
      Number.isFinite(stats.total_tokens)
    ) {
      patch.daily_used = stats.total_tokens;
    }
    if (typeof stats.limit === "number" && Number.isFinite(stats.limit)) {
      patch.daily_limit = stats.limit;
    }
    if (
      typeof stats.remaining === "number" &&
      Number.isFinite(stats.remaining)
    ) {
      patch.daily_remaining = stats.remaining;
    }
    if (Object.keys(patch).length > 0) {
      this.updateFromQuota(patch);
    }
  }

  public getDailyTokenUsageForDisplay(): DailyTokenUsageDisplay {
    const fromSupabaseLimit =
      this.cachedDailyTokenLimitSupabase !== null &&
      this.cachedDailyTokenLimitSupabase > 0
        ? this.cachedDailyTokenLimitSupabase
        : null;
    const baseLimit = Math.max(
      1,
      fromSupabaseLimit ?? DEFAULT_DAILY_TOKEN_LIMIT
    );
    const bonusTokens = Math.max(0, this.cachedFeedbackBonusTokensToday);
    const limit = baseLimit + bonusTokens;
    const fromApi = this.cachedDailyUsedFromApi ?? 0;
    const fromDb = this.cachedDailyTokensFromDb;
    const used = Math.max(
      0,
      this.cachedDailyTokensFromDbOk ? fromDb : Math.max(fromApi, fromDb)
    );
    const remaining = Math.max(0, limit - used);
    const percentOfBase =
      baseLimit > 0
        ? Math.min(9999, Math.round((used / baseLimit) * 1000) / 10)
        : 0;
    const percentUsed =
      limit > 0 ? Math.min(9999, Math.round((used / limit) * 1000) / 10) : 0;
    const local: DailyTokenUsageDisplay = {
      used,
      limit,
      baseLimit,
      bonusTokens,
      remaining,
      percentUsed,
      percentOfBase,
    };

    const qLimit = this.cachedDailyLimit;
    const qUsed = this.cachedDailyUsedFromApi;
    const qRem = this.cachedDailyRemainingFromApi;
    if (
      qLimit != null &&
      qLimit > 0 &&
      qUsed != null &&
      qRem != null &&
      Number.isFinite(qUsed) &&
      Number.isFinite(qRem) &&
      Math.abs(qUsed + qRem - qLimit) <= 2 &&
      qLimit >= local.limit
    ) {
      const qBonus = Math.max(0, qLimit - local.baseLimit);
      const qPercentOfBase =
        local.baseLimit > 0
          ? Math.min(9999, Math.round((qUsed / local.baseLimit) * 1000) / 10)
          : 0;
      const qPercentUsed =
        qLimit > 0
          ? Math.min(9999, Math.round((qUsed / qLimit) * 1000) / 10)
          : 0;
      return {
        used: qUsed,
        limit: qLimit,
        baseLimit: local.baseLimit,
        bonusTokens: qBonus,
        remaining: qRem,
        percentUsed: qPercentUsed,
        percentOfBase: qPercentOfBase,
      };
    }

    return local;
  }

  public async getUsageBarData(): Promise<DailyTokenUsageDisplay> {
    await this.forceRefresh();
    return this.getUsageBarSnapshot();
  }

  /**
   * Track usage for a command
   * @param type 'text' or 'voice'
   * @param model Optional model name for record keeping
   */
  /**
   * Log Gemini tokens for assist **routing** only (`usage_count` / monthly units stay 0).
   * Final assistant turns still use `trackUsage` from the graph stream.
   */
  public recordAssistRoutingTokens(meta: UsageMeta): void {
    void this.recordAssistRoutingTokensAsync(meta);
  }

  private async recordAssistRoutingTokensAsync(meta: UsageMeta): Promise<void> {
    const user = await supabaseAuth.getCurrentUser();
    if (!user) {
      logWarn("recordAssistRoutingTokens: No user found.");
      return;
    }
    const input = Number(meta.input_tokens ?? 0);
    const output = Number(meta.output_tokens ?? 0);
    if (
      !Number.isFinite(input) ||
      !Number.isFinite(output) ||
      (input <= 0 && output <= 0)
    ) {
      return;
    }
    const supabase = (supabaseAuth as any).supabase;
    const { error } = await supabase.from("llm_usage").insert({
      user_id: user.id,
      tokens_used: 0,
      usage_count: 0,
      model_used: "assist-router",
      success: true,
      command_type: meta.command_type ?? null,
      user_intent: meta.user_intent ?? null,
      input_tokens: input,
      output_tokens: output,
    });
    if (error) {
      logError("recordAssistRoutingTokens: DB insert failed", error);
    } else {
      logDebug("recordAssistRoutingTokens: logged routing tokens", {
        input,
        output,
      });
    }
  }

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

    let grantSum = 0;
    const { data: grantRows, error: grantErr } = await supabase
      .from("feedback_token_grants")
      .select("tokens")
      .eq("user_id", userId)
      .eq("grant_date_utc", utcGrantDate);

    if (!grantErr && grantRows) {
      grantSum = grantRows.reduce(
        (acc: number, row: { tokens?: number }) =>
          acc + (Number(row.tokens) || 0),
        0
      );
    } else if (grantErr) {
      logDebug(
        "refreshUsageData: feedback_token_grants unavailable or error",
        grantErr.message
      );
    }

    const optimistic = readOptimisticFeedbackBonusTokensToday();
    this.cachedFeedbackBonusTokensToday = Math.max(
      grantSum,
      optimistic,
      this.cachedFeedbackBonusTokensToday
    );

    this.cachedDailyTokensFromDbOk = false;
    const { data: dayRows, error: dayErr } = await supabase
      .from("llm_usage")
      .select("input_tokens, output_tokens")
      .eq("user_id", userId)
      .gte("created_at", startOfUtcDay.toISOString());

    if (!dayErr && dayRows) {
      this.cachedDailyTokensFromDbOk = true;
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
