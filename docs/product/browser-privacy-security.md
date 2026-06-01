# Browser privacy and security (Firefox core + Oasis profile)

**Version:** v1.0.0.12 (`8ecad89`)  
**Provenance:** Primarily **Firefox-inherited**; Oasis customizes branding, onboarding copy, and some defaults.

---

## Important labeling for marketing

Oasis is built on **Firefox**. Capabilities in this document are **not Oasis-exclusive inventions** unless marked **Oasis customization**.

Use phrasing such as:

- “Built on Firefox’s Enhanced Tracking Protection”
- “Oasis ships with strict privacy defaults from Firefox”

Avoid: “Oasis blocks all ads” or “Oasis invented tracking protection” without legal review.

---

## Enhanced Tracking Protection (ETP)

**Provenance:** Firefox core  
**User path:** Settings → Privacy & Security → Enhanced Tracking Protection

| Mode | Summary |
|------|---------|
| **Standard** | Blocks known trackers in private windows and third-party trackers commonly used for tracking |
| **Strict** | Stronger blocking; may break some sites |
| **Custom** | User-selected protections |

Related protections exposed in UI (see [`privacy.inc.xhtml`](../../browser/components/preferences/privacy.inc.xhtml)):

- Tracking content blocking
- Cryptominers
- Fingerprinters
- Cookie / storage rules (Total Cookie Protection context)
- HTTPS-Only mode (when enabled by user)

Oasis welcome/onboarding markets **Privacy First — Enhanced tracking protection & encryption** ([`IMPLEMENTATION_SUMMARY.md`](../../browser/components/oasiswelcome/IMPLEMENTATION_SUMMARY.md)).

---

## Cookie and tracking defaults (Oasis profile)

**Provenance:** Firefox profile defaults in [`firefox.js`](../../browser/app/profile/firefox.js)

Notable defaults (verify on target channel before marketing claims):

| Pref | Value | Effect (high level) |
|------|-------|---------------------|
| `network.cookie.cookieBehavior` | `5` (reject tracker + partition foreign) | Stricter third-party / tracker cookies |
| `privacy.trackingprotection.fingerprinting.enabled` | `true` | Fingerprinting protection on |
| `privacy.trackingprotection.cryptomining.enabled` | `true` | Cryptomining blocker on |
| `privacy.trackingprotection.harmfuladdon.enabled` | `true` | Harmful add-on protection on |

These reduce cross-site tracking and some ad/tracker behavior; they do **not** replace a dedicated contacts-in-profile story (see gift mapping gap #1).

---

## Permissions and site data

**Provenance:** Firefox core

Users can manage per-site permissions (camera, mic, location, notifications, etc.) and clear cookies/site data from Privacy settings.

---

## What Oasis adds beyond Firefox core

| Item | Provenance | Notes |
|------|------------|-------|
| Oasis Assistant | Oasis | Separate privacy doc: [ai-assistant.md](ai-assistant.md) |
| Oasis Data Collection toggle | Oasis | Assistant `llm_usage` telemetry — [privacy-data-and-telemetry.md](privacy-data-and-telemetry.md) |
| Custom onboarding | Oasis | `browser/components/oasiswelcome/` |
| Kahana privacy policy URL | Oasis | `datareporting.policy.firstRunURL` → kahana.co |
| Branding / DMG / icons | Oasis | `browser/branding/custom/` |

---

## Mapping to narrative obstacles (high level)

| Obstacle (B2C spine §4) | Firefox/Oasis role |
|-------------------------|------------------|
| Follow-you ads | **Partial** — ETP + cookie behavior reduce trackers; not a guarantee of zero retargeting |
| Contacts in profile | **Gap** — no Oasis-specific “keep contacts out of browser profile” feature documented |
| Linked AI telemetry | **Oasis** toggle — not Firefox ETP |
| Tab chaos / calm | **Oasis Assistant** + UI; Firefox tab groups exist in core |

See [../marketing/b2c-magical-gifts-mapping.md](../marketing/b2c-magical-gifts-mapping.md).

---

## Code references

| Area | Path |
|------|------|
| Privacy UI | `browser/components/preferences/privacy.inc.xhtml` |
| Profile defaults | `browser/app/profile/firefox.js` |
| ETP strings | `browser/locales/en-US/browser/preferences/preferences.ftl` |
