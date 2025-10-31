// Signs POSTs to a Lambda Function URL with Supabase JWT
import SupabaseAuth from "./services/supabase";

const functionUrl = process.env.OASIS_API_BASE!.replace(/\/+$/, "/");
const transcribeUrl = process.env.OASIS_TRANSCRIBE_URL || functionUrl; // Separate endpoint for transcription (optional)
const supabaseAuth = SupabaseAuth.getInstance();

export async function postSigned(op: "route" | "chat" | "transcribe" | "tts", payload: Record<string, any>) {
  // Use separate transcription endpoint if configured, otherwise use main endpoint
  const endpoint = (op === "transcribe" || op === "tts") ? transcribeUrl : functionUrl;
  
  const url = new URL(endpoint);
  const body = JSON.stringify({ op, ...payload });

  const session = await supabaseAuth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error("Authentication required: No JWT found");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  
  // Only add auth header for chat/route operations
  // Transcription lambda doesn't verify JWT
  if (op === "route" || op === "chat") {
    headers.Authorization = `Bearer ${token}`;
  }

  console.log(`[postSigned] Calling ${op} at ${endpoint}`);
  console.log(`[postSigned] Headers:`, headers);
  console.log(`[postSigned] Body length:`, body.length);

  const res = await fetch(endpoint, { method: "POST", headers, body });
  
  console.log(`[postSigned] Response status:`, res.status);
  
  if (!res.ok) {
    const errorBody = await res.text();
    console.error("Lambda Error:", errorBody);
    throw new Error(`Lambda ${res.status} ${errorBody}`);
  }
  return res.json();
}
