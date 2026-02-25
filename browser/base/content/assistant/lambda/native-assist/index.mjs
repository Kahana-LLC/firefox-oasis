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
  const { system, messages = [], options = [], tools = [] } = req || {};
  const validOptions = sanitizeOptions(options);
  const canChat = validOptions.includes("chat");
  const routeOptions = validOptions.filter((opt) => opt !== "chat");
  const declaredTools = sanitizeTools(Array.isArray(tools) ? tools : [], routeOptions);
  const enableFunctionCalling = routeOptions.length > 0 && declaredTools.length > 0;

  if (validOptions.length === 0) {
    return cors(400, { error: "assist requires non-empty options" });
  }

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
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    config,
    contents: toContents(messages),
  });

  if (enableFunctionCalling) {
    const functionCall = extractFirstFunctionCall(response);
    if (functionCall?.name === "route_command") {
      const callArgs = safeJsonObject(functionCall.args);
      const next = String(callArgs.next || "").trim();
      const args = safeJsonObject(callArgs.args);

      if (routeOptions.includes(next)) {
        return cors(200, {
          next,
          args,
          reason: "native-tool-call",
        });
      }
    }
  }

  const content = String(extractResponseText(response) || "").trim();
  if (canChat) {
    return cors(200, {
      next: "chat",
      content,
      reason: "no-tool-call",
    });
  }

  return cors(200, {
    next: routeOptions[0],
    args: {},
    reason: "no-tool-call-fallback",
  });
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
