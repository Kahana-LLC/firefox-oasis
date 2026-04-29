import { localMemory } from "./localMemory.js";
import { assistantLogger } from "../utils/assistantLogger.js";
import type { UsageMeta } from "../assistant/messageUtils.js";
import type { QuotaResult } from "../proxyClient.js";
import SupabaseAuth from "./supabase.js";

const supabaseAuth = SupabaseAuth.getInstance();

const DEFAULT_LIMIT = 50;
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
    
    // Cache current plan details
    private cachedLimit: number | null = null;
    private cachedUsage: number = 0;
    private lastFetchTime: number = 0;

    private constructor() {}

    public static getInstance(): SubscriptionService {
        if (!SubscriptionService.instance) {
            SubscriptionService.instance = new SubscriptionService();
        }
        return SubscriptionService.instance;
    }

    public updateFromQuota(quota: QuotaResult): void {
        this.cachedLimit = quota.monthly_limit || quota.daily_limit || DEFAULT_LIMIT;
        this.cachedUsage = quota.monthly_used || quota.daily_used || 0;
        this.lastFetchTime = Date.now();
        
        // Optimistically drop it in localMemory
        const user = supabaseAuth.getCurrentUserSync?.();
        if (user) {
            localMemory.saveUsage(user.id, this.cachedUsage).catch(() => {});
        }
    }

    public async trackUsage(type: 'text' | 'voice', model: string = 'gemini-1.5-flash', meta?: UsageMeta): Promise<void> {
        // Optimistic UI updates. Formal tracking is now handled entirely securely by the Edge Function
        // or skipped entirely for purely local tool commands.
        const units = type === 'voice' ? COST_VOICE : COST_TEXT;
        this.cachedUsage += units;
        
        const user = await supabaseAuth.getCurrentUser();
        if (user) {
            localMemory.saveUsage(user.id, this.cachedUsage).catch(() => {});
        }
    }

    public async checkAvailability(): Promise<UsageStats> {
        const user = await supabaseAuth.getCurrentUser();
        if (!user) {
            return { totalUnits: 0, limit: 0, remaining: 0, isLimitReached: true };
        }

        if (this.cachedLimit === null) {
            const localTotal = await localMemory.getUsage(user.id);
            if (localTotal !== null) {
                this.cachedUsage = localTotal;
            }
            this.cachedLimit = DEFAULT_LIMIT;
        }

        const limit = this.cachedLimit ?? DEFAULT_LIMIT;
        const remaining = Math.max(0, limit - this.cachedUsage);

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

    public async forceRefresh(): Promise<void> {
        this.cachedLimit = null; // Will just rely on the next assist response naturally
    }
}

export const subscriptionService = SubscriptionService.getInstance();
