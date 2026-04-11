/**
 * Remote API client for the backend Lambda.
 *
 * Provides three endpoints via AWS-signed HTTP requests:
 * - assistRemote(): sends user message + tools to the LLM for routing
 * - transcribeAudio(): converts voice recordings to text
 * - textToSpeech(): converts text responses to audio
 *
 * All requests require Supabase authentication.
 */
import { postSigned } from "./awsSignedFetch.js";
import SupabaseAuth from "./services/supabase.js";
import { assistantLogger } from "./utils/assistantLogger.js";

function voicePreview(text: string, max = 220): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "(empty)";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export type WireMsg = { role: "user" | "model"; content: string };
export type AssistTool = {
  name: string;
  description?: string;
};
export type AssistResponse = {
  next?: string;
  args?: Record<string, unknown>;
  content?: string;
  reason?: string;
  [key: string]: unknown;
};
type TtsResponse = { audio: string; mimeType?: string };

export type TranscribeResponse = {
  transcript: string;
  confidence?: number;
};

export type TranscribeCallMeta = {
  source: "orb" | "composer";
  utteranceSeq?: number;
};

const supabaseAuth = SupabaseAuth.getInstance();

async function ensureAuthenticated(): Promise<void> {
  const isAuthenticated = await supabaseAuth.isAuthenticated();
  if (!isAuthenticated) {
    throw new Error(
      "Authentication required: Please sign in to use voice features"
    );
  }
}

export async function assistRemote(
  system: string,
  messages: WireMsg[],
  options: string[],
  tools: AssistTool[] = [],
  generationConfig?: Record<string, unknown>
): Promise<AssistResponse> {
  return postSigned<AssistResponse>("assist", {
    system,
    messages,
    options,
    tools,
    ...(generationConfig ? { generation_config: generationConfig } : {}),
  });
}

export async function transcribeAudio(
  audioBlob: Blob,
  meta?: TranscribeCallMeta
): Promise<TranscribeResponse> {
  await ensureAuthenticated();

  const session = await supabaseAuth.getSession();
  const accessToken = session?.access_token;

  const arrayBuffer = await audioBlob.arrayBuffer();
  const base64Audio = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ""
    )
  );

  assistantLogger.debug("voice", "transcribe request", {
    blobBytes: audioBlob.size,
    mimeType: audioBlob.type || "(none)",
    payloadBase64Chars: base64Audio.length,
    ...meta,
  });

  assistantLogger.warn("voice", "transcribe request", {
    blobBytes: audioBlob.size,
    mimeType: audioBlob.type || "(none)",
    payloadBase64Chars: base64Audio.length,
    ...(meta ? { source: meta.source, utteranceSeq: meta.utteranceSeq } : {}),
  });

  const result = await postSigned<TranscribeResponse>("transcribe", {
    audio: base64Audio,
    mimeType: audioBlob.type,
    ...(accessToken ? { access_token: accessToken } : {}),
  });

  assistantLogger.debug("voice", "transcribe response", {
    transcriptChars: result.transcript?.length ?? 0,
    transcriptPreview: voicePreview(result.transcript || ""),
    confidence:
      typeof result.confidence === "number" ? result.confidence : undefined,
    ...meta,
  });

  assistantLogger.warn("voice", "transcribe response", {
    transcriptChars: result.transcript?.length ?? 0,
    transcriptPreview: voicePreview(result.transcript || ""),
    confidence:
      typeof result.confidence === "number" ? result.confidence : undefined,
    ...(meta ? { source: meta.source, utteranceSeq: meta.utteranceSeq } : {}),
  });

  return result;
}

export async function textToSpeech(text: string): Promise<Blob> {
  await ensureAuthenticated();

  const session = await supabaseAuth.getSession();
  const accessToken = session?.access_token;

  assistantLogger.warn("voice", "tts request", {
    textChars: text.length,
    textPreview: voicePreview(text, 180),
  });

  const result = await postSigned<TtsResponse>("tts", {
    text,
    ...(accessToken ? { access_token: accessToken } : {}),
  });

  assistantLogger.warn("voice", "tts response", {
    audioFieldChars: result.audio?.length ?? 0,
    mimeType: result.mimeType || "(default)",
  });

  // The lambda should return base64 encoded audio
  const audioData = atob(result.audio);
  const arrayBuffer = new Uint8Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    arrayBuffer[i] = audioData.charCodeAt(i);
  }

  return new Blob([arrayBuffer], { type: result.mimeType || "audio/mpeg" });
}
