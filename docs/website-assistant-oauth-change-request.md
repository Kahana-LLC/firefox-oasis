# Website Change Request: Automatic OAuth Handoff for Oasis Assistant and Onboarding

## Objective

Replace the current manual callback payload copy flow with an automatic handoff from the website OAuth callback into the Firefox-owned assistant/onboarding callback flow.

The website should remain the single source of truth for:

- Supabase OAuth callback completion
- session restoration
- authenticated user validation
- profile creation via the existing callback flow

The website should stop being the final UX for assistant-originated OAuth.

## Problem

The current assistant-mode website callback successfully completes web auth, but it stops on a website handoff page that asks the user to copy a payload manually.

This is not acceptable for the assistant or onboarding experience because:

- it creates a second manual step after successful OAuth
- it leaves the assistant visually stuck in auth
- it makes onboarding look broken
- it splits the sign-in flow across two unrelated UIs

## Required End State

For assistant-originated OAuth, the website callback must automatically hand control back to a Firefox-owned callback page.

The user should not need to:

- copy a payload
- paste a payload
- interpret callback data
- manually navigate back into the assistant

Manual payload copy may remain only as an emergency fallback, not as the primary path.

## Flow Contract

### 1. Assistant/Onboarding OAuth Start

Firefox-originated OAuth requests will arrive at the website callback with:

- `flow=assistant`
- `handoff_target=assistant` or `handoff_target=onboarding`

These values should be treated as the routing signal for post-callback behavior.

### 2. Shared Website Callback Logic

The website callback must continue using the existing shared callback logic for:

- parsing the callback
- restoring or setting the Supabase session
- confirming the authenticated user
- creating or updating the app profile
- handling missing email or other auth failures

This shared logic must not be duplicated.

### 3. Automatic Firefox Handoff

After the shared callback logic succeeds for `flow=assistant`, the website must redirect the browser to the Firefox-owned callback endpoint:

- `chrome://browser/content/assistant/auth-callback.html`

The website must include:

- `target=assistant` or `target=onboarding`
- the callback payload needed to complete auth automatically

The payload may be forwarded in either supported callback shape:

- auth code
- access token and refresh token

The important requirement is that the Firefox callback page receives enough information to complete auth without user input.

### 4. Assistant and Onboarding Completion

The Firefox callback page will take responsibility for:

- storing the OAuth handoff in browser-owned state
- routing back into the assistant or onboarding surface
- letting the browser-owned auth service finish the sign-in automatically

This is Firefox-side behavior and does not need website-specific implementation beyond the redirect contract.

## Website Behavior Rules

### For Normal Website OAuth

No change.

The website must keep its current redirect priority:

1. `postAuthRedirect`
2. `pendingStripeCheckout`
3. `/oasis-auth?mode=login&plan=free`

### For Assistant-Originated OAuth

After shared callback completion:

- do not redirect to `/oasis-auth`
- do not redirect to `/installations`
- do not redirect to Stripe
- do not stop on a manual payload page as the primary flow

Instead:

- redirect immediately to the Firefox callback endpoint

### For Assistant-Originated OAuth Failure

If auth fails before handoff:

- the website may render a short failure state
- the website must not fall back into website auth UX
- if possible, the website should redirect the failure state to the Firefox callback endpoint as well so the browser surfaces the error in-context

## Required Redirect Inputs

The website callback must recognize at least:

- `flow=assistant`
- `handoff_target=assistant`
- `handoff_target=onboarding`

Recommended interpretation:

- `flow=assistant` means this callback belongs to Firefox, not standard website UX
- `handoff_target` decides which Firefox surface should resume after the browser-owned callback processes the result

## Security Requirements

This change must preserve all existing website auth safety rules:

- redirect sanitization
- user verification
- profile verification
- missing-email handling

The Firefox redirect target should only be used when the callback is explicitly marked as assistant-originated.

## Non-Goals

This change request does not ask the website to:

- create a new auth system
- duplicate callback logic
- own assistant session state
- own onboarding state
- manually prompt the user for payload handling in the primary flow

## Acceptance Criteria

### Assistant

1. Assistant-originated OAuth reaches website `/oauth-callback` with `flow=assistant`.
2. Website callback completes normal shared auth work.
3. Website callback redirects automatically to `chrome://browser/content/assistant/auth-callback.html`.
4. Firefox assistant signs in without copy/paste.
5. Assistant UI transitions out of the login state automatically.

### Onboarding

1. Onboarding-originated OAuth reaches website `/oauth-callback` with `flow=assistant` and `handoff_target=onboarding`.
2. Website callback completes normal shared auth work.
3. Website callback redirects automatically to `chrome://browser/content/assistant/auth-callback.html?target=onboarding`.
4. Onboarding completes sign-in without copy/paste.
5. Onboarding proceeds automatically after auth completion.

### Website Regression

1. Normal `/oasis-auth` OAuth behavior is unchanged.
2. `/installations` protected login flow is unchanged.
3. Paid plan auth-to-Stripe continuation is unchanged.
4. Existing profile creation behavior remains unchanged.

## Product Requirement

The manual payload page is no longer the intended experience.

The expected production UX is:

- OAuth completes on the website
- control returns automatically to Firefox
- assistant or onboarding resumes without manual intervention
