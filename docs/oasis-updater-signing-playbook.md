# Oasis Updater Signing Playbook

## Scope
- Desktop Oasis updater trust for `oasis-canary` and `oasis-stable`.
- Applies to MAR signing and updater embedded verification certs.

## Channel to cert mapping
- Updater cert selection is configured in:
  - `/Users/ashwinjohn/Projects/firefox-oasis/toolkit/mozapps/update/updater/moz.build`
- `oasis-canary` and `oasis-stable` map to:
  - `oasis_primary.der`
  - `oasis_secondary.der`

## Required trust model
1. Public certs (`*.der`) can be checked into source.
2. Private keys must not be in source control.
3. Private keys must be stored in KMS/HSM-backed signing service.
4. Release automation is the only actor allowed to sign production MARs.

## Bootstrap status in this repository
- Files currently present:
  - `/Users/ashwinjohn/Projects/firefox-oasis/toolkit/mozapps/update/updater/oasis_primary.der`
  - `/Users/ashwinjohn/Projects/firefox-oasis/toolkit/mozapps/update/updater/oasis_secondary.der`
- These are bootstrap placeholders and must be replaced with fork-owned public certs before production rollout.

## Production setup steps
1. Generate Oasis signing keypair in HSM/KMS (non-exportable private key).
2. Export public cert as DER.
3. Replace:
  - `oasis_primary.der` with active cert.
  - `oasis_secondary.der` with next cert for planned rotation.
4. Build Oasis updater and ship client release containing these embedded certs.
5. Sign MAR artifacts in CI using the HSM/KMS-backed key.
6. Verify MAR signatures against embedded cert trust during pipeline validation.

## Rotation procedure (no trust gap)
1. Initial state:
  - embedded certs: `A` (primary), `B` (secondary)
  - signing key: `A`
2. Prepare rotation:
  - generate `C`.
3. Release N:
  - embed `A` + `C`.
  - continue signing with `A` until release N adoption is acceptable.
4. Cutover:
  - switch signer to `C`.
5. Release N+1:
  - embed `C` + `D` (next planned key).
6. Decommission:
  - revoke/disable `A` once no supported clients require it.

## CI policy requirements
1. Ring channel must match MAR channel:
  - `oasis-canary` build signs with `MAR_CHANNEL_ID=oasis-canary`.
  - `oasis-stable` build signs with `MAR_CHANNEL_ID=oasis-stable`.
2. `ACCEPTED_MAR_CHANNEL_IDS` must include `MAR_CHANNEL_ID`.
3. Production pipeline must fail if Oasis cert files still match `dep1.der` / `dep2.der`.
4. Every signing job must emit:
  - MAR SHA256
  - signing cert fingerprint
  - signer identity (service account)
  - timestamp

## Incident response (key compromise)
1. Stop promotion immediately.
2. Disable compromised key in signer.
3. Rotate ring metadata to last known-good signed build.
4. Ship emergency client with new embedded cert pair.
5. Resume signing with uncompromised key.

