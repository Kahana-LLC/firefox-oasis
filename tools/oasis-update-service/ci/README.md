# GitHub Actions Integration

The repository includes these release workflows:

- [`.github/workflows/oasis-canary.yml`](../../../.github/workflows/oasis-canary.yml) — dual-arch build, publish to rolling `canary` release, register Supabase artifacts, move `oasis-canary` ring
- [`.github/workflows/oasis-release.yml`](../../../.github/workflows/oasis-release.yml) — dual-arch build, publish to immutable `vX.Y.Z.N` GitHub release (no Supabase registration)
- [`.github/workflows/oasis-build-macos.yml`](../../../.github/workflows/oasis-build-macos.yml) — reusable per-arch macOS build/sign/notarize job
- [`.github/workflows/oasis-stable-promote.yml`](../../../.github/workflows/oasis-stable-promote.yml) — pointer-only promote to `oasis-stable` after validating both canary MARs

Shared naming helpers live in [`scripts/ci/oasis-release-names.sh`](../../../scripts/ci/oasis-release-names.sh). Publishing logic is in [`scripts/ci/oasis-publish-release.sh`](../../../scripts/ci/oasis-publish-release.sh).

## Release model

1. Tag `vX.Y.Z.N` on the commit to ship.
2. Run **Oasis Release Canary** with that tag. Two native builds run in parallel (Apple Silicon on `macos-15`, Intel on `macos-15-intel`).
3. A publish job uploads **four** assets to the `canary` GitHub release and registers **two** Supabase MAR rows (one per `build_target`), then moves the `oasis-canary` ring pointer once.
4. Run **Oasis Release Publish** for the same tag when you want a versioned GitHub release (four assets, no Supabase writes).
5. Promote to `oasis-stable` with **Oasis Stable Ring Promote** (validates both MARs on canary, then moves the stable ring pointer only — no rebuild).

## Asset naming

| Asset | Pattern | Example |
|-------|---------|---------|
| DMG (Apple Silicon) | `oasis-{version}.{locale}.aarch64.mac.dmg` | `oasis-1.0.0.10.en-US.aarch64.mac.dmg` |
| DMG (Intel) | `oasis-{version}.{locale}.x86_64.mac.dmg` | `oasis-1.0.0.10.en-US.x86_64.mac.dmg` |
| MAR (per target) | `oasis-{version}-{build_target}-{locale}.signed.complete.mar` | `oasis-1.0.0.10-Darwin_aarch64-gcc3-en-US.signed.complete.mar` |

DMG files are copied to their final names on disk before upload so browser downloads match the GitHub asset label. CI mozconfig sets `export MOZ_PKG_APPNAME=oasis` so intermediate packager output also uses the `oasis` prefix.

## Required GitHub Secrets

For macOS **platform passkeys** (Touch ID / system passkey sheet), the Apple **App ID** `com.oasis.browser` must include the **Passkeys (web-browser.public-key-credential)** capability, and release signing must use `./mach macos-sign -e production` so restricted entitlements are not stripped.

- `OASIS_UPDATE_SERVICE_URL`: Supabase function base URL
- `OASIS_UPDATE_ADMIN_TOKEN`: bearer token for `/admin/*` endpoints
- `OASIS_APPLE_DEVELOPER_ID_P12_B64`: base64-encoded `Developer ID Application` PKCS#12
- `OASIS_APPLE_DEVELOPER_ID_P12_PASSWORD`: password for the Apple PKCS#12 blob
- `OASIS_APPLE_SIGNING_IDENTITY`: codesign identity for DMG containers
- `OASIS_APPLE_API_KEY_ID`, `OASIS_APPLE_API_ISSUER`, `OASIS_APPLE_API_KEY_P8_B64`: App Store Connect API key for notarization
- `OASIS_MAR_SIGNING_P12_B64`, `OASIS_MAR_SIGNING_P12_PASSWORD`, `OASIS_MAR_SIGNING_CERT_NICKNAME`: MAR signing

## Optional GitHub Variables

- `ALLOW_DEV_OASIS_CERTS=1` only for temporary non-production signing tests

## Workflow inputs

**Oasis Release Canary** (`workflow_dispatch`):

- `release_tag`: existing `vX.Y.Z.N` tag to build
- Matrix: `Darwin_aarch64-gcc3` on `macos-15`, `Darwin_x86_64-gcc3` on `macos-15-intel`
- Separate objdirs: `obj-oasis-canary-aarch64`, `obj-oasis-canary-x86_64`
- Update channel: `oasis-canary`

**Oasis Release Publish** (`workflow_dispatch`):

- Same dual-arch matrix with objdirs `obj-oasis-release-aarch64`, `obj-oasis-release-x86_64`
- Update channel: `oasis-stable`
- Creates the `vX.Y.Z.N` GitHub release once (fails if it already exists)

**Oasis Stable Ring Promote** (`workflow_dispatch`):

- `target_version`: `X.Y.Z.N` to promote
- `locale`: default `en-US`
- Validates **both** canary MAR assets and update XML endpoints before moving `oasis-stable`

## Operational guardrails

- Do not reuse release tags; publish a new `vX.Y.Z.N` for every correction.
- Keep stable promotions pointer-only to preserve binary identity across rings.
- Canary publish is fail-closed on app and DMG notarization.
- Supabase artifact registration is MAR-only; DMGs are for fresh installs.
- If `macos-15-intel` is unavailable on your GitHub plan, Intel builds will fail until an Intel runner or cross-compile fallback is added.

## Release cadence

Use monotonic `X.Y.Z.N` versions. `v1.0.0` is invalid; use `v1.0.0.0`.

1. Tag and run **Oasis Release Canary**
2. OTA-test via `oasis-canary` ring
3. Optionally run **Oasis Release Publish** for a versioned download page
4. Run **Oasis Stable Ring Promote** with `target_version=X.Y.Z.N`
