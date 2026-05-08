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

/**
 * Lambda should enforce daily tokens using an effective cap:
 * daily_limit_base + sum_feedback_bonus_tokens_for_user(user_id) (UTC day, Supabase RPC).
 * Return that sum in daily_limit / daily_remaining, or the client bar and server may disagree.
 */
export type QuotaResult = {
  allowed?: boolean;
  reason?: string;
  daily_used?: number;
  /** Base daily token cap before feedback bonuses unless backend already folds them in. */
  daily_limit?: number;
  daily_remaining?: number;
  monthly_used?: number;
  monthly_limit?: number;
  monthly_remaining?: number;
};

export type AssistResponse = {
  next?: string;
  args?: Record<string, unknown>;
  content?: string;
  reason?: string;
  /** Number of model calls used for this assist request (native-assist multi-turn routing). */
  inner_rounds?: number;
  /** Gemini usage for this assist (Lambda aggregate or Edge last round); snake_case counts. */
  usage_metadata?: Record<string, unknown>;
  /** Present on authenticated Supabase Edge responses after `record_llm_usage`. */
  usage_stats?: Record<string, unknown>;
  quota?: QuotaResult;
  [key: string]: unknown;
};

/** Optional native-assist routing loop controls (Claude-style inner tool loop). */
export type AssistRemoteOptions = {
  max_inner_rounds?: number;
  refine_after_route?: boolean;
};

/**
 * Reads optional build-time env for multi-turn native assist routing.
 * Set in `build/.env.local`: OASIS_ASSIST_MAX_INNER_ROUNDS=1..8,
 * OASIS_ASSIST_REFINE_AFTER_ROUTE=1 (requires at least 2 inner rounds; defaults to 3 if max unset).
 */
export function getAssistLoopOptionsFromBuildEnv():
  | AssistRemoteOptions
  | undefined {
  const rawMax = String(
    typeof process.env.OASIS_ASSIST_MAX_INNER_ROUNDS === "string"
      ? process.env.OASIS_ASSIST_MAX_INNER_ROUNDS
      : ""
  ).trim();
  const rawRefine = String(
    typeof process.env.OASIS_ASSIST_REFINE_AFTER_ROUTE === "string"
      ? process.env.OASIS_ASSIST_REFINE_AFTER_ROUTE
      : ""
  ).trim();
  const refine =
    rawRefine === "1" || /^true$/i.test(rawRefine);

  let max: number | undefined;
  if (rawMax !== "") {
    const n = parseInt(rawMax, 10);
    if (Number.isFinite(n) && n >= 1) {
      max = Math.min(8, n);
    }
  }
  if (refine && (max == null || max < 2)) {
    max = 3;
  }
  if (max == null && !refine) {
    return undefined;
  }
  const out: AssistRemoteOptions = {};
  if (max != null) {
    out.max_inner_rounds = max;
  }
  if (refine) {
    out.refine_after_route = true;
  }
  return Object.keys(out).length ? out : undefined;
}
type TtsResponse = { audio: string; mimeType?: string };
export type TranscribeAudioCaptureMeta = {
  preprocessed: boolean;
  mimeType: string;
  durationMs?: number;
  rms?: number;
  sampleRateHz?: number;
  channels?: number;
};
export type TranscribeAudioOptions = {
  language?: string;
  captureMeta?: TranscribeAudioCaptureMeta;
  source?: string;
  utteranceSeq?: number;
};

const supabaseAuth = SupabaseAuth.getInstance();
let ttsWarmPromise: Promise<void> | null = null;
let ttsWarmed = false;

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
  generationConfig?: Record<string, unknown>,
  assistLoop?: AssistRemoteOptions
): Promise<AssistResponse> {
  return postSigned<AssistResponse>("assist", {
    system,
    messages,
    options,
    tools,
    ...(generationConfig ? { generation_config: generationConfig } : {}),
    ...(assistLoop?.max_inner_rounds != null
      ? { max_inner_rounds: assistLoop.max_inner_rounds }
      : {}),
    ...(assistLoop?.refine_after_route ? { refine_after_route: true } : {}),
  });
}

export async function transcribeAudio(
  audioBlob: Blob,
  options: TranscribeAudioOptions = {}
): Promise<{ transcript: string }> {
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
    ...(options.language ? { language: options.language } : {}),
    ...(options.captureMeta ? { captureMeta: options.captureMeta } : {}),
    ...(options.source != null ? { source: options.source } : {}),
    ...(options.utteranceSeq != null ? { utteranceSeq: options.utteranceSeq } : {}),
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

export async function warmTextToSpeech(): Promise<void> {
  await ensureAuthenticated();
  if (ttsWarmed) {
    return;
  }
  if (!ttsWarmPromise) {
    ttsWarmPromise = textToSpeech('Okay.')
      .then(() => {
        ttsWarmed = true;
      })
      .catch(() => {
        // ignore warmup failures; real playback can still retry normally
      })
      .finally(() => {
        ttsWarmPromise = null;
      });
  }
  await ttsWarmPromise;
}
