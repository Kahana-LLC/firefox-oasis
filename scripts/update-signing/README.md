# Update Signing Test Scripts

This directory provides local helpers for complete MAR build/sign/verify loops.
It is for test workflows and release pipeline prototyping.

## Scripts
- `build-complete-mar.sh`: builds a complete MAR from a packaged app directory.
- `sign-mar.sh`: signs an unsigned MAR with an NSS DB certificate nickname.
- `verify-mar.sh`: verifies a signed MAR against one or more DER certs.
- `check-oasis-cert-material.sh`: fails if Oasis cert files are still identical to dep certs.

## Quick start (local test cert path)
1. Build and package your browser.
2. Build an unsigned complete MAR.
3. Sign it with the existing test NSS DB (`modules/libmar/tests/unit/data`, nickname `mycert`).
4. Verify signature with `toolkit/mozapps/update/updater/xpcshellCertificate.der`.

Example:

```bash
scripts/update-signing/build-complete-mar.sh \
  obj-aarch64-apple-darwin25.2.0 \
  obj-aarch64-apple-darwin25.2.0/dist/OasisBrowser.app \
  /tmp/oasis-update/oasis-1.2.0-unsigned.complete.mar \
  1.2.0 \
  oasis-canary

scripts/update-signing/sign-mar.sh \
  obj-aarch64-apple-darwin25.2.0 \
  /tmp/oasis-update/oasis-1.2.0-unsigned.complete.mar \
  /tmp/oasis-update/oasis-1.2.0-signed.complete.mar

scripts/update-signing/verify-mar.sh \
  obj-aarch64-apple-darwin25.2.0 \
  /tmp/oasis-update/oasis-1.2.0-signed.complete.mar
```

## Production note
- Do not use the in-repo test cert DB for production.
- Production signing keys should be externalized (HSM/KMS-backed) and never stored in this repository.
- Gate production releases with `check-oasis-cert-material.sh` to ensure placeholder certs are not shipped.
