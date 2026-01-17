# Usage Limit Investigation Report
**Date:** January 17, 2026  
**User:** adam@kahana.co  
**Issue:** Usage limit showing 50/50 units despite paid subscription (expected 1500 units/month)

## Executive Summary

The user upgraded to a paid account on January 17, 2026 at 17:52:44, but is still receiving a "Usage limit reached (50/50 units)" error when attempting to use the AI assistant. The expected limit for a paid subscription is 1500 units per month.

## Root Cause Analysis

### 1. Database State
From `user_plans_rows.csv`, the user's account shows:
- **User ID:** `d9d9e9e1-f3e5-4412-9a87-34a826de2781`
- **Plan ID:** `NULL` (empty)
- **Stripe Subscription ID:** `sub_1Sqdg2GAiwY6zSuoJudm5ToO` (present)
- **Status:** `is_active = true`
- **Start Date:** 2026-01-17 17:52:44
- **End Date:** 2026-02-17 17:52:44

### 2. Code Logic Flow

The usage limit checking logic is implemented in:
`browser/base/content/assistant/build/src/services/subscription.ts`

**Plan Limits Defined:**
```typescript
const PLAN_LIMITS: Record<string, number> = {
    "free": 50,
    "basic": 1500, // $20/mo
    "pro": 3000    // $40/mo
};
const DEFAULT_LIMIT = 50;
```

**How Limit is Determined (lines 130-183):**

1. **Query user_plans table:**
   ```typescript
   .select(`
       plan_id,
       stripe_subscription_id,
       plans ( name, llm_call_limit )
   `)
   .eq('user_id', userId)
   .eq('is_active', true)
   .single();
   ```

2. **If planData.plans exists (plan_id is NOT NULL):**
   - Use `plans.llm_call_limit` from database
   - Or fallback to `PLAN_LIMITS[planName]` based on plan name

3. **If plan_id is NULL but stripe_subscription_id exists:**
   ```typescript
   if (!planData.plans && planData.stripe_subscription_id) {
       console.log("refreshUsageData: Active Stripe subscription found. Granting basic plan (1500 units).");
       limit = PLAN_LIMITS["basic"];
   }
   ```
   - **This is the fallback logic that should grant 1500 units**

4. **If no plan found:**
   - Defaults to `DEFAULT_LIMIT = 50` (free plan)

### 3. Recent Fix

A fix was implemented on **January 17, 2026 at 12:40:45** (commit `b847bb8bb813`):
- **Title:** "Fix subscription service to handle NULL plan_id with active Stripe subscriptions"
- **Changes:** Added the fallback logic to grant 1500 units when `plan_id` is NULL but `stripe_subscription_id` exists
- **Status:** This fix is present in the current codebase

### 4. Cache Mechanism

The subscription service uses a **1-minute cache** (CACHE_TTL = 60 * 1000):
- Usage data is cached to avoid hitting the database on every keystroke
- Cache is refreshed if `Date.now() - this.lastFetchTime > CACHE_TTL`
- A `forceRefresh()` method exists to manually clear the cache

## Why the Issue Occurred

### Primary Cause: Stale Cache
The most likely reason the user saw the 50/50 limit error:

1. **Cache was set before upgrade:** If the user's browser had checked usage limits before upgrading (or shortly after), the cache would have been set to 50 units (free plan limit)

2. **Cache TTL:** The 1-minute cache means the limit wouldn't refresh automatically until:
   - 1 minute passed, OR
   - The user manually triggered a refresh, OR
   - The browser was restarted

3. **Browser build:** If the user was running an older build of the browser that didn't include the fix (commit b847bb8bb813), the fallback logic wouldn't exist

### Secondary Causes

1. **Query timing:** If the database query failed or returned no results at the time of check, it would default to 50 units

2. **Browser not rebuilt:** The fix was committed at 12:40:45, but if the user's browser wasn't rebuilt with the latest code, the fix wouldn't be active

## Expected Behavior

With the current code (after fix b847bb8bb813):

1. **User with NULL plan_id + active Stripe subscription:**
   - Should receive 1500 units (basic plan limit)
   - Logic at lines 174-177 handles this case

2. **Cache refresh:**
   - Should automatically refresh every 1 minute
   - Or can be manually triggered via `forceRefresh()`

3. **Usage tracking:**
   - Text commands: 1 unit each
   - Voice commands: 10 units each
   - Monthly reset on the 1st of each month

## Verification Steps

To verify the fix is working:

1. **Check browser console logs:**
   - Look for: `"refreshUsageData: Active Stripe subscription found. Granting basic plan (1500 units)."`
   - Look for: `"refreshUsageData: Final limit set to: 1500"`

2. **Force cache refresh:**
   - The code includes a `forceRefresh()` method that can be called to immediately refresh usage data

3. **Verify database:**
   - Confirm `stripe_subscription_id` is present in `user_plans` table
   - Confirm `is_active = true`
   - Confirm the subscription is within the date range (start_date to end_date)

## Recommendations

### Immediate Actions

1. **Rebuild browser with latest code:**
   - The fix is in commit `b847bb8bb813`
   - Ensure the browser is built from the latest `release-1.0.1` branch

2. **Clear cache:**
   - Restart the browser to clear any stale cache
   - Or implement a UI button to trigger `forceRefresh()`

3. **Add logging:**
   - The code already includes extensive logging
   - Check browser console for the log messages to verify the logic path

### Long-term Improvements

1. **Database normalization:**
   - Consider always setting `plan_id` when a Stripe subscription is created
   - This would eliminate the need for the NULL fallback logic

2. **Cache invalidation:**
   - Implement cache invalidation on subscription events (webhook from Stripe)
   - Or reduce cache TTL for subscription-related queries

3. **User feedback:**
   - Show current plan limit in the UI
   - Display when cache was last refreshed
   - Add a "Refresh" button for manual cache updates

4. **Error handling:**
   - Add retry logic for failed database queries
   - Show user-friendly error messages if subscription check fails

## Code References

- **Main file:** `browser/base/content/assistant/build/src/services/subscription.ts`
- **Fix commit:** `b847bb8bb813` (January 17, 2026 12:40:45)
- **Plan limits:** Lines 8-12
- **Usage check:** Lines 85-109
- **Refresh logic:** Lines 130-213
- **NULL plan_id fallback:** Lines 174-177

## Conclusion

The code includes the correct logic to handle NULL `plan_id` with active Stripe subscriptions. The issue was likely caused by:

1. **Stale cache** from before the upgrade
2. **Browser not rebuilt** with the latest fix
3. **Timing issue** where cache was set before the subscription was fully processed

**Resolution:** The user should:
1. Use the newly rebuilt browser (which includes the fix)
2. Wait for cache to refresh (1 minute) or restart browser
3. Verify in console logs that 1500 units are being granted

The fix is working correctly in the codebase; the issue was likely a cache/build timing problem.
