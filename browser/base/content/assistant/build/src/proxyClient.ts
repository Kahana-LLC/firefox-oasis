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

const supabaseAuth = SupabaseAuth.getInstance();

async function ensureAuthenticated(): Promise<void> {
  const isAuthenticated = await supabaseAuth.isAuthenticated();
  if (!isAuthenticated) {
    throw new Error("Authentication required: Please sign in to use voice features");
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

export async function transcribeAudio(audioBlob: Blob): Promise<{ transcript: string }> {
  await ensureAuthenticated();
  
  // Convert blob to base64
  const arrayBuffer = await audioBlob.arrayBuffer();
  const base64Audio = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );
  
  // Call lambda with op: "transcribe"
  const result = await postSigned<{ transcript: string }>("transcribe", {
    audio: base64Audio,
    mimeType: audioBlob.type,
  });
  
  // Backend returns { transcript: "..." }
  return result;
}

export async function textToSpeech(text: string): Promise<Blob> {
  await ensureAuthenticated();
  
  const result = await postSigned<TtsResponse>("tts", { text });
  
  // The lambda should return base64 encoded audio
  const audioData = atob(result.audio);
  const arrayBuffer = new Uint8Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    arrayBuffer[i] = audioData.charCodeAt(i);
  }
  
  return new Blob([arrayBuffer], { type: result.mimeType || 'audio/mpeg' });
}
