/** HTTP client for assist (Supabase) and voice Lambda (IAM SigV4 + JWT in x-oasis-authorization). */
import SupabaseAuth from "./services/supabase.js";
import { assistantLogger } from "./utils/assistantLogger.js";
import { postVoiceLambdaWithIam } from "./voiceLambdaIamFetch.js";

export class QuotaExceededError extends Error {
  quota: any;
  isQuotaError = true;
  constructor(message: string, quota: any) {
    super(message);
    this.name = "QuotaExceededError";
    this.quota = quota;
  }
}

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
  payload: Record<string, unknown>,
  signal?: AbortSignal
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
      : await fetch(endpoint, { method: "POST", headers, body, signal });

  if (!res.ok) {
    const errorBody = await res.text();
    if (res.status === 429 && op === "assist") {
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.error === "quota_exceeded") {
          throw new QuotaExceededError(parsed.message || "Usage limit reached.", parsed.quota);
        }
      } catch (e: any) {
        if (e.isQuotaError) throw e;
      }
    }
    assistantLogger.error("transport", "Assistant backend error", {
      op,
      status: res.status,
      errorBody,
    });
    throw new Error(`Assistant backend ${res.status} ${errorBody}`);
  }
  return res.json() as Promise<TResponse>;
}
