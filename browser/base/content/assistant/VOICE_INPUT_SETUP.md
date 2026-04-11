# Voice Input Setup Guide

## Overview
The voice input feature uses a microphone button in the assistant UI to record audio, send it to your AWS Lambda function for transcription via Deepgram (with Gemini fallback), and populate the input field with the transcribed text.

## Architecture

```
User clicks mic → Records audio → Sends to Lambda → Deepgram/Gemini → Returns transcript → Fills input
```

## Frontend Components

### 1. Voice Input Service (`src/services/voiceInput.ts`)
- Handles microphone access via `navigator.mediaDevices.getUserMedia()`
- Records audio using `MediaRecorder` API
- Converts recorded audio to base64
- Sends to the voice Lambda via `transcribeAudio()` in `proxyClient.ts`

### 2. Proxy Client (`src/proxyClient.ts`)
- `transcribeAudio(audioBlob, meta?)` - Sends audio to the voice endpoint with `op: "transcribe"`. Optional `meta` (`source: "orb" | "composer"`, `utteranceSeq`) is used for console correlation only.
- Uses the authenticated `postSigned()` method for voice-only operations
- Includes Supabase JWT token in Authorization header

### 3. UI Integration (`assistant.ui.js`)
- Microphone button (🎤) added next to Stop and Clear Context buttons
- Click to start recording → shows (⏹️) and red background
- Click again to stop → shows loading (⏳) → transcribes → fills input field
- Displays status messages in the log

## Backend Lambda Configuration

### Environment Variables Required
```bash
DEEPGRAM_API_KEY=<your-deepgram-api-key>
GEMINI_API_KEY=<your-gemini-api-key>
```

### Client Endpoint Configuration
```bash
OASIS_TRANSCRIBE_URL=<your-voice-lambda-function-url>
```
Set this in `browser/base/content/assistant/build/.env.local` for local overrides.

### Request Format
```json
{
  "op": "transcribe",
  "audio": "<base64-encoded-audio>",
  "mimeType": "audio/webm;codecs=opus"
}
```

### Response Format
```json
{
  "transcript": "This is the transcribed text",
  "confidence": 0.92
}
```

`confidence` is **optional**. When present, the client logs it with transcribe responses; it is reserved for future gating.

### Supported Audio Formats
The frontend attempts these MIME types in order:
1. `audio/webm;codecs=opus` (preferred)
2. `audio/webm`
3. `audio/ogg;codecs=opus`
4. `audio/mp4`

## Lambda Function Structure

Your current lambda already handles the `transcribe` operation correctly:

1. ✅ Accepts `op: "transcribe"`
2. ✅ Expects `audio` (base64), `mimeType`, and optional `language`
3. ✅ Uses Deepgram first, falls back to Gemini
4. ✅ Returns `{ transcript: "..." }` (optional `confidence` number)

## How to Test

1. **Build the frontend:**
   ```bash
   cd browser/base/content/assistant/build
   npm run build
   ```

2. **Rebuild Firefox:**
   ```bash
   cd /Users/ashwinjohn/Projects/firefox-oasis
   ./mach build
   ```

3. **Run Firefox and open the assistant sidebar**

4. **Test the microphone:**
   - Ensure you're signed in (authentication required)
   - Click the 🎤 button
   - Grant microphone permissions when prompted
   - Speak clearly
   - Click ⏹️ to stop recording
   - Watch the input field populate with transcribed text

## Developer: verbose assistant logs

Voice and assistant code use `assistantLogger`. **`debug` / `info`** lines are hidden unless the Firefox pref **`browser.oasis.assistant.debug`** is **true**.

1. Open `about:config`.
2. Add or set **`browser.oasis.assistant.debug`** to **true** (Boolean).
3. Reload the assistant sidebar and watch the **Browser Console** for `[Assistant:voice]` and other scoped messages (including VAD-style diagnostics where implemented).

**Warn** and **error** logs are not gated and appear in normal builds.

### Console scopes (filter in DevTools)

Messages use the prefix `[Assistant:<scope>]`. Common voice-related scopes:

| Scope | What it covers |
|-------|----------------|
| `voice` | Segment lifecycle (`segment_started`, `segment_finished`, `arm_next_segment`), transcribe `debug` lines with `source` / `utteranceSeq` |
| `voice-state` | FSM transitions (`transition`), `listening_phase` (echo guard vs capturing) |
| `voice-vad` | RMS ticks (throttled), `first_speech_in_segment` (after **3** consecutive above-threshold frames), `silence_window_complete`, precise prime |
| `voice-mic` | `MediaStreamTrack.enabled` toggles on the capture stream (tracks stay **disabled** while **thinking** and **speaking** on the orb) |
| `voice-input` | Composer push-to-talk: `recording_started` (device `label` / `deviceId`), `sending_transcribe`, `recording_cancelled` |

### Hands-free orb: spoken replies vs chat-only

In the voice overlay, **Replies** can be **Spoken** (default) or **Chat**. **Chat** turns off text-to-speech for the orb: the assistant still hears you and runs the same pipeline, but answers **stream into the main chat** as text (using the same `runAssistantStream` chunks as typed messages). **Spoken** mode still **appends** the user transcript and final assistant reply to the chat after each TTS turn (for a single auditable timeline). The choice is stored in `localStorage` under **`oasis.voice.orbSpokenReplies`** (`1` / `0`). This is separate from the composer toolbar control that auto-reads aloud after you send from the mic button.

**Auto short transcript discard (orb):** If VAD ends a segment automatically and the transcript is **very short** (under **5** characters) and not on a small allowlist of commands, the client shows an error and does **not** run the assistant (reduces junk ASR → model derailment). **Manual** orb stop does not apply this gate.

### `utteranceSeq` (orb)

For the hands-free orb, **`utteranceSeq` increments each time a new `MediaRecorder` segment starts** (see `segment_started` / `segment_finished` in the console). Use the same number to tie together VAD events, segment end reason (`silence_vad`, `manual_stop`, `discard_too_small`, `aborted`), and `transcribe request` / `transcribe response` lines (with `source: "orb"`).

Composer push-to-talk uses a separate counter in **`voice-input`** logs (`source: "composer"` on transcribe).

### Debugging phantom transcripts

If the assistant reacts to speech you did not say:

1. Set **`browser.oasis.assistant.debug`** to **true** and open the **Browser Console**.
2. Reproduce the issue; find the **`utteranceSeq`** for the bad turn.
3. Inspect the sequence for that seq:
   - **`voice-vad` `first_speech_in_segment`**: note `rms` vs quiet floor (spurious crossing suggests noise or echo).
   - **`segment_finished`**: check `endReason`, `blobBytes`, and `durationMs` (tiny or odd clips often confuse STT).
   - **`transcribe response`** / **`transcribe request`**: compare `transcriptPreview` to the audio you expected.
4. For composer-only issues, filter **`voice-input`** and confirm **`recording_started`** `tracks` match the intended microphone (e.g. laptop vs USB).

## Troubleshooting

### "Failed to access microphone"
- Grant microphone permissions in Firefox
- Check `about:permissions` in Firefox
- On macOS, check System Preferences → Security & Privacy → Microphone

### "Transcription failed"
- Check browser console for errors
- Verify `DEEPGRAM_API_KEY` is set in lambda
- Check lambda CloudWatch logs
- Ensure lambda has correct IAM permissions

### Transcribe returns HTTP 403 `{"Message":"Forbidden"}`
This usually means the **Lambda function URL uses AWS IAM auth**. The client signs requests with **SigV4** using credentials from **`COGNITO_IDENTITY_POOL_ID`** (same values as in `build/.env.defaults` / `build/.env.local`), and sends the Supabase session JWT in the **`x-oasis-authorization: Bearer …`** header (not `Authorization`, which SigV4 uses for the AWS signature).

- In **API Gateway / Lambda URL** console, confirm auth mode (IAM vs NONE).
- The **Cognito identity pool** must allow **guest (unauthenticated)** identities if you are not wiring logins, and the **guest IAM role** must be allowed to invoke that function URL (resource policy / IAM).
- In Lambda, read the app JWT from **`event.headers["x-oasis-authorization"]`** (or the lowercased key your runtime exposes) if you still validate Supabase users server-side.

### "Please sign in to use voice input"
- User must be authenticated with Supabase
- Check that JWT token is being sent in Authorization header

### Audio quality issues
- Deepgram works best with clear, noise-free audio
- Consider adding `language` parameter if not English
- Gemini fallback is slower but may work better for accented speech

## Advanced Configuration

### Add language selection (optional)
Modify `proxyClient.ts` to pass language:
```typescript
return postSigned("transcribe", { 
  audio: base64Audio, 
  mimeType: audioBlob.type,
  language: "en-US" // or user-selected language
});
```

### Force Gemini provider (optional)
Set lambda environment variable:
```bash
TRANSCRIBE_PROVIDER=gemini
```

## Integration with TTS (Future)

Your lambda can also handle text-to-speech. To add TTS playback:

1. Add a speaker button in the UI
2. Create `textToSpeech()` function in `proxyClient.ts`
3. Add TTS handler in lambda for `op: "tts"`
4. Play returned audio using Web Audio API

Example TTS implementation already included in `proxyClient.ts` (ready to use when backend is implemented).
