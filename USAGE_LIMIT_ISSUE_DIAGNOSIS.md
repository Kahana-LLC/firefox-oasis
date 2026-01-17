# Usage Limit Issue - Root Cause Diagnosis Report
**Date:** January 17, 2026  
**User:** adam@kahana.co (user_id: d9d9e9e1-f3e5-4412-9a87-34a826de2781)  
**Issue:** Both database queries returning 0 rows, defaulting to 50-unit free plan limit instead of 1500-unit paid plan

## Executive Summary

Despite having an active paid subscription in the database, both the main query and fallback query are returning 0 rows when checking the user's plan. This is causing the system to default to the free plan limit (50 units) instead of the paid plan limit (1500 units).

## Evidence from Logs

### User Authentication
✅ **User successfully authenticated:**
- User ID: `d9d9e9e1-f3e5-4412-9a87-34a826de2781`
- Email: `adam@kahana.co`
- Auth state: `SIGNED_IN`

### Database Query Attempts

**Main Query (with plans join):**
```
refreshUsageData: syncing usage for userId=d9d9e9e1-f3e5-4412-9a87-34a826de2781...
refreshUsageData: Query returned 0 rows. This could mean:
  1. User has no active subscription
  2. RLS policy is blocking access
  3. User ID mismatch
```

**Fallback Query (without plans join):**
```
refreshUsageData: Trying alternative query without plans join...
refreshUsageData: Alternative query also returned 0 rows.
```

**Result:**
```
refreshUsageData: No active plan found for user d9d9e9e1-f3e5-4412-9a87-34a826de2781. Using free plan limit.
refreshUsageData: Final limit set to: 50
checkAvailability: Returning stats - totalUnits=50, limit=50, remaining=0, isLimitReached=true
```

## Database Record Verification

From `user_plans_rows.csv`, the user's record exists:
- **user_plan_id:** `d40007db-af57-434b-be15-c69783eb2b7f`
- **user_id:** `d9d9e9e1-f3e5-4412-9a87-34a826de2781` ✅ **MATCHES**
- **plan_id:** `NULL` (empty)
- **stripe_subscription_id:** `sub_1Sqdg2GAiwY6zSuoJudm5ToO` ✅ **PRESENT**
- **is_active:** `true` ✅ **ACTIVE**
- **start_date:** `2026-01-17 17:52:44`
- **end_date:** `2026-02-17 17:52:44`

## Root Cause Analysis

### Primary Issue: Row Level Security (RLS) Policy Blocking Access

**Evidence:**
1. ✅ User is authenticated (Supabase session exists)
2. ✅ User ID matches database record exactly
3. ✅ Record exists with `is_active = true`
4. ❌ Both queries return 0 rows (not an error, just no data)
5. ❌ No error messages indicating query failure

**Conclusion:** The Supabase client is likely not properly authenticated with the database, OR the RLS policies on the `user_plans` table are blocking read access for the authenticated user.

### Possible Causes

#### 1. Supabase Client Not Using Authenticated Session (MOST LIKELY)
- The Supabase client may be using the anonymous key instead of the authenticated session
- The client needs to use `supabase.auth.getSession()` to get the access token
- Queries need to include the JWT token in the Authorization header

#### 2. RLS Policy Too Restrictive
- The `user_plans` table may have RLS enabled
- The policy might require specific conditions that aren't being met
- Example: Policy might require `auth.uid() = user_id` but the JWT token isn't being passed

#### 3. Missing Authentication Headers
- Supabase queries need the JWT access token from the authenticated session
- Without the token, RLS policies will block access
- The client might be making unauthenticated requests

## Code Analysis

### Current Query Implementation

**Main Query:**
```typescript
const { data: planData, error: planError } = await supabase
    .from('user_plans')
    .select(`
        plan_id,
        stripe_subscription_id,
        plans ( name, llm_call_limit )
    `)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
```

**Fallback Query:**
```typescript
const { data: simplePlanData, error: simpleError } = await supabase
    .from('user_plans')
    .select('plan_id, stripe_subscription_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
```

### Issue: Supabase Client Configuration

The Supabase client needs to be configured with the authenticated session's access token. Currently, it appears the client is making requests without proper authentication.

## Recommended Solutions

### Solution 1: Ensure Supabase Client Uses Authenticated Session (IMMEDIATE FIX)

The Supabase client must be initialized with the authenticated user's session token:

```typescript
// Get the current session
const { data: { session } } = await supabase.auth.getSession();

// Ensure client is using authenticated session
if (session) {
    // The client should automatically use the session token
    // But we may need to explicitly set it
    supabase.auth.setSession(session);
}
```

### Solution 2: Check RLS Policies (DATABASE-LEVEL FIX)

Verify the RLS policy on `user_plans` table allows authenticated users to read their own records:

```sql
-- Should allow users to read their own user_plans
CREATE POLICY "Users can read their own plans"
ON user_plans FOR SELECT
USING (auth.uid() = user_id);
```

### Solution 3: Add Debugging to Verify Authentication

Add logging to verify the Supabase client is using the authenticated session:

```typescript
const { data: { session } } = await supabase.auth.getSession();
console.log("Supabase session:", {
    hasSession: !!session,
    userId: session?.user?.id,
    accessToken: session?.access_token ? "present" : "missing"
});
```

### Solution 4: Use Service Role Key (NOT RECOMMENDED FOR PRODUCTION)

As a temporary workaround, if RLS is the issue, you could use the service role key which bypasses RLS. However, this is a security risk and should only be used for debugging.

## Immediate Action Items

1. **Verify Supabase Client Authentication:**
   - Check if `supabase.auth.getSession()` returns a valid session
   - Ensure the session token is being used in queries
   - Add logging to verify authentication state

2. **Check Database RLS Policies:**
   - Review RLS policies on `user_plans` table
   - Ensure policy allows `SELECT` for authenticated users matching their `user_id`
   - Test policy with direct database query

3. **Add Authentication Verification:**
   - Log the Supabase session state before queries
   - Verify JWT token is present and valid
   - Check if token is being included in request headers

4. **Test with Direct Query:**
   - Use Supabase dashboard to verify the record exists
   - Test query with authenticated user's JWT token
   - Compare results with client-side queries

## Expected Behavior After Fix

Once authentication is properly configured:

1. Main query should return the user's plan record
2. If `plan_id` is NULL but `stripe_subscription_id` exists, grant 1500 units
3. Logs should show:
   ```
   refreshUsageData: planData found: { stripe_subscription_id: "present", ... }
   refreshUsageData: Active Stripe subscription found. Granting basic plan (1500 units).
   refreshUsageData: Final limit set to: 1500
   ```

## Code References

- **Subscription Service:** `browser/base/content/assistant/build/src/services/subscription.ts`
- **Supabase Auth:** `browser/base/content/assistant/build/src/services/supabase.ts`
- **Query Logic:** Lines 145-199 in `subscription.ts`

## Conclusion

The issue is **NOT** with the query logic or fallback mechanism. Both are working correctly. The problem is that **Row Level Security (RLS) policies are blocking access** to the `user_plans` table because the Supabase client is not properly authenticated or the RLS policies are too restrictive.

**Next Steps:**
1. Verify Supabase client is using authenticated session
2. Check and fix RLS policies on `user_plans` table
3. Add authentication verification logging
4. Test with authenticated queries
