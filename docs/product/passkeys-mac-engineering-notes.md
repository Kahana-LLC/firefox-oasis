# macOS platform passkeys — engineering notes

**Status:** Root cause confirmed in codebase (June 2026)  
**Symptom:** Users see *“Touch your security key to continue with …”* instead of the macOS Touch ID / passkey sheet. Biometrics appear unavailable or non-functional.

---

## Root cause (confirmed)

Two independent gates block platform passkeys in shipped Oasis builds:

| Gate | Location | Oasis before fix |
|------|----------|------------------|
| Branding pref | [`StaticPrefList.yaml`](../../modules/libpref/init/StaticPrefList.yaml) | `security.webauthn.enable_macos_passkeys` = **true** (default; Oasis no longer overrides to false) |
| Codesign entitlement | CI uses `-e production-without-restricted` until a Developer ID provisioning profile is embedded | Strips passkey + `application-identifier` via [`strip_restricted_entitlements()`](../../tools/signing/macos/mach_commands.py) so AMFI allows launch |
| Oasis entitlement remap | [`remap_entitlements_for_oasis_browser()`](../../tools/signing/macos/mach_commands.py) only matched `com.oasis.browser` | Shipped builds with `org.mozilla.com.oasis.browser` kept **Firefox** entitlements (`43AQ936H96.org.mozilla.firefox`) → launch failure |

When either gate fails, [`NewMacOSWebAuthnServiceIfAvailable()`](../../dom/webauthn/MacOSWebAuthnService.mm) returns null and WebAuthn falls back to **authrs** (USB/FIDO). That path shows the in-browser banner from [`browser/locales/en-US/browser/webauthnDialog.ftl`](../../browser/locales/en-US/browser/webauthnDialog.ftl) (`webauthn-user-presence-prompt`).

Stock Firefox defaults the pref to **true** in [`StaticPrefList.yaml`](../../modules/libpref/init/StaticPrefList.yaml); Oasis branding overrides it.

---

## Verification checklist

Run on a **signed** Oasis `.app` (not `./mach run` unless dev-signed with production entitlements):

```bash
# 1. Pref (from profile or defaults)
/Applications/Oasis.app/Contents/MacOS/oasis -CreateProfile /tmp/oasis-pref-test
# Or in running profile: about:config → security.webauthn.enable_macos_passkeys

# 2. Entitlement on main executable
codesign -d --entitlements :- /Applications/Oasis.app/Contents/MacOS/oasis \
  | plutil -p - | grep public-key-credential

# Expected: "com.apple.developer.web-browser.public-key-credential" => true

# 3. Runtime log
MOZ_LOG=macoswebauthnservice:5 /Applications/Oasis.app/Contents/MacOS/oasis
# Must NOT log: "entitlement ... not present"
```

**Functional test:** [webauthn.io](https://webauthn.io) or Google sign-in with a passkey — expect **system sheet** (Touch ID), not the security-key banner.

---

## Fix (launch vs passkeys)

**Consumer launch (v1.0.0.16 regression):** CI must sign with `-e production-without-restricted` and must remap Oasis bundles to `oasis.browser.xml` (including legacy `org.mozilla.com.oasis.browser`). Restricted entitlements without an embedded Developer ID provisioning profile cause `taskgated` / AMFI error **-413** (*No matching profile found*) even when Gatekeeper accepts the notarized app.

**Platform passkeys (later):**

1. App ID `com.oasis.browser` (or shipped bundle ID) has **Passkeys** capability on team `NV6BDYHYA5`.
2. Download a **Developer ID Application** provisioning profile that authorizes `com.apple.developer.web-browser.public-key-credential` for that bundle ID; embed it in the `.app` during `mach macos-sign` (see `mach macos-sign --help` production entitlements note).
3. Switch CI back to `-e production`, set `OASIS_APPLE_TEAM_ID`, and post-sign check that `application-identifier` equals `{team}.{CFBundleIdentifier}`.
4. Release QA: [`mac-release-qa-checklist.md`](mac-release-qa-checklist.md).

---

## Related

- Apple Passwords extension (separate stack): [`apple-credentials-macos.md`](apple-credentials-macos.md)
- Allowlist request: [`apple-passwords-allowlist-request.md`](apple-passwords-allowlist-request.md)
