# GitHub Actions Integration

The repository includes two workflow definitions:

- `/Users/ashwinjohn/Projects/firefox-oasis/.github/workflows/oasis-canary-update.yml`
- `/Users/ashwinjohn/Projects/firefox-oasis/.github/workflows/oasis-stable-promote.yml`

Per `/Users/ashwinjohn/Projects/firefox-oasis/.github/workflows/README`, workflow changes require Mozilla GitHub Enterprise admin approval.

## Required GitHub Secrets

- `OASIS_UPDATE_SERVICE_URL`: Supabase function base URL, for example `https://<project>.supabase.co/functions/v1/oasis-update`
- `OASIS_UPDATE_ADMIN_TOKEN`: bearer token used by `/admin/*` endpoints
- `OASIS_BUILD_TARGET`: updater build target string, for example `Darwin_aarch64-gcc3`
- `OASIS_S3_BUCKET`: artifact bucket name
- `OASIS_MAR_PUBLIC_BASE_URL`: public HTTPS base URL for artifact keys
- `OASIS_AWS_ROLE_ARN`: role assumed by canary workflow
- `OASIS_AWS_REGION`: region for `aws s3 cp`

## Optional GitHub Variables

- `ALLOW_DEV_OASIS_CERTS=1` only for temporary non-production signing tests

## Signing Modes

Canary workflow calls `/Users/ashwinjohn/Projects/firefox-oasis/scripts/update-signing/sign-mar-ci.sh`.

Set one mode:

- `OASIS_SIGNING_MODE=local-test`
- `OASIS_SIGNING_MODE=command` and `OASIS_SIGNING_COMMAND` with `{input_mar}` and `{output_mar}`
