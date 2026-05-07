# Environment variables, rebuild rules, and failure modes

## Where configuration lives

| File | Purpose |
|------|---------|
| [`build/.env.defaults`](../../browser/base/content/assistant/build/.env.defaults) | Committed defaults; do not put secrets here. |
| **`build/.env.local`** | **Local overrides** (gitignored): Lambda URLs, Cognito pool id, Supabase URLs, etc. Copy from team docs or ask for a template. |

The assistant **`npm run build`** step loads env via esbuild (see [`esbuild.config.mjs`](../../browser/base/content/assistant/build/esbuild.config.mjs) `dotenv` usage).

## Rebuild rule (mandatory)

Whenever you **create or edit** `browser/base/content/assistant/build/.env.local`:

1. `cd browser/base/content/assistant/build && npm run build`
2. `cd` to repo root and run `./mach build`

Without step 1, old endpoint URLs or keys remain **baked into the previous** `assistant.bundle.js`.

## Preconditions for end-to-end voice

1. **Signed in** to the assistant when the code requires Supabase for transcribe or assist.
2. **Microphone permission** granted for the browser chrome context used by the assistant.
3. **Backend reachable:** Lambda (or equivalent) with keys and IAM policy your team documents.

## Common symptoms and where to look

| What you see | Likely cause | Where to read more |
|--------------|--------------|-------------------|
| HTTP **403** / **Forbidden** on transcribe | Lambda URL auth (IAM), wrong pool, or policy | [VOICE_INPUT_SETUP.md §403](../../browser/base/content/assistant/VOICE_INPUT_SETUP.md) |
| “Sign in” / auth errors for voice | No Supabase session | Sign in through assistant UI; confirm env matches your backend |
| Empty transcript, generic errors | Wrong `OASIS_TRANSCRIBE_URL`, network, or Lambda misconfig | [VOICE_INPUT_SETUP.md](../../browser/base/content/assistant/VOICE_INPUT_SETUP.md) |
| Build works but old behavior | Forgot `npm run build` after `.env.local` change | This doc, **Rebuild rule** |

Full troubleshooting, request/response shapes, and IAM header details: **[`browser/base/content/assistant/VOICE_INPUT_SETUP.md`](../../browser/base/content/assistant/VOICE_INPUT_SETUP.md)**.

## Related

- [build.md](build.md) — bundle commands
- [testing.md](testing.md) — verify voice locally after env is correct
