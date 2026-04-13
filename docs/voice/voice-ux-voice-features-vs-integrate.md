# Voice-to-text UX: `voice-features` vs `integrate/semantic-search-history-voice`

This note compares **hands-free voice (floating orb)** and **composer push-to-talk** behavior as shipped on **`voice-features`** with the **integrate** line of work **as built from this repository**, including the voice pipeline updates under `browser/base/content/assistant/build/src/`.

## Git fact (merge-base)

For **`browser/base/content/assistant/build/src/services/voiceAgent.ts`** specifically:

```bash
git diff voice-features..integrate/semantic-search-history-voice -- \
  browser/base/content/assistant/build/src/services/voiceAgent.ts
```

produces **no diff**: the two branches carry the **same committed** `voiceAgent.ts`. The **UX differences** below for the orb therefore come from **additional changes on integrate in this tree** (or future commits). To see them vs `voice-features`:

```bash
git diff voice-features -- browser/base/content/assistant/build/src/services/voiceAgent.ts
```

Other voice-related **committed** deltas between the branches are small (e.g. `proxyClient` / `assistRemote` options, comments in `awsSignedFetch`). **Lambda IAM signing** (`voiceLambdaIamFetch.ts`) and **verbose `voice` logging** exist on integrate **in this workspace** but may not be on every remote tip.

---

## Summary: what the user feels

| Area | `voice-features` (branch tip) | Integrate + voice pipeline (this repo) |
|------|-------------------------------|----------------------------------------|
| **When recording starts (orb)** | Only after VAD sees speech (RMS above threshold for several frames in a row). | **Continuous** (default): recorder starts as soon as listening begins. **Precise**: VAD-gated start (RMS threshold × **4** frames), stricter **auto** minimum bytes (**~800**). Toggle in the voice overlay; choice is stored in `localStorage` (`oasis.voice.captureMode`). |
| **Normal volume sensitivity** | **Stricter** VAD: higher RMS threshold (`0.028`), **4** consecutive frames, **320 ms** minimum utterance, **800** byte minimum blob. | **Continuous**: sensitive threshold (`0.005`); **240 ms** / **400** byte defaults for auto end; **manual orb stop** uses shorter minima. **Precise**: closer to `voice-features` gating for auto-sent clips. |
| **Waveform / levels** | Analyser: **byte** time-domain data, **0.65** smoothing; graph **source → analyser only** (can look “flat” in some Firefox builds). | **Float** time-domain RMS, **0.35** smoothing; **analyser → gain 0 → destination** so the graph pulls audio; `AudioContext` **`latencyHint: "interactive"`**; **resume** retried while listening if suspended. |
| **End of speech (hands-free)** | Silence after speech stops the recorder and sends one clip. | Same **720 ms** silence idea, but silence only **ends** an utterance **after** `seenSpeechInUtterance` (avoids auto-stopping on leading silence while the recorder is already rolling). |
| **Second tap on orb** | If no recorder: error only, stay listening. | If no recorder: error + **stop** session; if recorder: **manual stop** with looser min size. (Iterated during integrate debugging.) |
| **After assistant speaks (TTS)** | Next listening segment starts **immediately** (no extra delay in `voiceAgent`). | **Echo guard**: **~700 ms** delay before the next capture segment; **~450 ms** if the user interrupts TTS. Reduces transcribing **playback** as if it were the user. |
| **Mic constraints (orb)** | `echoCancellation` / `noiseSuppression` / `autoGainControl` **on**. | Same **on** (restored after experiments with `audio: true`); aligns with `voice-features` for echo. |
| **Composer mic (`voiceInput`)** | `getUserMedia({ audio: true })` (browser defaults). | `getUserMedia` with **echo cancellation trio** (matches orb). |
| **Transcribe / TTS HTTP** | `postSigned`: JWT only in `Authorization` for **`assist`**; voice ops still require a session but **did not** attach Bearer to transcribe/tts in the original snippet (bug for IAM URLs). | **Bearer** on all ops when a token exists; **SigV4** + Cognito pool for **transcribe/tts** to Lambda function URLs; JWT also in **`x-oasis-authorization`** and body **`access_token`** where applicable. |
| **Console visibility** | Standard errors only. | **`[Assistant:voice]`** `warn` logs for pipeline + optional **`browser.oasis.assistant.debug`** for VAD ticks. |

---

## Hands-free orb: end-to-end behavior

### `voice-features`

1. User starts voice → mic opens with processing enabled.
2. **No** `MediaRecorder` until RMS **> 0.028** for **4** animation frames (~short debounce).
3. User stops talking → **720 ms** quiet → stop recorder → if clip ≥ **320 ms** and ≥ **800** bytes → transcribe.
4. `getUserSpeaking()` follows **`speechActive`** (recorder on), so “speaking” UI tracks “we are recording an utterance,” not only “loud right now.”
5. Waveform uses **byte** RMS × 7 for display; analyser chain is minimal.

### Integrate (this repo’s `voiceAgent.ts`)

1. User starts voice → mic opens → **Continuous** mode starts **`MediaRecorder` immediately**; **Precise** waits for RMS above a threshold for **4** frames before starting the recorder.
2. VAD marks **“speech seen”** after **0.005** RMS for **3 consecutive** animation frames (debounce), then starts the silence countdown; avoids treating a single noise spike as speech while keeping continuous capture.
3. **720 ms** silence **after** speech was seen → auto-stop; **Precise** uses a higher **auto** minimum blob size than **Continuous**.
4. `getUserSpeaking()` is **`speechActive && seenSpeechInUtterance`** so “Picking up speech” matches **audible** level, not merely “recording armed.”
5. Web Audio graph drives the analyser reliably; **post-TTS echo guard** before the next segment, with **`listening_phase`** so the UI can show **“Ready in a moment…”**; mic tracks are **disabled** during **thinking** and **speaking**. **Chat** reply mode uses a **shorter** post-reply echo guard than TTS. **Spoken** turns **mirror** user + assistant text into the chat timeline after playback.

**UX consequence:** On `voice-features`, **quiet rooms** and **short “um”** clips are more often **ignored** (stricter gates). On integrate, **more audio** is sent (continuous capture + looser gates), which helps when VAD was starved, but **raises** the risk of **echo** unless echo cancellation + post-TTS delay + headphones/low volume are used.

---

## Composer push-to-talk

| | `voice-features` | Integrate (this repo) |
|---|------------------|------------------------|
| **Capture** | Full press-to-talk window; **default** `audio: true`. | Same flow; **explicit** echo cancellation / noise / AGC. |
| **Transcription** | Same `transcribeAudio` → Lambda. | Same path + **IAM signing** / headers / body fields as above. |

Push-to-talk does **not** use orb VAD; differences are mostly **mic constraints** and **transport**.

---

## Why `voice-features` could feel “better” at normal volume

1. **VAD-gated recording** meant the file sent to STT often started **closer to real words**, with less leading silence and less accidental noise.
2. **Higher RMS threshold + 4 frames** reduced **false triggers** from low-level noise.
3. **Larger minimum bytes (800)** dropped **tiny** garbage clips that confuse the model or STT.

Integrate’s direction trades that for **reliability** when the analyser/recorder pipeline was **not starting at all** in some environments, then adds **echo control** so TTS is not transcribed as the user.

---

## UI shell (`ui-preact`)

`git diff voice-features..integrate/semantic-search-history-voice -- browser/base/content/assistant/ui-preact/src/App.tsx` is **large** (chat/runtime refactor). The **voice overlay** concepts (orb, `VoiceAgentOverlay`, `VoiceAuraVisualizer`, states idle/listening/transcribing/thinking/speaking) are largely the same **pattern**; most line churn is **not** voice-specific. For voice-only UI text, compare overlays in both versions if copy diverged.

---

## Refresh commands

```bash
# Voice bundle
cd browser/base/content/assistant/build && npm run build

# Browser
cd /path/to/firefox-oasis && ./mach build && ./mach run
```

---

## Related docs

- [`VOICE_INPUT_SETUP.md`](../../browser/base/content/assistant/VOICE_INPUT_SETUP.md) — Lambda payload, env vars, troubleshooting (403, IAM).
- [`voice-features-branch-setup.md`](voice-features-branch-setup.md) — checking out `voice-features` and manual tests.
- [`voice-ux-test-plan-and-guardrails.md`](voice-ux-test-plan-and-guardrails.md) — voice UX test matrix, release checklist, scope/derailment guardrails, standards references.

---

## Manual test checklist (integrate hands-free + composer)

Run after `npm run build` in `browser/base/content/assistant/build`, `npm run build` in `browser/base/content/assistant/ui-preact`, and `./mach build`.

| Scenario | Continuous | Precise | Notes |
|----------|------------|---------|--------|
| Normal-volume command, silence auto-end | Yes | Yes | Utterance should transcribe without orb tap. |
| Command after TTS (speakers) | Yes | Yes | Expect brief **“Ready in a moment…”** (echo guard); avoid transcribing playback as user speech. |
| Headphones vs speakers | Yes | Yes | Echo hint in overlay; composer hint mentions low volume / headphones. |
| Manual orb tap (short phrase) | Yes | Yes | Manual stop should be more lenient than auto minima. |
| Composer push-to-talk | n/a | n/a | Empty clip to chat message, not silent failure; 403 to setup doc copy. |
| **Precise** quiet room / noise | n/a | Yes | Fewer junk clips vs continuous; may need slightly louder start. |
| Signed out / 403 transcribe | Yes | Yes | Actionable error; orb retains last error until dismiss or success. |
| Cancel long turn | Yes | Yes | Tap orb during transcribing or thinking calls `stop()`. |

Optional: set `browser.oasis.assistant.debug` to **true** and confirm `[Assistant:voice]` diagnostics in the console (`VOICE_INPUT_SETUP.md`).

### Debugging voice in the console

With **`browser.oasis.assistant.debug`** enabled, logs include **`utteranceSeq`** on the orb path so you can correlate VAD, segment end (`segment_finished` / `endReason`), and transcribe request/response. Composer recordings log under **`[Assistant:voice-input]`** with per-session `utteranceSeq` and capture device hints. See **Developer: verbose assistant logs** and **Debugging phantom transcripts** in `browser/base/content/assistant/VOICE_INPUT_SETUP.md`.
