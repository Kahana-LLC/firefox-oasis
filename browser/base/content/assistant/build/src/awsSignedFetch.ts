/** HTTP client for assist (Supabase) and voice Lambda (IAM SigV4 + JWT in x-oasis-authorization). */
import SupabaseAuth from "./services/supabase.js";
import { assistantLogger } from "./utils/assistantLogger.js";
import { postVoiceLambdaWithIam } from "./voiceLambdaIamFetch.js";

const normalizeEndpoint = (value: string | undefined): string =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const assistantUrl = normalizeEndpoint(process.env.OASIS_ASSIST_URL);
const transcribeUrl = normalizeEndpoint(process.env.OASIS_TRANSCRIBE_URL);
const supabaseAuth = SupabaseAuth.getInstance();

type SignedOperation = "assist" | "transcribe" | "tts";
const endpointByOperation: Record<SignedOperation, string> = {
  assist: assistantUrl,
  transcribe: transcribeUrl,
  tts: transcribeUrl,
};
const endpointEnvByOperation: Record<SignedOperation, string> = {
  assist: "OASIS_ASSIST_URL",
  transcribe: "OASIS_TRANSCRIBE_URL",
  tts: "OASIS_TRANSCRIBE_URL",
};

export function getAssistantApiBase(): string {
  return assistantUrl;
}

export async function postSigned<TResponse = Record<string, unknown>>(
  op: SignedOperation,
  payload: Record<string, unknown>
): Promise<TResponse> {
  const endpoint = endpointByOperation[op];
  if (!endpoint) {
    throw new Error(
      `Endpoint not configured for operation "${op}". Missing ${endpointEnvByOperation[op]}.`
    );
  }

  const body = JSON.stringify({ op, ...payload });

  const session = await supabaseAuth.getSession();
  const token = session?.access_token;
  const requiresJwt = op !== "assist";
  if (requiresJwt && !token) {
    throw new Error("Authentication required: No JWT found");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res =
    op === "transcribe" || op === "tts"
      ? await postVoiceLambdaWithIam(endpoint, body, token)
      : await fetch(endpoint, { method: "POST", headers, body });

  if (!res.ok) {
    const errorBody = await res.text();
    assistantLogger.error("transport", "Assistant backend error", {
      op,
      status: res.status,
      errorBody,
    });
    throw new Error(`Assistant backend ${res.status} ${errorBody}`);
  }
  return res.json() as Promise<TResponse>;
}
