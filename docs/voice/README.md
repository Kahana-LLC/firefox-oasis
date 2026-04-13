# Voice features: documentation index

All **voice-related developer documentation** for Oasis lives in **`docs/voice/`** (this folder). Start here, then open the guides below.

## Onboarding and build

| Doc | What you get |
|-----|----------------|
| [Onboarding: clone, branches, first-time setup](onboarding.md) | `git clone`, which branch to use, `./mach bootstrap`, first `./mach build` vs daily workflow |
| [Build: npm bundles and `./mach build`](build.md) | Assistant `build/` + Preact `ui-preact/`, success signals, packaging paths |
| [Environment and failures](environment.md) | `.env.local`, rebuild rules, 403/auth symptoms, links to troubleshooting |
| [Testing](testing.md) | Unit tests (`test:voice-guards`), smoke checks, priority manual cases, debug pref |

## Architecture

| Doc | What you get |
|-----|----------------|
| [Architecture: runtime and code layout](architecture.md) | Diagrams (composer vs orb, auth), key source files |

## Reference and comparisons

| Doc | What you get |
|-----|----------------|
| [Developer guide entry](voice-features-developer-guide.md) | Short pointer and topic table (same content as this index in table form) |
| [Voice UX test plan and guardrails](voice-ux-test-plan-and-guardrails.md) | Manual test matrix, guardrails, release checklist |
| [Voice-features vs integrate comparison](voice-ux-voice-features-vs-integrate.md) | Behavioral differences between branches |
| [Legacy `voice-features` branch setup](voice-features-branch-setup.md) | Checkout `origin/voice-features` when required; otherwise use onboarding |

## Outside this folder

| Doc | What you get |
|-----|----------------|
| [VOICE_INPUT_SETUP.md](../../browser/base/content/assistant/VOICE_INPUT_SETUP.md) | Lambda configuration, IAM, troubleshooting (lives next to assistant code) |

**Canonical integration branch** for current assistant + voice + semantic history: **`integrate/semantic-search-history-voice`**.

**Stub links:** Older bookmarks under `docs/voice-*.md` (repo root `docs/`) redirect to files in this folder—use the links above.
