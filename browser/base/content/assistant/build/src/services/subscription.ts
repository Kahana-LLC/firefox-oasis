import { supabaseAuth } from "./supabase";
import { localMemory } from "./localMemory";

// Plan Limits (Units per month)
// Plan A ($20): 1500 units
// Plan B ($40): 3000 units
// Default/Free: 50 units (trial)
const PLAN_LIMITS: Record<string, number> = {
    "free": 50,
    "basic": 1500, // $20/mo
    "pro": 3000    // $40/mo
};

const DEFAULT_LIMIT = 50;

// Unit Costs
const COST_TEXT = 1;
const COST_VOICE = 10;

export interface UsageStats {
    totalUnits: number;
    limit: number;
    remaining: number;
    isLimitReached: boolean;
}

export class SubscriptionService {
    private static instance: SubscriptionService;
    
    // Cache current plan details to avoid hitting DB on every keystroke
    private cachedLimit: number | null = null;
    private cachedUsage: number = 0;
    private lastFetchTime: number = 0;
    private readonly CACHE_TTL = 60 * 1000; // 1 minute cache

    private constructor() {}

    public static getInstance(): SubscriptionService {
        if (!SubscriptionService.instance) {
            SubscriptionService.instance = new SubscriptionService();
        }
        return SubscriptionService.instance;
    }

    /**
     * Track usage for a command
     * @param type 'text' or 'voice'
     * @param model Optional model name for record keeping
     */
    public async trackUsage(type: 'text' | 'voice', model: string = 'gemini-1.5-flash'): Promise<void> {
        const user = await supabaseAuth.getCurrentUser();
        if (!user) {
            console.warn("trackUsage: No user found.");
            return;
        }

        // Calculate units
        const units = type === 'voice' ? COST_VOICE : COST_TEXT;
        console.log(`trackUsage: Tracking ${units} units for ${type} (User: ${user.id})`);

        // Optimistically update cache
        this.cachedUsage += units;
        console.log(`trackUsage: cachedUsage is now ${this.cachedUsage}`);
        
        // Fail-safe: Save to local memory immediately so we don't lose it if DB fails
        localMemory.saveUsage(user.id, this.cachedUsage).catch(e => console.error("Failed to save local usage:", e));

        // Async fire-and-forget insert to not block UI
        const supabase = (supabaseAuth as any).supabase;
        
        supabase.from('llm_usage').insert({
            user_id: user.id,
            usage_count: units, 
            model_used: `${type}:${model}`,
            success: true
        }).then(({ error }: any) => {
            if (error) console.error("Failed to track usage (DB Insert):", error);
            else console.log("trackUsage: DB insert successful");
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
            console.warn("checkAvailability: No user found");
            return { totalUnits: 0, limit: 0, remaining: 0, isLimitReached: true };
        }

        console.log(`checkAvailability: Checking for user ${user.id}, cachedLimit=${this.cachedLimit}, lastFetch=${this.lastFetchTime}`);

        // Refresh cache if stale or never fetched
        if (this.lastFetchTime === 0 || Date.now() - this.lastFetchTime > this.CACHE_TTL) {
            console.log("checkAvailability: Cache is stale or never fetched, refreshing...");
            await this.refreshUsageData(user.id);
        } else {
            console.log("checkAvailability: Using cached data");
        }

        const limit = this.cachedLimit ?? DEFAULT_LIMIT;
        // Ensure non-negative
        const remaining = Math.max(0, limit - this.cachedUsage);

        console.log(`checkAvailability: Returning stats - totalUnits=${this.cachedUsage}, limit=${limit}, remaining=${remaining}, isLimitReached=${this.cachedUsage >= limit}`);

        return {
            totalUnits: this.cachedUsage,
            limit,
            remaining,
            isLimitReached: this.cachedUsage >= limit
        };
    }

    public getSubscriptionUrl(): string {
        return "https://kahana.co/oasis-pricing";
    }

    /**
     * Force refresh of usage data (useful after payment/plan changes)
     */
    public async forceRefresh(): Promise<void> {
        const user = await supabaseAuth.getCurrentUser();
        if (!user) {
            console.warn("forceRefresh: No user found.");
            return;
        }
        console.log("forceRefresh: Forcing cache refresh...");
        this.lastFetchTime = 0; // Reset cache timestamp to force refresh
        await this.refreshUsageData(user.id);
    }

    private async refreshUsageData(userId: string): Promise<void> {
        const supabase = (supabaseAuth as any).supabase;
        console.log(`refreshUsageData: syncing usage for userId=${userId}...`);

        // 1. Get User Plan Limit
        let limit = DEFAULT_LIMIT;

        const { data: planData, error: planError } = await supabase
            .from('user_plans')
            .select(`
                plan_id,
                stripe_subscription_id,
                plans ( name, llm_call_limit )
            `)
            .eq('user_id', userId)
            .eq('is_active', true)
            .maybeSingle(); // Use maybeSingle() instead of single() to handle 0 rows gracefully

        // PGRST116 means "0 rows found" - this is expected if user has no plan, not a real error
        let finalPlanData = planData;
        
        if (planError && planError.code !== 'PGRST116') {
            console.error("refreshUsageData: Failed to fetch user plan:", planError);
            console.error("  Error code:", planError.code);
            console.error("  Error message:", planError.message);
            console.error("  Error details:", JSON.stringify(planError, null, 2));
        } else if ((planError && planError.code === 'PGRST116') || (!planData && !planError)) {
            // maybeSingle() returns null data with no error when 0 rows found
            console.log("refreshUsageData: Query returned 0 rows. This could mean:");
            console.log("  1. User has no active subscription");
            console.log("  2. RLS policy is blocking access");
            console.log("  3. User ID mismatch");
            
            // Try an alternative query without the join to see if RLS is the issue
            console.log("refreshUsageData: Trying alternative query without plans join...");
            const { data: simplePlanData, error: simpleError } = await supabase
                .from('user_plans')
                .select('plan_id, stripe_subscription_id, is_active')
                .eq('user_id', userId)
                .eq('is_active', true)
                .maybeSingle();
            
            if (simplePlanData) {
                console.log("refreshUsageData: Alternative query succeeded! RLS might be blocking the plans join.");
                console.log("refreshUsageData: Found plan data:", {
                    plan_id: simplePlanData.plan_id,
                    stripe_subscription_id: simplePlanData.stripe_subscription_id,
                    is_active: simplePlanData.is_active
                });
                
                // Use the simple data if we have stripe_subscription_id
                if (simplePlanData.stripe_subscription_id && simplePlanData.is_active) {
                    console.log("refreshUsageData: Active Stripe subscription found via alternative query. Granting basic plan (1500 units).");
                    limit = PLAN_LIMITS["basic"];
                    finalPlanData = simplePlanData as any;
                }
            } else if (simpleError) {
                console.error("refreshUsageData: Alternative query also failed:", simpleError);
            } else {
                console.log("refreshUsageData: Alternative query also returned 0 rows.");
            }
        }

        if (finalPlanData) {
            console.log("refreshUsageData: planData found:", {
                plan_id: finalPlanData.plan_id,
                plan_id_type: typeof finalPlanData.plan_id,
                plan_id_null: finalPlanData.plan_id === null,
                has_plans_join: !!(finalPlanData as any).plans,
                plans_value: (finalPlanData as any).plans,
                stripe_subscription_id: finalPlanData.stripe_subscription_id,
                stripe_subscription_id_present: !!finalPlanData.stripe_subscription_id
            });

            if ((finalPlanData as any).plans) {
                const dbLimit = (finalPlanData as any).plans.llm_call_limit;
                const planName = ((finalPlanData as any).plans.name || "").toLowerCase();
                if (dbLimit) {
                    limit = dbLimit;
                    console.log(`refreshUsageData: Using plan limit from DB: ${limit}`);
                } else if (planName && PLAN_LIMITS[planName]) {
                    limit = PLAN_LIMITS[planName];
                    console.log(`refreshUsageData: Using plan limit from name "${planName}": ${limit}`);
                }
            }
            
            // If plan_id is null but user has an active Stripe subscription, grant basic plan (1500 units)
            // Query already filters for is_active = true, so we just need to check stripe_subscription_id
            if (!(finalPlanData as any).plans && finalPlanData.stripe_subscription_id) {
                console.log("refreshUsageData: Active Stripe subscription found. Granting basic plan (1500 units).");
                limit = PLAN_LIMITS["basic"];
            } else if (!(finalPlanData as any).plans && !finalPlanData.stripe_subscription_id) {
                console.warn("refreshUsageData: No plans join AND no stripe_subscription_id. This shouldn't happen for paid users.");
            }
        } else {
            console.warn(`refreshUsageData: No active plan found for user ${userId}. Using free plan limit.`);
            console.warn("  This could mean:");
            console.warn("  1. User has no active subscription in user_plans table");
            console.warn("  2. Query failed silently (check error above)");
            console.warn("  3. User ID mismatch");
        }

        console.log(`refreshUsageData: Final limit set to: ${limit}`);
        this.cachedLimit = limit;

        // 2. Get Current Month Usage from DB
        let dbTotal = 0;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { data: usageData, error: usageError } = await supabase
            .from('llm_usage')
            .select('usage_count')
            .eq('user_id', userId)
            .gte('timestamp', startOfMonth.toISOString());

        if (usageData) {
            dbTotal = usageData.reduce((acc: number, row: any) => acc + (row.usage_count || 0), 0);
        }
        
        if (usageError) {
             console.warn("refreshUsageData: DB fetch failed (RLS?), using local only.", usageError.message);
        }

        // 3. Get Local Usage (Fail-safe)
        const localTotal = await localMemory.getUsage(userId);

        // 4. Reconcile: Take the MAX (never go backwards)
        this.cachedUsage = Math.max(dbTotal, localTotal);
        console.log(`refreshUsageData: DB=${dbTotal}, Local=${localTotal} -> Final=${this.cachedUsage}`);

        this.lastFetchTime = Date.now();
    }
}

export const subscriptionService = SubscriptionService.getInstance();
