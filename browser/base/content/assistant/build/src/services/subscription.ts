import { supabaseAuth } from "./supabase";
import { assistantLogger } from "../utils/assistantLogger.js";
import type { UsageMeta } from "../assistant/messageUtils.js";

const DEFAULT_LIMIT = 10000;
const PAID_FALLBACK_LIMIT = 200000;
const CACHE_TTL = 60 * 1000;

export interface UsageStats {
    totalUnits: number;
    limit: number;
    remaining: number;
    isLimitReached: boolean;
}

export class SubscriptionService {
    private static instance: SubscriptionService;
    
    // Cache current plan details
    private cachedLimit: number | null = null;
    private cachedUsage: number = 0;
    private lastFetchTime: number = 0;

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
    usageDate?: string;
}

export class SubscriptionService {
    private static instance: SubscriptionService;
    
    // Cache current plan details to avoid hitting DB on every keystroke
    private cachedLimit: number | null = null;
    private cachedUsage: number = 0;
    private cachedUsageDate: string | null = null;
    private lastFetchTime: number = 0;

    private constructor() {}

    public static getInstance(): SubscriptionService {
        if (!SubscriptionService.instance) {
            SubscriptionService.instance = new SubscriptionService();
        }
        return SubscriptionService.instance;
    }

    /**
     * Backend now records usage authoritatively. Keep this method as a
     * lightweight cache invalidation hook so existing callers keep working.
     */
    public async trackUsage(_type: 'text' | 'voice', _model: string = 'gemini-2.5-flash', _meta?: UsageMeta): Promise<void> {
        const user = await supabaseAuth.getCurrentUser();
        if (!user) {
            logWarn("trackUsage: No user found.");
            return;
        }
        this.lastFetchTime = 0;
        this.forceRefresh().catch(error => logError("trackUsage: Failed to refresh usage:", error));
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
        if (this.lastFetchTime === 0 || Date.now() - this.lastFetchTime > CACHE_TTL) {
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
            usageDate: this.cachedUsageDate ?? undefined,
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

        let limit = DEFAULT_LIMIT;
        const usageDate = new Date().toISOString().slice(0, 10);

        const { data: planData, error: planError } = await supabase
            .from('user_plans')
            .select(`
                plan_id,
                stripe_subscription_id,
                is_active,
                plans ( daily_token_limit )
            `)
            .eq('user_id', userId)
            .eq('is_active', true)
            .maybeSingle();

        logDebug(`refreshUsageData: Primary query result:`, {
            planData,
            planError,
            hasPlansJoin: planData && planData.plans ? true : false,
            userId
        });

        if (planData && planData.plans) {
            const dbLimit = planData.plans.daily_token_limit;
            if (dbLimit) {
                limit = dbLimit;
                logDebug(`refreshUsageData: Using plan limit from DB: ${limit}`);
            }
        } else if (planData && planData.is_active) {
            const stripeSubId = planData.stripe_subscription_id;
            const hasStripeSubscription = stripeSubId && 
                                         typeof stripeSubId === 'string' &&
                                         stripeSubId.trim() !== '';
            
            logDebug(`refreshUsageData: Plans join failed but planData exists, checking stripe_subscription_id:`, {
                stripeSubId,
                hasStripeSubscription,
                is_active: planData.is_active
            });
            
            if (hasStripeSubscription) {
                limit = PAID_FALLBACK_LIMIT;
                logDebug(`refreshUsageData: Using Basic plan token limit based on stripe_subscription_id from primary query: ${stripeSubId}`);
            } else {
                logWarn("refreshUsageData: Plan data exists but no valid stripe_subscription_id, trying fallback query");
            }
        }
        
        if (limit === DEFAULT_LIMIT) {
            logWarn("refreshUsageData: Limit still at default, trying fallback query without join");
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('user_plans')
                .select('plan_id, stripe_subscription_id, is_active')
                .eq('user_id', userId)
                .eq('is_active', true)
                .maybeSingle();
            
            logDebug(`refreshUsageData: Fallback query result:`, { 
                fallbackData, 
                fallbackError,
                userId 
            });
            
            if (fallbackError) {
                logError("refreshUsageData: Fallback query error:", fallbackError);
            }
            
            if (fallbackData && fallbackData.is_active) {
                const stripeSubId = fallbackData.stripe_subscription_id;
                const hasStripeSubscription = stripeSubId && 
                                             typeof stripeSubId === 'string' &&
                                             stripeSubId.trim() !== '';
                
                logDebug(`refreshUsageData: Checking stripe_subscription_id:`, {
                    stripeSubId,
                    hasStripeSubscription,
                    type: typeof stripeSubId
                });
                
                if (hasStripeSubscription) {
                    limit = PAID_FALLBACK_LIMIT;
                    logDebug(`refreshUsageData: Using Basic plan token limit based on stripe_subscription_id: ${stripeSubId}`);
                } else {
                    logWarn("refreshUsageData: Active plan found but no valid stripe_subscription_id, using free plan limit");
                }
            } else {
                logWarn("refreshUsageData: No active plan found for user, using free plan limit", {
                    fallbackData,
                    userId
                });
            }
        }

        logDebug(`refreshUsageData: Final limit set to: ${limit}`);
        this.cachedLimit = limit;

        let dbTotal = 0;

        const { data: usageData, error: usageError } = await supabase
            .from('llm_daily_usage')
            .select('total_tokens')
            .eq('user_id', userId)
            .eq('usage_date', usageDate)
            .maybeSingle();

        if (usageData) {
            dbTotal = Number(usageData.total_tokens || 0);
        }
        
        if (usageError) {
             logWarn("refreshUsageData: Daily usage fetch failed.", usageError.message);
        }

        this.cachedUsage = Math.max(0, dbTotal);
        this.cachedUsageDate = usageDate;
        logDebug(`refreshUsageData: usage_date=${usageDate}, total_tokens=${this.cachedUsage}`);
        this.lastFetchTime = Date.now();
    }
}

export const subscriptionService = SubscriptionService.getInstance();
