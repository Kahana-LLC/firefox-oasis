# oasis-assist (Supabase Edge Function)

This function handles assistant `assist` routing/chat using Gemini native tool-calling.

## Required secrets

Set these in Supabase project secrets:

- `GEMINI_API_KEY`
- `MODEL` (optional, default `gemini-2.5-flash`)
- `TEMP` (optional, default `0.3`)
- `ASSIST_MAX_INNER_ROUNDS` (optional, default `1`; max `8` for multi-turn `route_command` in one request)
- `SUPABASE_SERVICE_ROLE_KEY` (required for **authenticated** requests so the function can read plans / record usage; anonymous calls skip DB usage)

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided automatically to Edge Functions.

## Authenticated usage and billing

When the client sends `Authorization: Bearer <user_jwt>`, the function:

1. Resolves the user via `auth.getUser`
2. Loads daily limits from `user_plans` / `plans`
3. Reads today’s total from `llm_daily_usage`
4. Returns **429** if the daily limit is reached
5. After a successful Gemini response, calls RPC **`record_llm_usage`** with summed token usage (multi-turn assist sums all inner rounds)

Anonymous requests skip those steps and omit `usage_stats` in the JSON body.

## Deploy

The folder name is `oasis-assist`. Your project may expose it under a different
URL slug (for example `oasis-assist-test`); deploy the slug that matches
`OASIS_ASSIST_URL` in the assistant build.

```bash
supabase functions deploy oasis-assist
# or, if the remote function name differs:
supabase functions deploy oasis-assist-test
```

This function is configured with `verify_jwt = false` in `supabase/config.toml`,
so browser users do not need to sign in to call `assist`.

## Local client wiring

Set assistant endpoint to this function URL and keep voice on Lambda:

- `OASIS_ASSIST_URL=https://<project-ref>.supabase.co/functions/v1/oasis-assist`
- `OASIS_TRANSCRIBE_URL=https://<your-voice-lambda-url>/`

These values are now loaded by the assistant build from:

1. `browser/base/content/assistant/build/.env.defaults` (checked in defaults)
2. `browser/base/content/assistant/build/.env.local` (local override, gitignored)
