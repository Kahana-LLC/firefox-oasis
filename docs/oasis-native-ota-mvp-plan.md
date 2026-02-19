# Oasis Native OTA Update Plan (No Assistant Command)

## Scope and fixed decisions
- Update delivery uses Firefox native updater only (`AppUpdater` / `UpdateService`).
- No assistant command or assistant UI integration is required for OTA.
- MVP uses complete MAR only.
- Rollout model is two channel rings: `oasis-canary`, `oasis-stable`.
- Runtime update endpoint is controlled by updater URL + policy override, not chat tools.

## Why this is the correct model for this fork
- It reuses hardened updater logic already in-tree, including background checks, download/apply state machine, restart flow, and signature verification.
- It keeps trust boundaries where Firefox expects them: app/channel identity, MAR channel IDs, and embedded verification certs.
- It supports rollout and rollback by changing backend metadata pointers, without shipping a new installer.

## Architecture

### Client
- Build artifacts are produced per ring with `--enable-update-channel=oasis-canary` or `--enable-update-channel=oasis-stable`.
- Browser checks updates through the existing URL template in `build/application.ini.in`.
- During MVP rollout, use enterprise policy `AppUpdateURL` as the control point for update host and test environments.
- Restart/apply UX remains Firefox-native (about preferences/about dialog).

### Build and packaging
- Keep `MOZ_UPDATER` enabled.
- Build complete MAR via `tools/update-packaging/make_full_update.sh`.
- Stamp MAR metadata with ring channel:
  - `MAR_CHANNEL_ID=<ring>`
  - `ACCEPTED_MAR_CHANNEL_IDS=<ring>` (or migration superset when needed)

### Signing and trust
- Updater verifies MAR signatures against certs compiled into updater from `toolkit/mozapps/update/updater/moz.build`.
- For production, replace fallback `dep1.der` / `dep2.der` usage with fork-owned cert chain for your channels.
- Keep primary + secondary certs to allow key rotation.
- Never ship production builds with `--enable-unverified-updates`.

### Update backend
- Serve update XML on the standard updater path:
  - `/update/6/%PRODUCT%/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%SYSTEM_CAPABILITIES%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/update.xml`
- XML points to immutable complete MAR artifact URLs on object storage/CDN.
- Ring routing is backend metadata:
  - `oasis-canary` -> candidate
  - `oasis-stable` -> last known good
- Rollback is metadata pointer reversal (no client rebuild).

## Required repo changes

### 1. Ring/channel build setup
- Replace single release-channel build config in `mozconfig-release` with ring-specific build configs (for example, `mozconfig-oasis-canary` and `mozconfig-oasis-stable`).
- Ensure CI sets:
  - `MAR_CHANNEL_ID`
  - `ACCEPTED_MAR_CHANNEL_IDS`
- Relevant files and pipelines:
  - `build/moz.configure/update-programs.configure`
  - `build/update-settings.ini`
  - taskcluster/release CI env where build/update tasks are defined

### 2. Updater cert selection for fork channels
- Update `toolkit/mozapps/update/updater/moz.build` so `oasis-canary` and `oasis-stable` resolve to fork-owned updater cert inputs, not fallback dev certs.
- Keep dual cert headers (`primaryCert.h` / `secondaryCert.h`) fed by fork cert material for rotation.

### 3. Update endpoint control
- Keep URL template in `build/application.ini.in` unchanged.
- Use policy override via `AppUpdateURL` (already supported by `browser/components/enterprisepolicies/Policies.sys.mjs` and consumed by `toolkit/mozapps/update/UpdateService.sys.mjs`) for MVP routing and environment switching.
- Optionally later, set a fork default host in build config so policy override is only for test/enterprise control.

### 4. Assistant/runtime
- No changes required in:
  - `browser/base/content/assistant/build/src/assistant.ts`
  - `browser/base/content/assistant/build/src/commands.ts`
  - `browser/base/content/assistant/ui-preact/src/App.tsx`

## Rollout and rollback operations

### Publish flow
1. Build ring binary (`oasis-canary` first).
2. Build complete MAR with ring `MAR_CHANNEL_ID`.
3. Sign MAR with ring signing key.
4. Publish MAR to immutable storage path.
5. Point canary metadata to new version.
6. Observe health window.
7. Promote stable metadata to same version.

### Rollback flow
1. Repoint affected ring metadata to prior known-good MAR/version.
2. Optionally return no-update XML temporarily while triaging.
3. Keep immutable artifacts unchanged; only metadata pointer changes.

## Validation plan

### Local/system validation
1. Build app and package.
2. Build complete MAR for target ring.
3. Sign and verify MAR.
4. Serve update XML + MAR (local test service).
5. Apply `AppUpdateURL` policy to local service.
6. Confirm update download -> pending -> restart -> new version.

### Negative cases
1. Wrong `MAR_CHANNEL_ID` for client ring -> update reject.
2. Signature mismatch/wrong cert -> verification failure.
3. No update XML entry -> deterministic no-update behavior.

## Security and operations requirements
- Keep production private signing keys in HSM/KMS-backed release pipeline only.
- Enforce signer separation by environment (dev/stage/prod).
- Log every ring pointer change with actor, timestamp, reason, and diff.
- Add alerting for update check failures, download failures, verify failures, and restart-apply failures.

## MVP acceptance criteria
- Users receive updates without downloading a new installer package each release.
- `oasis-canary` receives candidate before `oasis-stable`.
- Stable promotion and rollback happen by metadata change only.
- No assistant command is required for update orchestration.
