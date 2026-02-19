# Oasis Update Metadata Service

Lightweight HTTP service that serves Firefox-compatible `update.xml` based on ring pointers and stored artifacts.

The repository now includes two deployments:

- local Python service for fast development checks
- Supabase Edge Function deployment for MVP hosting

Supabase deployment files:

- `/Users/ashwinjohn/Projects/firefox-oasis/supabase/functions/oasis-update/index.ts`
- `/Users/ashwinjohn/Projects/firefox-oasis/supabase/migrations/20260219000000_oasis_update_service.sql`
- `/Users/ashwinjohn/Projects/firefox-oasis/tools/oasis-update-service/supabase/README.md`

## Run

```bash
python3 tools/oasis-update-service/server.py --host 127.0.0.1 --port 8010 --db tools/oasis-update-service/metadata.db
```

## Register an artifact

```bash
curl -sS -X POST http://127.0.0.1:8010/admin/artifacts \
  -H 'Content-Type: application/json' \
  -d '{\"product\":\"Firefox\",\"version\":\"135.0\",\"build_id\":\"20250218094512\",\"build_target\":\"WINNT_x86_64-msvc-x64\",\"locale\":\"en-US\",\"mar_url\":\"https://updates.example.com/oasis/135.0/firefox-135.0.complete.mar\",\"mar_size\":123456789,\"hash_function\":\"sha512\",\"hash_value\":\"<sha512>\",\"display_version\":\"135.0\",\"app_version\":\"135.0\",\"platform_version\":\"135.0\"}'
```

Notes:
- `mar_url` must include the version string.
- Artifacts are immutable by `(product, version, build_target, locale)`.
- For Supabase hosted admin routes, add `Authorization: Bearer <OASIS_ADMIN_TOKEN>`.

## Point a ring

```bash
curl -sS -X POST http://127.0.0.1:8010/admin/rings/oasis-canary \
  -H 'Content-Type: application/json' \
  -d '{"target_version":"135.0","actor":"release-bot","reason":"promote canary"}'
```

```bash
curl -sS -X POST http://127.0.0.1:8010/admin/rings/oasis-stable \
  -H 'Content-Type: application/json' \
  -d '{"target_version":"134.0","actor":"release-bot","reason":"stable stays"}'
```

## Fetch update.xml

Path template (from `build/application.ini.in`):

```
/update/6/%PRODUCT%/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%SYSTEM_CAPABILITIES%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/update.xml
```

Example:

```
http://127.0.0.1:8010/update/6/Firefox/134.0/20250101010101/WINNT_x86_64-msvc-x64/en-US/oasis-canary/Windows_NT%2010.0/default/default/update.xml
```

## Audit log

```bash
curl -sS http://127.0.0.1:8010/admin/rings/oasis-canary/audit
```

## Seed local test

```bash
python3 /Users/ashwinjohn/Projects/firefox-oasis/tools/oasis-update-service/seed_local_test.py \
  --service http://127.0.0.1:8010 \
  --current-version 1.0 \
  --target-version 1.0.1 \
  --build-id 20250218094512 \
  --build-target WINNT_x86_64-msvc-x64 \
  --locale en-US \
  --ring oasis-canary \
  --mar-path /path/to/firefox-1.0.1.complete.mar
```

If your service requires admin auth:

```bash
python3 /Users/ashwinjohn/Projects/firefox-oasis/tools/oasis-update-service/seed_local_test.py \
  --service https://<project>.supabase.co/functions/v1/oasis-update \
  --admin-token "$OASIS_ADMIN_TOKEN" \
  --current-version 1.0 \
  --target-version 1.0.1 \
  --build-id 20250218094512 \
  --build-target Darwin_aarch64-gcc3 \
  --ring oasis-canary \
  --mar-url https://cdn.example.com/oasis/canary/1.0.1/20250218094512/oasis-canary-1.0.1.signed.complete.mar \
  --mar-size 123456789 \
  --hash-value <sha512>
```

## CI publish helper

`publish_update.py` is designed for CI and supports either:

- artifact registration + ring update
- ring update only

Example:

```bash
python3 /Users/ashwinjohn/Projects/firefox-oasis/tools/oasis-update-service/publish_update.py \
  --service https://<project>.supabase.co/functions/v1/oasis-update \
  --admin-token "$OASIS_ADMIN_TOKEN" \
  --product Firefox \
  --version 149.0a4 \
  --build-id 20260219013434 \
  --build-target Darwin_aarch64-gcc3 \
  --locale en-US \
  --mar-url https://cdn.example.com/oasis/canary/149.0a4/20260219013434/oasis-canary-149.0a4.signed.complete.mar \
  --mar-path /tmp/oasis-canary-149.0a4.signed.complete.mar \
  --ring oasis-canary \
  --actor github-actions \
  --reason "promote canary"
```

## Policy routing helper

To route a packaged app to your hosted endpoint with enterprise policy:

```bash
python3 /Users/ashwinjohn/Projects/firefox-oasis/tools/oasis-update-service/write_policy.py \
  --app-bundle /Users/ashwinjohn/Projects/firefox-oasis/obj-oasis-canary/dist/firefox/Oasis.app \
  --app-update-url 'https://<project>.supabase.co/functions/v1/oasis-update/update/6/%PRODUCT%/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%SYSTEM_CAPABILITIES%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/update.xml'
```

Template policy:

- `/Users/ashwinjohn/Projects/firefox-oasis/tools/oasis-update-service/policies/policies.supabase.template.json`
