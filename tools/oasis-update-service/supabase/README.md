# Supabase Deployment (MVP)

This directory documents how to run the Oasis update metadata service on Supabase Edge Functions + Postgres.

## Layout

- Function code: `/Users/ashwinjohn/Projects/firefox-oasis/supabase/functions/oasis-update/index.ts`
- DB migration: `/Users/ashwinjohn/Projects/firefox-oasis/supabase/migrations/20260219000000_oasis_update_service.sql`
- Supabase config: `/Users/ashwinjohn/Projects/firefox-oasis/supabase/config.toml`

## Required Secrets

Set these in the Supabase function:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OASIS_ADMIN_TOKEN`

## Deploy

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy oasis-update --no-verify-jwt
supabase secrets set OASIS_ADMIN_TOKEN=<token>
```

## Endpoint

Policy URL template:

```text
https://<project-ref>.supabase.co/functions/v1/oasis-update/update/6/%PRODUCT%/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%SYSTEM_CAPABILITIES%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/update.xml
```

## Admin API

All `/admin/*` routes require:

```text
Authorization: Bearer <OASIS_ADMIN_TOKEN>
```

Supported routes:

- `POST /admin/artifacts`
- `POST /admin/rings/{ring}`
- `GET /admin/rings`
- `GET /admin/rings/{ring}`
- `GET /admin/rings/{ring}/audit`
