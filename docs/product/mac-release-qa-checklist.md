# macOS release QA checklist

Use before promoting **oasis-canary** → **oasis-stable** or publishing a versioned release.

---

## Build and signing

- [ ] CI **Oasis Release Canary** completed for tag `vX.Y.Z.N` (both aarch64 and x86_64).
- [ ] Post-sign step confirms **no** restricted passkey / `application-identifier` entitlements on main executable (required for launch without a provisioning profile).
- [ ] DMG and app notarization + stapling succeeded (`spctl -a -vv` passes on `.app`).

```bash
codesign -d --entitlements :- /path/to/Oasis.app/Contents/MacOS/oasis | plutil -p -
# Must NOT include com.apple.developer.web-browser.public-key-credential or
# com.apple.application-identifier until a Developer ID profile is embedded.
defaults read /path/to/Oasis.app/Contents/Info.plist CFBundleIdentifier
```

---

## Platform passkeys (Touch ID)

Install from canary DMG on **macOS 13.3+** with Touch ID or Apple Watch.

- [ ] `about:support` → `security.webauthn.enable_macos_passkeys` = **true** (default).
- [ ] [webauthn.io](https://webauthn.io) registration + assertion shows **system passkey UI**, not *“Touch your security key”* banner.
- [ ] Google `accounts.google.com` passkey sign-in completes with Touch ID (if user has Google passkey in iCloud Keychain).
- [ ] Oasis sidebar OAuth (Google / Apple / email) still works; email path does not spuriously trigger WebAuthn banner.

---

## Apple Passwords extension (optional Mac-first path)

- [ ] Official [iCloud Passwords](https://addons.mozilla.org/en-US/firefox/addon/icloud-passwords/) extension installs.
- [ ] Extension pairs on a **normal HTTPS site** (not empty new tab); 6-digit Mac code prompt appears when working.
- [ ] If helper rejects browser: track [allowlist status](apple-passwords-allowlist-request.md) — expected until Apple ingests `com.oasis.browser`.

---

## Onboarding

- [ ] Fresh profile: welcome flow shows **Apple Passwords** step on macOS (skippable).
- [ ] “Install extension” opens AMO; Skip / Continue reaches Oasis AI sign-in.

---

## Regression smoke

- [ ] Oasis Assistant sidebar loads; sign-in completes.
- [ ] `./mach build` channel build launches without WebAuthn regressions on Intel and Apple Silicon.

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Engineering | | |
| Product | | |
