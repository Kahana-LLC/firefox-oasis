# Apple credentials on macOS (Passwords, passkeys, TOTP)

**Audience:** Oasis users, support, product  
**Provenance:** Firefox WebAuthn + Apple iCloud Passwords extension (not Safari-native integration)

---

## What Oasis supports today

| Feature | How it works | Safari parity |
|---------|--------------|---------------|
| **Passkeys / Touch ID on websites** | macOS `AuthenticationServices` when signed build includes passkey entitlement | Close on supported sites |
| **Saved passwords from iCloud** | Apple’s official [iCloud Passwords extension](https://addons.mozilla.org/en-US/firefox/addon/icloud-passwords/) + system helper | **Partial** — extension UI, not system AutoFill bar |
| **TOTP / verification codes** | Same Apple extension (when connected) | Partial |
| **Oasis account sign-in** (sidebar) | Web OAuth (Google, Apple, Microsoft, email) | N/A |

Safari integrates Passwords at the OS/WebKit level. Other browsers, including Oasis, use Apple’s extension and native messaging unless Apple adds deeper APIs.

---

## Setup: Apple Passwords extension

**Requirements:** macOS **Sonoma (14)** or later; iCloud Passwords enabled; Oasis current release with passkey signing fix.

1. Open **System Settings → Apple Account → iCloud → Passwords** (or **Passwords** app) and ensure sync is on.
2. Install **[iCloud Passwords](https://addons.mozilla.org/en-US/firefox/addon/icloud-passwords/)** from Mozilla’s add-ons site (official Apple extension).
3. **Pin** the extension to the toolbar (right-click → Pin to Toolbar).
4. Click the extension icon on a **site where you already have a saved login** (not `about:blank` or empty new tab).
5. Enter the **6-digit verification code** shown on your Mac when prompted.
6. In extension settings, enable **In-Page AutoFill** if you want suggestions in login fields.
7. Allow the extension to **turn off Firefox’s built-in password AutoFill** when offered (reduces duplicate prompts).

**Strong new passwords:** Apple may still direct you to the **Passwords app** or **Safari** to generate passwords. That is an Apple extension limitation, not an Oasis bug.

---

## Setup: Touch ID passkeys

After a release that includes the passkey entitlement and pref (see [passkeys-mac-engineering-notes.md](passkeys-mac-engineering-notes.md)):

- Sign in to sites with passkeys stored in **iCloud Keychain** using the **system sheet** and Touch ID.
- If you see *“Touch your security key”* under the address bar, Oasis is on the **USB security-key fallback path** — update Oasis or check signing (support checklist below).

---

## Troubleshooting

### “This browser is not supported” / “could not find web helper” (iCloud Passwords)

Oasis uses bundle ID **`com.oasis.browser`**. Apple’s password helper allowlists approved browsers. Until Oasis is on [Apple’s distribution list](https://github.com/apple/password-manager-resources/blob/main/quirks/web-browser-extension-distribution-information.json), the extension may fail to connect even when installed correctly.

**User workarounds:**

- Update macOS to the latest release after Apple adds Oasis (track [allowlist request](apple-passwords-allowlist-request.md)).
- Confirm macOS 14+ and official extension from AMO (not unofficial forks unless on Windows).
- Pair on a real website with a known saved password.

**Support diagnostics:**

| Check | Command / location |
|-------|-------------------|
| Oasis version | `about:support` |
| Native manifest | `ls "/Library/Application Support/Mozilla/NativeMessagingHosts/com.apple.passwordmanager.json"` |
| Extension ID | `password-manager-firefox-extension@apple.com` |
| Codesign (passkeys) | `codesign -d --entitlements :- /Applications/Oasis.app/Contents/MacOS/oasis` |

### Touch ID / passkey prompts do nothing

1. Confirm `security.webauthn.enable_macos_passkeys` = true in `about:config`.
2. Confirm passkey entitlement on the app (see table above).
3. Retry on [webauthn.io](https://webauthn.io).
4. Minimum macOS **13.3** for platform WebAuthn API.

### Conflicts with Firefox saved passwords

Use **either** Oasis/Firefox Lockwise **or** iCloud Passwords for a given site, not both. Prefer disabling Firefox password saving when using Apple’s extension.

---

## Support macro (draft)

> Oasis on Mac uses Apple’s official iCloud Passwords extension for saved passwords, and the system passkey API for Touch ID on websites. If the extension says the browser isn’t supported, Apple must allowlist Oasis (`com.oasis.browser`) in a future macOS update—we’ve submitted that request. For passkeys, ensure you’re on the latest Oasis build; if you see “Touch your security key,” update Oasis so Touch ID can work. Full steps: [apple-credentials-macos.md](apple-credentials-macos.md).

---

## See also

- [passkeys-mac-engineering-notes.md](passkeys-mac-engineering-notes.md)
- [apple-passwords-allowlist-request.md](apple-passwords-allowlist-request.md)
- [mac-release-qa-checklist.md](mac-release-qa-checklist.md)
- [oasis-capability-index.md](oasis-capability-index.md)
