// Enhanced AWS Lambda Function URL handler for transcription (Deepgram first, Gemini fallback)
// Runtime: nodejs20.x
// Env: GEMINI_API_KEY (required), DEEPGRAM_API_KEY (optional)

import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not defined; requests will fail with 500.");
}

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }) : null;

// Cost calculation constants
const COST_RATES = {
  deepgram: {
    perMinute: 0.0043,    // $0.0043 per minute
  },
  gemini: {
    perCharacter: 0.00025  // $0.00025 per 1000 characters
  }
};

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "POST,OPTIONS",
  };
}

// Audio duration estimation (rough approximation)
function estimateAudioDuration(audioBuffer, mimeType) {
  // Rough estimate: ~16KB per second for compressed audio
  const bytesPerSecond = 16000;
  const durationSeconds = audioBuffer.length / bytesPerSecond;
  return Math.max(0.1, Math.min(durationSeconds, 300)); // Clamp between 0.1s and 5min
}

// ---- Enhanced Deepgram helper ----
async function transcribeWithDeepgram(base64, mimeType, { language = "en-US" } = {}) {
  if (!process.env.DEEPGRAM_API_KEY) throw new Error("no_deepgram_key");
  const audioBuf = Buffer.from(base64, "base64");

  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-2");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  if (language) url.searchParams.set("language", language);

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": mimeType || "audio/wav",
    },
    body: audioBuf,
  });
  if (!r.ok) throw new Error(`deepgram_${r.status}`);
  const j = await r.json();
  const transcript = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim?.() || "";

  // Calculate usage metadata
  const duration = j?.metadata?.duration || estimateAudioDuration(audioBuf, mimeType);
  const cost = (duration / 60) * COST_RATES.deepgram.perMinute;

  return {
    transcript,
    provider: "deepgram",
    duration,
    cost: Math.round(cost * 100000) / 100000, // Round to 5 decimal places
    usage_metadata: {
      input_tokens: null,  // Deepgram doesn't use token-based pricing
      output_tokens: null,
      audio_duration_seconds: duration,
      audio_cost: Math.round(cost * 100000) / 100000
    }
  };
}

// ---- Enhanced Gemini helper ----
async function transcribeWithGemini(base64, mimeType) {
  if (!model) throw new Error("no_gemini_model");

  const audioBuf = Buffer.from(base64, "base64");
  const result = await model.generateContent([
    { text: "Transcribe the following audio to plain text. Return only the transcript." },
    { inlineData: { mimeType, data: base64 } },
  ]);

  const transcript = (result?.response?.text?.() || "").trim();

  // Calculate usage metadata
  const duration = estimateAudioDuration(audioBuf, mimeType);
  const transcriptLength = transcript.length;
  const cost = (transcriptLength / 1000) * COST_RATES.gemini.perCharacter;

  // Rough token estimation
  const estimatedInputTokens = Math.ceil(audioBuf.length / 4);
  const estimatedOutputTokens = Math.ceil(transcriptLength / 4);

  return {
    transcript,
    provider: "gemini",
    duration,
    cost: Math.round(cost * 100000) / 100000,
    usage_metadata: {
      input_tokens: estimatedInputTokens,
      output_tokens: estimatedOutputTokens,
      audio_duration_seconds: duration,
      audio_cost: Math.round(cost * 100000) / 100000
    }
  };
}

export const handler = async (event) => {
  if (event?.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : (event.body || {});
    const op = body.op;

    if (op === "transcribe") {
      const { audio, mimeType, language } = body;
      if (!audio || !mimeType) {
        return resp(400, { error: "missing_audio", detail: "Provide base64 audio as 'audio' and a 'mimeType'." });
      }
      const force = (process.env.TRANSCRIBE_PROVIDER || "").toLowerCase();

      // Inner helper to call Gemini when needed
      const tryGemini = async () => {
        try {
          const result = await transcribeWithGemini(audio, mimeType);
          return resp(200, result);
        } catch (e) {
          return resp(500, {
            error: "gemini_transcription_failed",
            detail: String(e?.message || e)
          });
        }
      };

      // Force Gemini path if requested
      if (force === "gemini") {
        return await tryGemini();
      }

      // Deepgram first
      try {
        const result = await transcribeWithDeepgram(audio, mimeType, { language });
        if (result.transcript) return resp(200, result);
      } catch (e) {
        console.warn("Deepgram failed, falling back to Gemini:", e.message);
        // fall through to Gemini
      }

      // Fallback to Gemini
      return await tryGemini();
    }

    if (op === "route") {
      if (!model) return resp(500, { error: "no_gemini_key" });
      const { system, messages, options } = body || {};
      if (!Array.isArray(options) || options.length === 0) {
        return resp(400, { error: "missing_options" });
      }

      // Build a strict instruction to output ONLY JSON {"next":"<one-of-options>"}
      const instruction = [
        String(system || "You are a router."),
        "\n\nPick the best matching NEXT action from the provided options.",
        `Options: [${options.join(", ")}]`,
        "Return ONLY compact JSON on a single line with this exact shape:",
        '{"next":"<one-of-options>"}',
        "If no option fits, choose the best available or leave it empty like:",
        '{"next":""}',
      ].join("\n");

      // Flatten conversation into plain text lines for the model
      const convo = Array.isArray(messages) ? messages : [];
      const convoText = convo
        .map((m) => {
          const role = (m && (m.role === "user" || m.role === "model")) ? m.role : "user";
          const content = (m && typeof m.content === "string") ? m.content : String(m?.content ?? "");
          return `${role}: ${content}`;
        })
        .join("\n");

      const prompt = [instruction, convoText].filter(Boolean).join("\n\n");

      try {
        const result = await model.generateContent([{ text: prompt }]);
        const raw = (result?.response?.text?.() || "").trim();

        // Try to extract a JSON object {"next": ...}
        let parsed = null;
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch {}
        } else {
          try { parsed = JSON.parse(raw); } catch {}
        }

        let next = typeof parsed?.next === "string" ? parsed.next : "";
        // Only accept if in options
        if (!options.includes(next)) next = "";
        const bodyOut = next ? { next } : {};
        return resp(200, bodyOut);
      } catch (e) {
        return resp(500, { error: "gemini_route_failed", detail: String(e?.message || e) });
      }
    }

    if (op === "chat") {
      return resp(404, { error: "not_found", hint: "Deploy the routing/chat Lambda for this op" });
    }

    return resp(404, { error: "not_found", hint: "POST with {op:'transcribe'}" });
  } catch (e) {
    console.error("handler failed", e);
    return resp(500, { error: String(e?.message || e) });
  }
};

function resp(statusCode, json) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(json) };
}
