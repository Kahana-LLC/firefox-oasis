# GitHub Actions Integration

The repository includes two release workflows:

- `/Users/ashwinjohn/Projects/firefox-oasis/.github/workflows/oasis-canary-update.yml`
- `/Users/ashwinjohn/Projects/firefox-oasis/.github/workflows/oasis-stable-promote.yml`

Release model:

1. Build/sign/notarize app, build/sign/notarize DMG, then publish once to GitHub Releases (`vX.Y.Z.N`) and move `oasis-canary`.
2. Promote to `oasis-stable` by ring pointer only, without rebuilding.
3. Each canary release publishes two assets: signed MAR (OTA payload) and DMG (fresh installer baseline).

## Required GitHub Secrets

- `OASIS_UPDATE_SERVICE_URL`: Supabase function base URL, for example `https://<project>.supabase.co/functions/v1/oasis-update`
- `OASIS_UPDATE_ADMIN_TOKEN`: bearer token used by `/admin/*` endpoints
- `OASIS_APPLE_DEVELOPER_ID_P12_B64`: base64-encoded `Developer ID Application` PKCS#12 for macOS codesigning
- `OASIS_APPLE_DEVELOPER_ID_P12_PASSWORD`: password for the Apple PKCS#12 blob
- `OASIS_APPLE_SIGNING_IDENTITY`: exact signing identity string used to sign DMG containers
- `OASIS_APPLE_ID`: Apple ID email used for notarization
- `OASIS_APPLE_APP_SPECIFIC_PASSWORD`: app-specific password for the Apple ID
- `OASIS_APPLE_TEAM_ID`: Apple Developer Team ID
- `OASIS_MAR_SIGNING_P12_B64`: base64-encoded PKCS#12 containing MAR signing cert/private key
- `OASIS_MAR_SIGNING_P12_PASSWORD`: password for the PKCS#12 blob
- `OASIS_MAR_SIGNING_CERT_NICKNAME`: NSS cert nickname used by `signmar`

## Optional GitHub Variables

- `ALLOW_DEV_OASIS_CERTS=1` only for temporary non-production signing tests

## Workflow Inputs

`oasis-canary-update.yml` (`push` and `workflow_dispatch`):

- Trigger on tags matching `v*`
- Manual rerun support with `workflow_dispatch` input `release_tag` (existing `vX.Y.Z.N`)
- Required release tag format: `vX.Y.Z.N`
- Workflow derives the internal app version from the tag (for example `v1.4.1.13` -> `1.4.1.13`)
- Fixed metadata defaults in workflow:
  - ring: `oasis-canary`
  - build target: `Darwin_aarch64-gcc3`
  - locale: `en-US`
- Packaging/signing/notarization flow:
  - `./mach build`
  - `make -C obj-oasis-canary/browser/installer stage-package`
  - sign staged app with `./mach macos-sign -r` (PKCS#12 input)
  - notarize + staple app (fail-closed)
  - generate DMG via `./mach python -m mozbuild.action.make_dmg ...`
  - sign DMG with `codesign`
  - notarize + staple DMG (fail-closed)
  - build/sign/verify MAR from the same staged app
  - publish release + register Supabase metadata + move canary pointer

`oasis-stable-promote.yml` (`workflow_dispatch`):

- `target_version`: required numeric version (`X.Y.Z.N`)
- `build_target`: target string to validate
- `locale`: locale to validate
- `actor`: audit actor
- `reason`: audit reason

## One-Time Apple Credential Prep

1. Export your Apple `Developer ID Application` certificate as `developerid.p12`.
2. Convert it to base64 for GitHub secret storage:

```bash
base64 -i developerid.p12 | tr -d '\n'
```

3. Capture signing identity text from a machine that has the cert imported:

```bash
security find-identity -v -p codesigning
```

4. Create an app-specific password for your Apple ID and record Team ID from Apple Developer account.

## One-Time MAR Trust Key Prep

1. Generate Oasis MAR keypairs on a secure machine (primary active, secondary standby):

```bash
set -euo pipefail
umask 077

KEYROOT="$HOME/oasis-signing/mar"
mkdir -p "$KEYROOT"

PRIMARY_P12_PASSWORD='<choose-strong-primary-password>'
SECONDARY_P12_PASSWORD='<choose-strong-secondary-password>'

openssl genrsa -out "$KEYROOT/oasis-mar-primary.key" 3072
openssl req -new -x509 -sha384 -days 3650 \
  -key "$KEYROOT/oasis-mar-primary.key" \
  -subj "/CN=Oasis MAR Primary/" \
  -out "$KEYROOT/oasis-mar-primary.crt"
openssl x509 -in "$KEYROOT/oasis-mar-primary.crt" -outform DER -out "$KEYROOT/oasis_primary.der"
openssl pkcs12 -export \
  -inkey "$KEYROOT/oasis-mar-primary.key" \
  -in "$KEYROOT/oasis-mar-primary.crt" \
  -name oasis-mar-primary \
  -out "$KEYROOT/oasis-mar-primary.p12" \
  -passout pass:"$PRIMARY_P12_PASSWORD"

openssl genrsa -out "$KEYROOT/oasis-mar-secondary.key" 3072
openssl req -new -x509 -sha384 -days 3650 \
  -key "$KEYROOT/oasis-mar-secondary.key" \
  -subj "/CN=Oasis MAR Secondary/" \
  -out "$KEYROOT/oasis-mar-secondary.crt"
openssl x509 -in "$KEYROOT/oasis-mar-secondary.crt" -outform DER -out "$KEYROOT/oasis_secondary.der"
openssl pkcs12 -export \
  -inkey "$KEYROOT/oasis-mar-secondary.key" \
  -in "$KEYROOT/oasis-mar-secondary.crt" \
  -name oasis-mar-secondary \
  -out "$KEYROOT/oasis-mar-secondary.p12" \
  -passout pass:"$SECONDARY_P12_PASSWORD"
```

2. Replace updater trust anchors in repo:

```bash
cp "$HOME/oasis-signing/mar/oasis_primary.der" \
  "/Users/ashwinjohn/Projects/firefox-oasis/toolkit/mozapps/update/updater/oasis_primary.der"
cp "$HOME/oasis-signing/mar/oasis_secondary.der" \
  "/Users/ashwinjohn/Projects/firefox-oasis/toolkit/mozapps/update/updater/oasis_secondary.der"
scripts/update-signing/check-oasis-cert-material.sh
```

3. Prepare GitHub secret values for active signer (`primary`):

```bash
PRIMARY_P12_B64="$(base64 -i "$HOME/oasis-signing/mar/oasis-mar-primary.p12" | tr -d '\n')"
printf 'OASIS_MAR_SIGNING_P12_B64=%s\n' "$PRIMARY_P12_B64"
printf 'OASIS_MAR_SIGNING_P12_PASSWORD=%s\n' "$PRIMARY_P12_PASSWORD"
printf 'OASIS_MAR_SIGNING_CERT_NICKNAME=oasis-mar-primary\n'
```

4. Keep `oasis-mar-secondary.p12` and its password offline for rotation; do not upload it as active signer secrets.

## Operational Guardrails

- Do not reuse release tags; publish a new `vX.Y.Z.N` for every correction.
- Enable release/tag immutability controls for `v*`.
- Keep stable promotions pointer-only to preserve binary identity across rings.
- Canary release is fail-closed on both app notarization and DMG notarization.
- Rotate Apple app-specific password and Developer ID certificate on a regular cadence or immediately after any credential exposure event.
- If environment protection allows only `v*` tags, canary releases must be started by pushing a `v*` tag.
- Supabase artifact registration remains MAR-only; DMG is for bootstrap/manual install.

## Release Cadence

Use a single monotonic numeric version line (`X.Y.Z.N`) and promote immutable artifacts by ring pointer:

`v1.0.0` is invalid for this workflow; use `v1.0.0.0`.

1. Bootstrap baseline canary: `v1.0.0.0`
2. OTA test iterations: `v1.0.0.1`, `v1.0.0.2`, ...
3. Canary feature rollout: `v1.1.0.0`
4. Stable rollout: run stable promotion workflow with `target_version=1.1.0.0` (no rebuild)
