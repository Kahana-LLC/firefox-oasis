# Oasis OAuth Environment And Testing

## Repositories

- Firefox: `/Users/avinash/Developer/workspace/kahana/firefox-oasis`
- Website: `/Users/avinash/Developer/workspace/kahana/kahana-homepage-public`

## Current Architecture

- Firefox assistant and onboarding do not launch raw Supabase OAuth from `chrome://`.
- Firefox opens the website launcher page:
  - `http://localhost:3000/oasis-auth?flow=assistant&handoff_target=assistant|onboarding&provider=google|apple|azure&flow_id=...`
- The website starts OAuth from website origin.
- Supabase redirects back to a stable callback URL:
  - `http://localhost:3000/oauth-callback`
  - `https://kahana.io/oauth-callback`
- The website callback detects Firefox-owned auth from the `oasis_firefox_oauth_target` cookie.
- The website writes the handoff cookie:
  - `oasis_assistant_handoff`
- Firefox assistant or onboarding consumes that handoff and completes auth locally.
- The shared session is stored in Firefox Password Manager and onboarding restores from it.

## Supabase Configuration

### Site URL

Use:

- `https://kahana.io`

Do not use:

- `https://kahana.io/confirm-success`

### Redirect URLs

Required:

- `https://kahana.io/oauth-callback`
- `http://localhost:3000/oauth-callback`
- `http://127.0.0.1:3000/oauth-callback`

Useful recovery URLs:

- `https://kahana.io/confirm-success`
- `http://localhost:3000/confirm-success`

### Why The Callback Must Stay Stable

Do not depend on dynamic callback query params in Supabase `redirect_to`.

Use:

- `/oauth-callback`

Do not rely on:

- `/oauth-callback?flow=assistant&handoff_target=...&flow_id=...`

Assistant vs onboarding routing is now inferred from the Firefox marker cookie instead.

## Security Invariants (Firefox)

Implementation: [`browser/modules/OasisOAuthHandoff.sys.mjs`](../browser/modules/OasisOAuthHandoff.sys.mjs)

- OAuth callback base URL must be on the allowlist:
  - `https://kahana.io` (production default)
  - `https://kahana.co` (legacy; retained during domain transition)
  - `http://localhost:3000`
  - `http://127.0.0.1:3000`
- `localStorage` override of the callback base URL works only in chrome dev contexts (assistant/onboarding frames), not arbitrary web pages.
- Handoff cookie `oasis_assistant_handoff` is accepted only when:
  - cookie host matches an allowlisted callback host
  - `timestamp` is younger than 10 minutes
  - `flow_id` matches the active Firefox OAuth launch when one is in flight
  - `handoff_target` / `target` matches the consuming surface (`assistant` or `onboarding`)
- Sessions are stored in Firefox Password Manager, not in OAuth callback HTML pages.
- Legacy chrome callback pages (`oauth-callback.html`, `kahana-interceptor.html`) were removed.

### Negative Tests (manual)

1. Start assistant OAuth, then in Browser Toolbox set a fake handoff cookie on `evil.test` — assistant must ignore it.
2. Tamper `flow_id` in a valid-looking handoff cookie — handoff must fail with a generic auth error.
3. Set `window.oasisSetOAuthCallbackBaseUrl("https://evil.example")` — value must remain `https://kahana.io` (or current allowlisted dev URL).

### Unit Tests

```bash
cd browser/base/content/assistant/build
npm run test:oauth-handoff
```

## Local Website Environment

Start the website on port `3000`:

```bash
cd /Users/avinash/Developer/workspace/kahana/kahana-homepage-public
PORT=3000 npm run dev
```

The website should be reachable at:

- `http://localhost:3000/oasis-auth`
- `http://localhost:3000/oauth-callback`

## Firefox Local Run

```bash
cd /Users/avinash/Developer/workspace/kahana/firefox-oasis
./mach run --temp-profile
```

## Browser Toolbox Overrides

### Assistant

Frame:

- `chrome://browser/content/assistant/assistant.xhtml`

Commands:

```js
window.oasisSetOAuthCallbackBaseUrl("http://localhost:3000")
window.oasisGetOAuthCallbackBaseUrl()
```

Expected:

```js
"http://localhost:3000"
```

### Onboarding

Frame:

- `chrome://browser/content/oasiswelcome/oasiswelcome.html`

Commands:

```js
await window.oasisWelcomeAuth.setOAuthCallbackBaseUrl("http://localhost:3000")
await window.oasisWelcomeAuth.getOAuthCallbackBaseUrl()
```

Expected:

```js
"http://localhost:3000"
```

## Expected OAuth Flows

### Assistant OAuth

1. Open assistant.
2. Set the assistant callback override.
3. Click Google, Apple, or Microsoft once.
4. Firefox opens:
   - `http://localhost:3000/oasis-auth?...`
5. Website launches provider login.
6. Provider returns to:
   - `http://localhost:3000/oauth-callback`
7. Website writes `oasis_assistant_handoff`.
8. Assistant consumes the handoff automatically.
9. Assistant becomes signed in.

### Onboarding OAuth

1. Open onboarding and advance to page 4.
2. Set the onboarding callback override.
3. Click Google, Apple, or Microsoft once.
4. Firefox opens:
   - `http://localhost:3000/oasis-auth?...`
5. Website launches provider login.
6. Provider returns to:
   - `http://localhost:3000/oauth-callback`
7. Website writes `oasis_assistant_handoff`.
8. Onboarding consumes the handoff automatically.
9. Onboarding finishes.

### Shared Session Sync

If assistant signs in first:

- onboarding page 4 should restore the shared session from Firefox Password Manager
- onboarding should finish automatically

If onboarding signs in first:

- assistant should see the restored shared session and open authenticated

## Onboarding Sync Triggers

Onboarding now re-checks auth state when:

- page 4 is shown
- the onboarding window gains focus
- the onboarding document becomes visible again
- the onboarding page is shown again
- the periodic interval runs

This is meant to avoid the "signed in externally but page looks frozen" case.

## Useful Logs

Only trust lines containing:

- `[Oasis OAuth][`

These logs correlate one attempt with a single `flow_id`.

### Good Signals

- `Generated launcher URL: http://localhost:3000/oasis-auth?...`
- `OAuth callback received`
- `Prepared Firefox handoff payload`
- `Cookie handoff completed successfully`
- `Onboarding handoff completed successfully`
- `Auth state changed: SIGNED_IN`

### Failure Signals

- final URL lands on `https://kahana.io/...`
- multiple different `flow_id` values for a single click
- provider returns to production callback instead of local callback

## Known Non-Critical Warnings

These do not currently block assistant sign-in if auth succeeds:

- `permission denied for table users`
- `row-level security policy for table sessions`

Those affect optional profile/session tracking. Core browser auth still succeeds if you see:

- `Cookie handoff completed successfully`
- `Session securely saved to Password Manager`
- `SIGNED_IN`

## Build And Verification Commands

### Website

```bash
cd /Users/avinash/Developer/workspace/kahana/kahana-homepage-public
npm run build
```

### Firefox

```bash
cd /Users/avinash/Developer/workspace/kahana/firefox-oasis
./mach format
./mach build
```

`./mach lint` currently reports existing repo-wide and generated-file issues unrelated to this flow.

## Minimum Debug Output To Capture

If a run fails, capture only:

- final landed URL
- assistant console lines containing `[Oasis OAuth][`
- onboarding console lines containing `[Oasis OAuth][`
- website console lines containing `[Oasis OAuth][`

That is enough to isolate whether the failure is in:

- Firefox launcher generation
- website OAuth launch
- website callback detection
- Firefox handoff consumption
- onboarding shared-session restore
