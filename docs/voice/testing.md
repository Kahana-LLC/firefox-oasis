# Testing voice locally

## Preconditions checklist

- [ ] Built **`assistant/build`** and **`ui-preact`** (`npm run build` in each) and **`./mach build`**
- [ ] Configured **`build/.env.local`** if your team requires it, then rebuilt the assistant bundle and `./mach build`
- [ ] **`./mach run`**, assistant open, **signed in** if required
- [ ] **Microphone** permission granted

## Automated unit tests (fast)

From **`browser/base/content/assistant/build`**:

```bash
npm run test:voice-guards
```

**Success:** Node test runner reports **pass** for all tests (transcript-length guard, VAD debounce helper). **Exit code 0.**

This does **not** replace microphone + Lambda integration testing.

## Minimum smoke (manual)

| Check | Steps | Success |
|-------|--------|---------|
| **Composer STT** | In chat composer, use the **microphone** control: start, speak a short phrase, stop | Transcribed text appears in the **input field** (or your product’s send path) |
| **Orb** | Open the **voice overlay**, tap to start listening, speak a short command, let VAD end or tap to finish | Transcript appears in overlay; assistant runs; **Spoken** or **Chat** mode behaves as selected |

Capture mode and reply mode use `localStorage` keys **`oasis.voice.captureMode`** (`continuous` / `precise`) and **`oasis.voice.orbSpokenReplies`** (spoken vs chat-only). See [VOICE_INPUT_SETUP.md](../../browser/base/content/assistant/VOICE_INPUT_SETUP.md) for details.

## Priority manual cases (from guardrails doc)

Full matrix: **[`voice-ux-test-plan-and-guardrails.md`](voice-ux-test-plan-and-guardrails.md)**. High-value subset:

| ID | Case | Expected |
|----|------|----------|
| **O-01** | Start/stop voice session | States match UI; mic released on close |
| **O-04** | Spoken mode, speakers on | Brief post-TTS delay before next capture; fewer phantom lines |
| **R-02** | Orb **Chat** reply mode | Text streams into **chat**; no TTS |
| **R-01** | Orb **Spoken** mode | TTS plays; user + assistant lines can appear in chat after turn |
| **P-01** | Composer mic | Transcript lands in field; can send like typed text |

## Verbose logging

1. Open **`about:config`**.
2. Set **`browser.oasis.assistant.debug`** to **`true`** (Boolean).
3. Reload the assistant / sidebar.
4. Open **Tools → Browser Console** and filter by scope.

| Scope | What to look for |
|-------|------------------|
| `voice` | Segment lifecycle, transcribe request/response previews |
| `voice-vad` | `first_speech_in_segment`, `silence_window_complete` |
| `voice-mic` | `MediaStreamTrack.enabled` toggles |
| `voice-state` | Listening phases, echo guard vs capturing |
| `voice-input` | Composer path: recording start/stop, transcribe |

**Warn** and **error** lines are not gated by the pref. Extended tables: [VOICE_INPUT_SETUP.md §Console scopes](../../browser/base/content/assistant/VOICE_INPUT_SETUP.md).

## Before you open a PR

- `./mach format` and `./mach lint` on touched files ([`AGENTS.md`](../../AGENTS.md))
- Rebuild bundles + `./mach build`, then repeat **smoke** checks above

## Related

- [onboarding.md](onboarding.md) — run the browser
- [environment.md](environment.md) — when STT fails despite a “green” build
