import { postSigned } from "./awsSignedFetch";
import SupabaseAuth from "./services/supabase";

export type WireMsg = { role: "user" | "model"; content: string };

const supabaseAuth = SupabaseAuth.getInstance();

async function checkAuthentication(): Promise<boolean> {
  const isAuthenticated = await supabaseAuth.isAuthenticated();
  if (!isAuthenticated) {
    throw new Error("Authentication required: Please sign in to use the AI assistant");
  }
  return true;
}

export async function routeRemote(system: string, messages: WireMsg[], options: string[]) {
  await checkAuthentication();
  return postSigned("route", { system, messages, options });
}

export async function chatRemote(system: string, messages: WireMsg[]) {
  await checkAuthentication();
  return postSigned("chat", { system, messages });
}

export async function transcribeAudio(audioBlob: Blob): Promise<{ transcript: string }> {
  await checkAuthentication();
  
  // Convert blob to base64
  const arrayBuffer = await audioBlob.arrayBuffer();
  const base64Audio = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );
  
  // Call lambda with op: "transcribe"
  const result = await postSigned("transcribe", { audio: base64Audio, mimeType: audioBlob.type });
  
  // Backend returns { transcript: "..." }
  return result;
}

export async function textToSpeech(text: string): Promise<Blob> {
  await checkAuthentication();
  
  const result = await postSigned("tts", { text });
  
  // The lambda should return base64 encoded audio
  const audioData = atob(result.audio);
  const arrayBuffer = new Uint8Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    arrayBuffer[i] = audioData.charCodeAt(i);
  }
  
  return new Blob([arrayBuffer], { type: result.mimeType || 'audio/mpeg' });
}
