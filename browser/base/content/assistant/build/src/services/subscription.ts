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
            return { totalUnits: 0, limit: 0, remaining: 0, isLimitReached: true };
        }

        // Refresh cache if stale
        if (Date.now() - this.lastFetchTime > this.CACHE_TTL) {
            await this.refreshUsageData(user.id);
        }

        const limit = this.cachedLimit ?? DEFAULT_LIMIT;
        // Ensure non-negative
        const remaining = Math.max(0, limit - this.cachedUsage);

        return {
            totalUnits: this.cachedUsage,
            limit,
            remaining,
            isLimitReached: this.cachedUsage >= limit
        };
    }

    public getSubscriptionUrl(): string {
        // Placeholder for now, eventually a specific path in the dashboard
        return "https://kahana.co/pricing";
    }

    private async refreshUsageData(userId: string): Promise<void> {
        const supabase = (supabaseAuth as any).supabase;
        console.log("refreshUsageData: syncing usage...");

        // 1. Get User Plan Limit
        let limit = DEFAULT_LIMIT;

        const { data: planData } = await supabase
            .from('user_plans')
            .select(`
                plan_id,
                plans ( name, llm_call_limit )
            `)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (planData && planData.plans) {
             const dbLimit = planData.plans.llm_call_limit;
             const planName = (planData.plans.name || "").toLowerCase();
             if (dbLimit) limit = dbLimit;
             else if (PLAN_LIMITS[planName]) limit = PLAN_LIMITS[planName];
        }

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
