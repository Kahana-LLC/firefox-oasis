# oasis-assist (Supabase Edge Function)

This function handles assistant `assist` routing/chat using Gemini native tool-calling.

## Required secrets

Set these in Supabase project secrets:

- `GEMINI_API_KEY`
- `MODEL` (optional, default `gemini-2.5-flash`)
- `TEMP` (optional, default `0.3`)

## Deploy

```bash
supabase functions deploy oasis-assist
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
