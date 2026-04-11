# Voice UX: test plan and development guardrails

This document defines **manual test coverage**, **quality guardrails**, and **lightweight standards alignment** for Oasis voice (hands-free orb + composer push-to-talk). Use it for release checklists, regressions, and design/code review criteria.

**Related implementation:** [`browser/base/content/assistant/build/src/services/voiceAgent.ts`](../browser/base/content/assistant/build/src/services/voiceAgent.ts), [`voiceInput.ts`](../browser/base/content/assistant/build/src/services/voiceInput.ts), [`assistant.ts`](../browser/base/content/assistant/build/src/assistant.ts) (`runAssistantStream`), [`ui-preact/src/App.tsx`](../browser/base/content/assistant/ui-preact/src/App.tsx) (overlay). **Setup and debug:** [`browser/base/content/assistant/VOICE_INPUT_SETUP.md`](../browser/base/content/assistant/VOICE_INPUT_SETUP.md). **Behavior comparison:** [`docs/voice-ux-voice-features-vs-integrate.md`](voice-ux-voice-features-vs-integrate.md).

---

## 1. Why guardrails matter (failure modes)

Voice stacks compound errors:

1. **ASR errors and hallucinations** — Short or noisy clips can produce fluent but **wrong** text; the model then responds to fiction.
2. **Acoustic echo** — Speaker output re-enters the mic and is transcribed as “user” speech.
3. **Scope drift** — After a failed or ambiguous **browser** command, the assistant may answer as a **general chatbot**, which feels like the product “derailed” (e.g. interpreting random lines as emotional conversation).
4. **Multi-turn context** — Prior tab/search state plus bad transcripts amplify confusion.

Guardrails below separate **capture/transcription quality**, **assistant behavior**, and **user-visible recovery**.

---

## 2. Standards and heuristics (non-exhaustive)

These are **reference frames** for reviews; Oasis is not certifying against them in CI.

| Reference | How we use it |
|-----------|----------------|
| **ISO 9241-11** (usability: effectiveness, efficiency, satisfaction) | Voice tasks should **complete the right browser action** when the user spoke clearly; failures should be **recoverable** without losing the session. |
| **ISO/IEC 25010** (quality models) | Track **functional correctness** (right command), **interaction capability** (feedback, cancel), **fault tolerance** (bad transcript handling). |
| **WCAG 2.2** (perceivable / operable) | Status must not rely on **sound alone**: visual state on orb, chat text for “Chat” reply mode, errors visible and dismissible. |
| **Nielsen heuristics** (adapted) | **Visibility of system status** (listening vs thinking vs speaking); **error prevention and recovery**; **recognition over recall** (hints, explicit errors). |
| **Conversational UX practice** | Confirm **high-impact** actions when ambiguous; avoid long **off-topic** replies when the product is a **browser assistant**. |

---

## 3. Product guardrails (development rules)

### 3.1 Grounding and scope

- **Default stance:** The assistant in voice context should **prioritize Firefox/Oasis tools and browsing** when the utterance plausibly maps to them.
- **After a failed tool mapping:** Prefer a **short, actionable** clarification (“Say which site or use ‘search X on Google’”) over **long empathic** monologue that ignores the browser context.
- **Suspicious transcripts:** The orb discards **auto-ended** transcripts shorter than **5** characters unless they match a small **allowlist** of common commands (`ok`, `back`, `tab`, …) or the user **manually** stops recording on the orb (manual stop bypasses the gate). Lambda may return optional **`confidence`** on transcribe responses; it is logged when present (client gating is not enabled yet).

### 3.2 Transparency

- User should always be able to infer: **whether the mic is live**, **whether a reply will be spoken or only in chat**, and **what failed** (transcribe vs assistant vs permissions).

### 3.3 Privacy and safety

- Do not log **raw audio** or full transcripts at `warn` in production; use existing **pref-gated** debug logging ([`VOICE_INPUT_SETUP.md`](../browser/base/content/assistant/VOICE_INPUT_SETUP.md)).
- Voice-derived text should go through the same **tooling and policy** paths as typed text where applicable.

### 3.4 Consistency

- **Orb “Chat” reply mode** and **composer** should both land assistant text in the **same chat timeline** when possible, so the user has one history. **Spoken** mode **mirrors** each finished turn (user transcript + assistant reply text) into the chat timeline **after** TTS completes (no streaming chunks).
- **Composer “read aloud”** toggle is separate from **orb Spoken / Chat** ([`VOICE_INPUT_SETUP.md`](../browser/base/content/assistant/VOICE_INPUT_SETUP.md)); document and test both.

---

## 4. Test dimensions (matrix)

When running a pass, vary:

| Dimension | Values to cover |
|-----------|------------------|
| **Entry** | Orb hands-free, composer push-to-talk |
| **Capture** | Continuous, Precise (`oasis.voice.captureMode`) |
| **Orb replies** | Spoken, Chat (`oasis.voice.orbSpokenReplies`) |
| **Audio path** | Built-in mic, external USB mic, headphones vs speakers |
| **Environment** | Quiet room, light background noise, TV/audio in room (stress) |
| **Auth** | Signed in, signed out / limit reached |
| **Follow-up** | Single command, multi-step session, command after TTS |

**Severity** for failures: **P0** session broken or data loss; **P1** wrong action with no clear error; **P2** polish / copy; **P3** edge hardware.

---

## 5. Manual test suites

### 5.1 Orb: session and states

| ID | Case | Steps | Expected | Sev |
|----|------|--------|----------|-----|
| O-01 | Start / stop | Open overlay, tap orb from idle | Mic permission if needed; enters listening; status matches | P0 |
| O-02 | Close overlay | Close while listening | Session stops; mic released; no orphan recorder | P0 |
| O-03 | Cancel busy | During thinking/transcribing, tap orb | Turn cancels; returns to safe state | P1 |
| O-04 | Echo guard | Spoken mode: after TTS, stay quiet | Brief “Ready in a moment…” / phase; mic stays **off** during thinking and speaking; post-TTS echo guard **~700 ms**; **Chat** reply mode uses a **shorter** post-reply guard (**~180 ms**) | P1 |
| O-05 | Manual send | Listening: speak then tap orb | Utterance sends; transcribe runs | P1 |

### 5.2 Orb: capture modes

| ID | Case | Steps | Expected | Sev |
|----|------|--------|----------|-----|
| C-01 | Continuous | Normal command, pause | Auto end-of-speech sends clip; **speech-in-segment** requires **RMS above threshold for 3 consecutive animation frames** before silence countdown starts (reduces single-spike noise) | P1 |
| C-02 | Precise | Same | Recorder starts only after sustained level; fewer junk sends in noise | P1 |
| C-03 | Precise quiet | Whisper or very quiet | May need louder speech or Continuous; no silent hang | P2 |

### 5.3 Orb: reply mode (Spoken vs Chat)

| ID | Case | Steps | Expected | Sev |
|----|------|--------|----------|-----|
| R-01 | Spoken | Complete one command | TTS plays; chat shows **user + assistant** lines for that turn after playback (mirror, not streamed) | P1 |
| R-02 | Chat | Same command | No TTS; user + AI rows appear in **chat**; text **streams** | P0 |
| R-03 | Toggle mid-session | Switch Spoken ↔ Chat between turns | Next turn respects mode; no stuck `speaking` state | P1 |

### 5.4 Composer push-to-talk

| ID | Case | Steps | Expected | Sev |
|----|------|--------|----------|-----|
| P-01 | Happy path | Tap mic, speak, tap stop | Transcript in field or send path; message in chat | P0 |
| P-02 | Empty / noise | Very short or silent stop | Actionable **chat** or visible error, not silent failure | P1 |
| P-03 | 403 / IAM | Misconfigured endpoint (if test env) | Message points to setup / admin | P1 |

### 5.5 Transcription and “phantom user” stress

| ID | Case | Steps | Expected | Sev |
|----|------|--------|----------|-----|
| T-01 | Quiet hold | Listening, say nothing meaningful | No spurious **user** lines in chat in Chat mode; or rare, inspect `utteranceSeq` in debug | P1 |
| T-02 | Room noise / TV | TV on low in background | Prefer Precise; phantom lines **documented**; use debug pref to correlate RMS/blob/transcript | P2 |
| T-03 | Repeat same phrase | Same command twice | Consistent routing or clear “already done” behavior | P2 |

### 5.6 Assistant behavior and derailment (regression)

| ID | Case | Steps | Expected | Sev |
|----|------|--------|----------|-----|
| A-01 | Ambiguous browser phrase | e.g. “open X in a new window” (unclear X) | Clarification or safe refusal; **no** long unrelated empathy thread | P1 |
| A-02 | After failure | Follow failed command with clear command | Recovers to normal tool use | P1 |
| A-03 | Off-topic transcript | If ASR outputs nonsense | Assistant should **not** assume deep personal context; short redirect to browser help | P2 |
| A-04 | Long session | 10+ voice turns mixed with tabs | History coherent; no unbounded error state | P2 |

### 5.7 Accessibility and clarity

| ID | Case | Steps | Expected | Sev |
|----|------|--------|----------|-----|
| AC-01 | Visual status | Observe overlay during each state | Listening / thinking / speaking distinguishable without audio | P2 |
| AC-02 | Errors | Force transcribe error | Error visible; dismissible; does not vanish on irrelevant transition | P2 |

### 5.8 Debug and support

| ID | Case | Steps | Expected | Sev |
|----|------|--------|----------|-----|
| D-01 | Debug pref | `browser.oasis.assistant.debug` = true | `[Assistant:voice*]` logs; correlate `utteranceSeq` | P3 |
| D-02 | Device | External vs internal mic | `voice-input` logs show device hint; behavior explained | P3 |

---

## 6. Release regression checklist (short)

Use before merge or weekly on integrate:

- [ ] O-01, O-02, R-02 (Chat stream), C-01 or C-02 (one capture path), P-01  
- [ ] O-04 echo guard with **speakers** once  
- [ ] A-01 ambiguous command **does not** derail into unrelated chat  
- [ ] Signed-out or limit message still intelligible for voice paths  

Build:

```bash
cd browser/base/content/assistant/build && npm run build
npm run test:voice-guards
cd ../ui-preact && npm run build
./mach build
```

---

## 7. Automation (future)

- **E2E with real audio** is expensive and flaky in CI; prefer **unit/integration** tests on pure functions (transcript normalization, state machine helpers) if extracted. Run **`npm run test:voice-guards`** in `browser/base/content/assistant/build` for **VAD debounce** and **short-transcript** helpers.
- **Contract tests** for Lambda transcribe payload/response shapes.
- **Synthetic audio** clips for STT smoke tests are possible in dedicated infra, not default CI.

---

## 8. Document maintenance

- When adding voice states, events, or toggles, update **section 5** and [`voice-ux-voice-features-vs-integrate.md`](voice-ux-voice-features-vs-integrate.md) checklist.
- When changing prompt or tool-routing behavior, re-run **A-*** cases.

---

## 9. References (external)

- ISO 9241-11:2018 — Ergonomics of human-system interaction — Part 11: Usability definitions and concepts  
- ISO/IEC 25010 — Systems and software engineering — Software product Quality Requirements and Evaluation  
- W3C WCAG 2.2 — Web Content Accessibility Guidelines  
- Nielsen Norman Group — Usability heuristics (adapted for voice/status feedback)
