import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { GoogleGenAI, Type } from "@google/genai";
import jwt from "jsonwebtoken";

const REGION = process.env.AWS_REGION || "us-east-2";
const GEMINI_SECRET_ID = process.env.GEMINI_SECRET_ID || "prod/Oasis/gemini";
const SUPABASE_SECRET_ID = process.env.SUPABASE_SECRET_ID;
const MODEL = process.env.MODEL || "gemini-2.5-flash";
const TEMP = Number(process.env.TEMP ?? 0.3);
const ENV_FALLBACK = process.env.GEMINI_API_KEY || "";

const sm = new SecretsManagerClient({ region: REGION });
let cachedSecrets = {};

async function getSecret(secretId) {
  if (cachedSecrets[secretId]) {
    return cachedSecrets[secretId];
  }
  if (!secretId) {
    throw new Error("Secret ID is not configured.");
  }

  const command = new GetSecretValueCommand({
    SecretId: secretId,
    VersionStage: "AWSCURRENT",
  });
  const response = await sm.send(command);
  let secretString = response.SecretString;
  if (!secretString && response.SecretBinary) {
    secretString = Buffer.from(response.SecretBinary, "base64").toString("utf8");
  }

  cachedSecrets[secretId] = secretString;
  return secretString;
}

function safeParseJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function findKey(obj) {
  const candidates = [
    "gemini_key",
    "GEMINI_API_KEY",
    "api_key",
    "API_KEY",
    "apiKey",
    "key",
    "token",
  ];
  for (const k of candidates) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }

  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (cur && typeof cur === "object") {
      for (const v of Object.values(cur)) {
        if (typeof v === "string" && v.trim().length >= 20) {
          return v.trim();
        }
        if (v && typeof v === "object") {
          stack.push(v);
        }
      }
    }
  }
  return "";
}

function extractKeyFromAny(raw) {
  if (!raw) return "";
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return "";
    if (s.startsWith("{")) {
      const obj = safeParseJSON(s);
      if (obj) return findKey(obj);
    }
    return s;
  }
  if (typeof raw === "object") {
    return findKey(raw);
  }
  return "";
}

async function getGeminiClient() {
  if (ENV_FALLBACK) {
    return new GoogleGenAI({ apiKey: ENV_FALLBACK });
  }

  const rawSecret = await getSecret(GEMINI_SECRET_ID);
  const key = extractKeyFromAny(rawSecret);
  if (!key) {
    throw new Error("Gemini key missing in secret");
  }
  return new GoogleGenAI({ apiKey: key });
}

async function getSupabaseJwtSecret() {
  const rawSecret = await getSecret(SUPABASE_SECRET_ID);
  const secretObj = safeParseJSON(rawSecret);
  if (secretObj && secretObj.SUPABASE_JWT_SECRET) {
    return secretObj.SUPABASE_JWT_SECRET;
  }
  throw new Error("SUPABASE_JWT_SECRET not found in secret value.");
}

function normalizeRole(role) {
  return /^(human|user)$/i.test(String(role || "")) ? "user" : "model";
}

function toContents(messages = []) {
  return messages.map((m) => ({
    role: normalizeRole(m?.role),
    parts: [{ text: typeof m?.content === "string" ? m.content : String(m?.content ?? "") }],
  }));
}

function extractResponseText(response) {
  if (!response) return "";
  if (typeof response.text === "string") {
    return response.text;
  }
  if (typeof response.text === "function") {
    return response.text();
  }

  const parts = response?.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find((p) => typeof p?.text === "string");
  return textPart?.text || "";
}

function extractFirstFunctionCall(response) {
  if (!response) return null;

  if (Array.isArray(response.functionCalls) && response.functionCalls.length > 0) {
    return response.functionCalls[0];
  }

  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part?.functionCall) {
      return part.functionCall;
    }
  }
  return null;
}

/** Max inner model↔tool rounds (invalid-route retries + optional refine). */
function clampAssistInnerRounds(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.min(8, Math.max(1, Math.floor(n)));
}

/** @typedef {{ input_tokens: number; output_tokens: number; total_tokens: number }} UsageTriple */

/** @param {unknown} response */
function extractTokenTripleFromGenAiResponse(response) {
  const u = response?.usageMetadata ?? response?.usage_metadata;
  if (!u || typeof u !== "object") {
    return { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  }
  const input = Number(u.promptTokenCount ?? u.prompt_token_count ?? 0);
  const output = Number(u.candidatesTokenCount ?? u.candidates_token_count ?? 0);
  const totalRaw = Number(u.totalTokenCount ?? u.total_token_count ?? NaN);
  const total = Number.isFinite(totalRaw) ? totalRaw : input + output;
  return {
    input_tokens: Number.isFinite(input) ? input : 0,
    output_tokens: Number.isFinite(output) ? output : 0,
    total_tokens: Number.isFinite(total) ? total : 0,
  };
}

/** @param {UsageTriple} a @param {UsageTriple} b */
function addUsageTriple(a, b) {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
  };
}

/** Gemini REST / client-style snake_case for subscription + UI. */
function usageMetadataSnakeFromTriple(agg) {
  return {
    prompt_token_count: agg.input_tokens,
    candidates_token_count: agg.output_tokens,
    total_token_count: agg.total_tokens,
  };
}

/** @param {Record<string, unknown>} body @param {UsageTriple} agg */
function withAssistUsageMetadata(body, agg) {
  if (
    agg.input_tokens === 0 &&
    agg.output_tokens === 0 &&
    agg.total_tokens === 0
  ) {
    return body;
  }
  return { ...body, usage_metadata: usageMetadataSnakeFromTriple(agg) };
}

function appendModelFunctionCallTurn(contents, functionCall) {
  const fc = {
    name: functionCall.name,
    args: functionCall.args || {},
  };
  if (functionCall.id != null && functionCall.id !== "") {
    fc.id = functionCall.id;
  }
  contents.push({
    role: "model",
    parts: [{ functionCall: fc }],
  });
}

function appendFunctionResponseTurn(contents, functionCall, resultPayload) {
  const part = {
    name: functionCall.name,
    response: { result: resultPayload },
  };
  if (functionCall.id != null && functionCall.id !== "") {
    part.id = functionCall.id;
  }
  contents.push({
    role: "user",
    parts: [{ functionResponse: part }],
  });
}

/**
 * Claude-style routing loop: repeated generateContent until a final route,
 * chat text, or max rounds. Tool "results" are synthetic (browser does not
 * execute inside Lambda); invalid route_command gets an error functionResponse.
 */
async function runAssistRoutingLoop({
  ai,
  messages,
  routeOptions,
  canChat,
  enableFunctionCalling,
  maxInnerRounds,
  refineAfterRoute,
  config,
}) {
  const contents = toContents(messages);
  let lastValidRoute = null;
  let roundCount = 0;
  /** @type {UsageTriple} */
  let usageAgg = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

  for (let i = 0; i < maxInnerRounds; i++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      config,
      contents,
    });
    usageAgg = addUsageTriple(usageAgg, extractTokenTripleFromGenAiResponse(response));
    roundCount += 1;

    if (enableFunctionCalling) {
      const fc = extractFirstFunctionCall(response);
      if (fc?.name === "route_command") {
        const callArgs = safeJsonObject(fc.args);
        const next = String(callArgs.next || "").trim();
        const args = safeJsonObject(callArgs.args);

        if (routeOptions.includes(next)) {
          lastValidRoute = { next, args };
          const canRefineMore = refineAfterRoute && i + 1 < maxInnerRounds;
          if (!canRefineMore) {
            return cors(
              200,
              withAssistUsageMetadata(
                {
                  next,
                  args,
                  reason: "native-tool-call",
                  inner_rounds: roundCount,
                },
                usageAgg
              )
            );
          }
          appendModelFunctionCallTurn(contents, fc);
          appendFunctionResponseTurn(contents, fc, {
            ok: true,
            routedCommand: next,
            message:
              "Route accepted by host. Call route_command again only if correcting the choice; otherwise respond with the single word DONE.",
          });
          continue;
        }

        if (i + 1 < maxInnerRounds) {
          appendModelFunctionCallTurn(contents, fc);
          appendFunctionResponseTurn(contents, fc, {
            ok: false,
            error: "invalid_command",
            validCommands: routeOptions,
          });
          continue;
        }
      }
    }

    const text = String(extractResponseText(response) || "").trim();

    if (lastValidRoute) {
      return cors(
        200,
        withAssistUsageMetadata(
          {
            next: lastValidRoute.next,
            args: lastValidRoute.args,
            ...(text && text.toUpperCase() !== "DONE" ? { content: text } : {}),
            reason: "multi-turn-route",
            inner_rounds: roundCount,
          },
          usageAgg
        )
      );
    }

    if (canChat) {
      return cors(
        200,
        withAssistUsageMetadata(
          {
            next: "chat",
            content: text,
            reason: "no-tool-call",
            inner_rounds: roundCount,
          },
          usageAgg
        )
      );
    }

    return cors(
      200,
      withAssistUsageMetadata(
        {
          next: routeOptions[0],
          args: {},
          reason: "no-tool-call-fallback",
          inner_rounds: roundCount,
        },
        usageAgg
      )
    );
  }

  if (lastValidRoute) {
    return cors(
      200,
      withAssistUsageMetadata(
        {
          next: lastValidRoute.next,
          args: lastValidRoute.args,
          reason: "multi-turn-max-rounds",
          inner_rounds: roundCount,
        },
        usageAgg
      )
    );
  }

  return cors(
    200,
    withAssistUsageMetadata(
      {
        next: routeOptions[0],
        args: {},
        reason: "no-tool-call-fallback",
        inner_rounds: roundCount,
      },
      usageAgg
    )
  );
}

function safeJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function sanitizeOptions(options) {
  const out = [];
  const seen = new Set();
  for (const opt of options || []) {
    const next = String(opt || "").trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function normalizeToolName(name) {
  const normalized = String(name || "").trim();
  if (!normalized) return "";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    return "";
  }
  return normalized;
}

function sanitizeTools(tools, allowedOptions) {
  const optionSet = new Set(allowedOptions);
  const seen = new Set();
  const out = [];

  for (const tool of tools || []) {
    const name = normalizeToolName(tool?.name);
    if (!name || seen.has(name) || !optionSet.has(name)) {
      continue;
    }
    seen.add(name);
    const description = String(tool?.description || "").trim();
    out.push({ name, description });
  }

  return out;
}

function cors(code, body) {
  return {
    statusCode: code,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function buildAssistSystemPrompt({ system, routeOptions, tools, canChat }) {
  const toolLines = (tools || [])
    .map((tool) => {
      const name = String(tool?.name || "").trim();
      if (!name) return "";
      const description = String(tool?.description || "").trim();
      return description ? `- ${name}: ${description}` : `- ${name}`;
    })
    .filter(Boolean)
    .join("\n");

  if (routeOptions.length === 0) {
    return [
      system || "",
      "Respond with plain text only.",
      "Do not emit JSON or function-call placeholders.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const optionLine = `Valid command names: ${routeOptions.join(", ")}`;
  const chatLine = canChat
    ? "If no tool should be called, respond in plain text so the caller can route to chat."
    : "Always choose one of the valid command names.";

  return [
    system || "",
    "\nYou are a strict browser command router.",
    optionLine,
    toolLines ? `Available tools:\n${toolLines}` : "",
    "If the latest user message is a browser action, call route_command with the best command and args.",
    "If it is not a browser action or is unclear, do not call a function.",
    chatLine,
    "Do not invent command names.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function handleAssist(req) {
  const {
    system,
    messages = [],
    options = [],
    tools = [],
    max_inner_rounds: maxInnerRaw,
    refine_after_route: refineRaw,
  } = req || {};
  const validOptions = sanitizeOptions(options);
  const canChat = validOptions.includes("chat");
  const routeOptions = validOptions.filter((opt) => opt !== "chat");
  const declaredTools = sanitizeTools(Array.isArray(tools) ? tools : [], routeOptions);
  const enableFunctionCalling = routeOptions.length > 0 && declaredTools.length > 0;

  if (validOptions.length === 0) {
    return cors(400, { error: "assist requires non-empty options" });
  }

  const maxInnerRounds = clampAssistInnerRounds(
    maxInnerRaw ?? process.env.ASSIST_MAX_INNER_ROUNDS ?? 1
  );
  const refineAfterRoute = Boolean(refineRaw);

  const ai = await getGeminiClient();
  const systemInstruction = buildAssistSystemPrompt({
    system,
    routeOptions,
    tools: declaredTools,
    canChat,
  });

  const config = {
    systemInstruction,
    temperature: TEMP,
  };

  if (enableFunctionCalling) {
    config.tools = [
      {
        functionDeclarations: [
          {
            name: "route_command",
            description: "Select one browser command and provide its JSON args.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                next: {
                  type: Type.STRING,
                  enum: routeOptions,
                  description: "Command name selected from the valid options list.",
                },
                args: {
                  type: Type.OBJECT,
                  description: "Arguments object for the selected command.",
                },
              },
              required: ["next"],
            },
          },
        ],
      },
    ];
    config.toolConfig = {
      functionCallingConfig: {
        mode: "AUTO",
      },
    };

    return runAssistRoutingLoop({
      ai,
      messages,
      routeOptions,
      canChat,
      enableFunctionCalling,
      maxInnerRounds,
      refineAfterRoute,
      config,
    });
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    config,
    contents: toContents(messages),
  });

  const usageAgg = extractTokenTripleFromGenAiResponse(response);
  const content = String(extractResponseText(response) || "").trim();
  if (canChat) {
    return cors(
      200,
      withAssistUsageMetadata(
        {
          next: "chat",
          content,
          reason: "no-tool-call",
          inner_rounds: 1,
        },
        usageAgg
      )
    );
  }

  return cors(
    200,
    withAssistUsageMetadata(
      {
        next: routeOptions[0],
        args: {},
        reason: "no-tool-call-fallback",
        inner_rounds: 1,
      },
      usageAgg
    )
  );
}

function getMethod(event) {
  return event?.requestContext?.http?.method || "POST";
}

function parseBody(event) {
  const body = event?.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString()
      : event.body
    : "{}";
  return safeParseJSON(body) || {};
}

function authHeaderFromEvent(event) {
  return event?.headers?.authorization || event?.headers?.Authorization;
}

export const handler = async (event) => {
  if (getMethod(event) === "OPTIONS") {
    return cors(204, "");
  }

  try {
    const authHeader = authHeaderFromEvent(event);
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return cors(401, {
        error: "Unauthorized: Missing or invalid Authorization header",
      });
    }

    const token = authHeader.substring(7);
    const supabaseSecret = await getSupabaseJwtSecret();
    jwt.verify(token, supabaseSecret);

    const req = parseBody(event);
    const op = String(req?.op || "").toLowerCase();
    if (op === "assist") {
      return handleAssist(req);
    }

    return cors(404, {
      error: "Not Found",
      hint: "POST with {op:\"assist\"}",
    });
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return cors(401, { error: `Unauthorized: ${error.message}` });
    }
    console.error("Handler error:", error);
    return cors(500, {
      error: "Internal Server Error",
      message: String(error?.message || error),
    });
  }
};
