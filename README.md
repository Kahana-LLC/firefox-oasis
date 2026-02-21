![Firefox Browser](./docs/readme/readme-banner.svg)

[Firefox](https://firefox.com/) is a fast, reliable and private web browser from the non-profit [Mozilla organization](https://mozilla.org/).

### Contributing

To learn how to contribute to Firefox read the [Firefox Contributors' Quick Reference document](https://firefox-source-docs.mozilla.org/contributing/contribution_quickref.html).

We use [bugzilla.mozilla.org](https://bugzilla.mozilla.org/) as our issue tracker, please file bugs there.

### Resources

* [Firefox Source Docs](https://firefox-source-docs.mozilla.org/) is our primary documentation repository
* Nightly development builds can be downloaded from [Firefox Nightly page](https://www.mozilla.org/firefox/channel/desktop/#nightly)

If you have a question about developing Firefox, and can't find the solution
on [Firefox Source Docs](https://firefox-source-docs.mozilla.org/), you can try asking your question on Matrix at
chat.mozilla.org in the [Introduction channel](https://chat.mozilla.org/#/room/#introduction:mozilla.org).

### Release Process (Oasis Canary)

Oasis Canary releases are automated via GitHub Actions using a fail-closed pipeline to ensure security and launch safety.

#### Release Trigger
1.  **Push Tag:** `v*` (e.g., `v135.0.0.1`).
2.  **Manual Dispatch:** Rerun existing tag via `workflow_dispatch` input `release_tag`.

#### Pipeline Stages
1.  **Build:** Compiles Firefox with custom branding.
2.  **Stage Package:** Creates the raw application bundle structure (resolving symlinks).
3.  **Sign & Notarize (App):**
    *   Uses `rcodesign` to sign the App Bundle using the Developer ID Application certificate.
    *   Submits to Apple Notarization Service.
    *   **Fail-Closed Gate:** If notarization fails, the workflow exits.
    *   Staples the notarization ticket to the App Bundle.
4.  **Package DMG:**
    *   Wraps the *signed and notarized* App Bundle into a DMG.
    *   Applies branding (background, icons, DS_Store).
5.  **Sign & Notarize (DMG):**
    *   Signs the DMG container itself.
    *   Submits DMG to Apple Notarization Service.
    *   **Fail-Closed Gate:** If DMG notarization fails, the workflow exits.
6.  **MAR Generation:**
    *   Generates the Mozilla ARchive (MAR) from the signed/notarized App Bundle.
    *   Signs the MAR with the Oasis Release Certificate.
7.  **Publish:**
    *   Creates a GitHub Release with the signed DMG and MAR.
    *   Updates the Supabase update ring pointer only if all previous steps succeeded.
