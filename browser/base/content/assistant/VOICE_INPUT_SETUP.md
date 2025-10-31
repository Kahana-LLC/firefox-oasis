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
- Sends to lambda via `transcribeAudio()` in `proxyClient.ts`

### 2. Proxy Client (`src/proxyClient.ts`)
- `transcribeAudio(audioBlob)` - Sends audio to lambda with `op: "transcribe"`
- Uses same authenticated `postSigned()` method as chat/route operations
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
OASIS_API_BASE=<your-lambda-function-url>
```

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
  "transcript": "This is the transcribed text"
}
```

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
4. ✅ Returns `{ transcript: "..." }`

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
