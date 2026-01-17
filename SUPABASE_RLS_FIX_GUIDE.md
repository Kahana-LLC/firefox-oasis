# Supabase RLS Policy Fix Guide

## Problem
The `user_plans` table has Row Level Security (RLS) enabled, but the policy is blocking authenticated users from reading their own subscription records. This causes both queries to return 0 rows.

## Solution: Fix RLS Policy on `user_plans` Table

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project (the one with URL: `wvclepquxxczgrukfqyr.supabase.co`)
3. Navigate to **Authentication** → **Policies** (or **Database** → **Tables** → `user_plans` → **Policies**)

### Step 2: Check Current RLS Status
1. Go to **Database** → **Tables**
2. Find the `user_plans` table
3. Click on it to open the table details
4. Check the **RLS** toggle - it should be **enabled** (this is good for security)
5. Click on the **Policies** tab

### Step 3: Review Existing Policies
Look for existing policies on `user_plans`. You should see policies for:
- **SELECT** (read access)
- **INSERT** (create access)
- **UPDATE** (modify access)
- **DELETE** (remove access)

### Step 4: Create/Update SELECT Policy

**If no SELECT policy exists:**
1. Click **"New Policy"** or **"Create Policy"**
2. Choose **"For full customization"** or **"Create policy from scratch"**
3. Configure:
   - **Policy name:** `Users can read their own plans`
   - **Allowed operation:** `SELECT`
   - **Target roles:** `authenticated`
   - **USING expression:** `auth.uid() = user_id`
   - **WITH CHECK expression:** (leave empty for SELECT)

**If a SELECT policy exists but isn't working:**
1. Click on the existing SELECT policy
2. Click **"Edit"** or the pencil icon
3. Update the **USING expression** to: `auth.uid() = user_id`
4. Make sure **Target roles** includes `authenticated`
5. Save the policy

### Step 5: Verify Policy SQL

The policy should look like this in SQL:

```sql
-- Allow authenticated users to read their own user_plans records
CREATE POLICY "Users can read their own plans"
ON user_plans
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

### Step 6: Test the Policy

**Option A: Using Supabase SQL Editor**
1. Go to **SQL Editor** in Supabase dashboard
2. Run this query (replace with your actual user_id):

```sql
-- First, get your user's auth.uid() by checking auth.users
SELECT id, email FROM auth.users WHERE email = 'adam@kahana.co';

-- Then test the policy with that user_id
SET request.jwt.claim.sub = 'd9d9e9e1-f3e5-4412-9a87-34a826de2781';
SELECT * FROM user_plans 
WHERE user_id = 'd9d9e9e1-f3e5-4412-9a87-34a826de2781' 
AND is_active = true;
```

**Option B: Using Supabase Table Editor**
1. Go to **Table Editor** → `user_plans`
2. Try to view the row with `user_id = 'd9d9e9e1-f3e5-4412-9a87-34a826de2781'`
3. If you can see it, the policy is working

### Step 7: Verify Policy is Active

After creating/updating the policy:
1. Go back to **Database** → **Tables** → `user_plans` → **Policies**
2. Verify the SELECT policy shows:
   - ✅ Status: **Active**
   - ✅ Operation: **SELECT**
   - ✅ Roles: **authenticated**
   - ✅ USING: `auth.uid() = user_id`

### Step 8: Test in Browser

After fixing the policy:
1. Restart the browser
2. Sign in with your account
3. Try using the AI assistant
4. Check console logs - you should now see:
   ```
   refreshUsageData: planData found: { stripe_subscription_id: "present", ... }
   refreshUsageData: Active Stripe subscription found. Granting basic plan (1500 units).
   refreshUsageData: Final limit set to: 1500
   ```

## Alternative: Check if RLS is Too Restrictive

If the policy still doesn't work, check:

1. **Is `user_id` column the correct type?**
   - It should be `uuid` type
   - It should match `auth.users.id` (which is also `uuid`)

2. **Is the column name correct?**
   - The policy uses `user_id`
   - Verify the actual column name in the table schema

3. **Are there multiple policies conflicting?**
   - Check if there are multiple SELECT policies
   - Only one should be active, or they should use `OR` logic

## Quick Fix: Temporarily Disable RLS (NOT RECOMMENDED)

**⚠️ WARNING: Only for testing, not for production!**

If you need to quickly test if RLS is the issue:

```sql
-- Disable RLS temporarily (DANGEROUS - allows anyone to read all data)
ALTER TABLE user_plans DISABLE ROW LEVEL SECURITY;

-- Test your queries

-- Re-enable RLS immediately after testing
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
```

## Expected Policy Configuration

For the `user_plans` table, you should have these policies:

### SELECT Policy (READ)
```sql
CREATE POLICY "Users can read their own plans"
ON user_plans
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

### INSERT Policy (CREATE)
```sql
CREATE POLICY "Users can create their own plans"
ON user_plans
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

### UPDATE Policy (MODIFY)
```sql
CREATE POLICY "Users can update their own plans"
ON user_plans
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

## Troubleshooting

### If policy still doesn't work:

1. **Check auth.uid() matches user_id:**
   ```sql
   -- Verify the user_id in user_plans matches auth.users.id
   SELECT up.user_id, au.id, au.email
   FROM user_plans up
   JOIN auth.users au ON up.user_id = au.id
   WHERE up.user_id = 'd9d9e9e1-f3e5-4412-9a87-34a826de2781';
   ```

2. **Check if user is authenticated:**
   - The policy only works for `authenticated` role
   - Anonymous users cannot access data

3. **Verify JWT token is being sent:**
   - Check browser Network tab
   - Look for requests to Supabase API
   - Verify `Authorization: Bearer <token>` header is present

## Summary

**The fix is simple:**
1. Go to Supabase Dashboard → Database → Tables → `user_plans` → Policies
2. Create/update SELECT policy: `auth.uid() = user_id` for `authenticated` role
3. Save and test

Once this policy is in place, your queries should work and grant 1500 units to paid users!
