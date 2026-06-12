# Website OAuth Security Handoff (kahana-homepage-public)

Coordinated security requirements for the Kahana website OAuth callback. Implement in a sibling PR to the Firefox `fix/oauth-callback-security` branch.

## Context

Firefox completes assistant/onboarding sign-in by reading the `oasis_assistant_handoff` cookie and exchanging an authorization code via Supabase PKCE. The chrome page `chrome://browser/content/assistant/auth-callback.html` is a **navigation signal only** — it must not receive or store OAuth secrets.

## Handoff cookie: `oasis_assistant_handoff`

Set this cookie on the website callback origin after shared callback logic succeeds and **before** any optional chrome redirect.

### Required attributes

| Attribute | Value |
|-----------|--------|
| `Secure` | `true` in production (HTTPS) |
| `HttpOnly` | `true` |
| `SameSite` | `Lax` (or `Strict` if all flows allow) |
| `Path` | `/` |
| `Max-Age` | `600` (10 minutes) or less |

### Required JSON payload fields

```json
{
  "timestamp": 1716900000000,
  "flow_id": "oauth_...",
  "handoff_target": "assistant",
  "code": "<supabase_authorization_code>"
}
```

- `timestamp` — milliseconds since epoch when the handoff was created
- `flow_id` — must match the `flow_id` from the Firefox launcher query string / `oasis_firefox_oauth_target` marker
- `handoff_target` — `assistant` or `onboarding`
- `code` — preferred; authorization code for PKCE exchange in Firefox

Avoid putting `access_token` / `refresh_token` in the cookie when `code` is available.

### Host scope

- Production: `kahana.io` (default); `kahana.co` accepted during domain transition
- Local dev: `localhost` / `127.0.0.1` on port `3000`

Firefox ignores handoff cookies from any other host.

## Marker cookie: `oasis_firefox_oauth_target`

Firefox sets this cookie when launching OAuth. The website should:

- Require this marker before treating a callback as Firefox-owned assistant flow
- Read `flowId`, `target`, and `callbackBaseUrl` from the marker payload
- Not complete assistant handoff for callbacks without a valid, unexpired marker

## Chrome redirect (optional UX)

After setting the handoff cookie, the website may redirect to:

```
chrome://browser/content/assistant/auth-callback.html?target=assistant
chrome://browser/content/assistant/auth-callback.html?target=onboarding
```

Allowed query parameters:

- `target` — `assistant` or `onboarding` only

Forbidden on the chrome redirect URL:

- `access_token`, `refresh_token`, `code`, `error`, `error_description`, or full callback URLs

## Error handoff

On failure, the website may set a handoff cookie with:

```json
{
  "timestamp": 1716900000000,
  "flow_id": "oauth_...",
  "handoff_target": "assistant",
  "error": "access_denied",
  "description": "User-facing message"
}
```

Firefox surfaces a generic error in the assistant/onboarding UI.

## Website regression tests

1. Assistant flow with marker → handoff cookie set with HttpOnly + Secure + Max-Age ≤ 600
2. Cookie payload includes `flow_id` and `handoff_target`
3. Chrome redirect (if used) contains only `target`
4. Normal web OAuth (non-assistant) unchanged
5. Handoff without marker cookie is rejected

## PR checklist

- [ ] `oasis_assistant_handoff` uses HttpOnly, Secure, SameSite=Lax, short TTL
- [ ] Payload includes `timestamp`, `flow_id`, `handoff_target`, `code`
- [ ] No OAuth secrets in chrome redirect query string
- [ ] Assistant flow requires `oasis_firefox_oauth_target` marker
- [ ] Automated or manual test for cookie attributes
