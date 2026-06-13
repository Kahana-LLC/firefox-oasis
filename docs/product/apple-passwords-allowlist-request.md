# Apple Passwords browser allowlist — Oasis request

Apple’s `PasswordManagerBrowserExtensionHelper` only communicates with browsers on an allowlist derived from [password-manager-resources](https://github.com/apple/password-manager-resources). Oasis must be added for the official iCloud Passwords Firefox extension to connect on **`com.oasis.browser`** builds.

**Tracking:** Submit to Apple via PR or issue; macOS ingests the list in periodic OS updates (same process as Zen Browser, LibreWolf, Ungoogled Chromium).

---

## Oasis signing metadata

| Field | Value |
|-------|--------|
| Long name | Oasis Browser |
| Short name | Oasis |
| Bundle identifier | `com.oasis.browser` |
| Code signing identifier | `com.oasis.browser` |
| Code signing team identifier | `NV6BDYHYA5` |
| Supported platforms | Mac |
| Extension store | Firefox Add-ons (store identifier **3** in Apple’s schema) |

Reference Firefox entry in the same file:

```json
{
  "long_name": "Mozilla Firefox",
  "short_name": "Firefox",
  "supported_platforms": ["Mac", "Windows", "Linux"],
  "platform_specific_information": {
    "Mac": {
      "bundle_identifier": "org.mozilla.firefox",
      "code_signing_identifier": "org.mozilla.firefox",
      "code_signing_team_identifier": "43AQ936H96"
    }
  },
  "supported_store_identifiers": [3]
}
```

---

## Proposed JSON entry

Add to [`quirks/web-browser-extension-distribution-information.json`](https://github.com/apple/password-manager-resources/blob/main/quirks/web-browser-extension-distribution-information.json):

```json
{
  "long_name": "Oasis Browser",
  "short_name": "Oasis",
  "supported_platforms": [
    "Mac"
  ],
  "platform_specific_information": {
    "Mac": {
      "bundle_identifier": "com.oasis.browser",
      "code_signing_identifier": "com.oasis.browser",
      "code_signing_team_identifier": "NV6BDYHYA5"
    }
  },
  "supported_store_identifiers": [
    3
  ]
}
```

**Store identifier 3** = Firefox Add-ons (same as Mozilla Firefox in Apple’s file).

---

## GitHub issue template (apple/password-manager-resources)

**Title:** Add Oasis Browser to web-browser-extension-distribution-information.json

**Body:**

> Oasis Browser is a macOS-first browser based on Firefox, distributed at `com.oasis.browser` and signed by team `NV6BDYHYA5`. We request inclusion in the allowlist used by `PasswordManagerBrowserExtensionHelper` so users can use Apple’s official [iCloud Passwords Firefox extension](https://addons.mozilla.org/en-US/firefox/addon/icloud-passwords/) (`password-manager-firefox-extension@apple.com`).
>
> Proposed entry: (paste JSON block above)
>
> Happy to adjust field names or provide additional signing details if needed.

---

## After merge

1. Watch for macOS release notes mentioning Passwords browser allowlist updates.
2. QA on canary: iCloud Passwords extension connects without “unsupported browser” ([mac-release-qa-checklist.md](mac-release-qa-checklist.md)).
3. Update [apple-credentials-macos.md](apple-credentials-macos.md) user-facing status.

---

## Internal owners

| Step | Owner |
|------|--------|
| Legal / Apple relationship review | Product / legal |
| GitHub PR or issue | Engineering |
| User comms when live | Support / marketing |
