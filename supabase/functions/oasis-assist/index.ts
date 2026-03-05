type WireMessage = {
  role?: string;
  content?: unknown;
};

type AssistTool = {
  name?: string;
  description?: string;
};

type AssistRequest = {
  op?: string;
  system?: string;
  messages?: WireMessage[];
  options?: unknown[];
  tools?: AssistTool[];
};

type JsonRecord = Record<string, unknown>;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: CORS_HEADERS,
  });
}

function safeParseJSON(value: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as JsonRecord;
  } catch {
    return null;
  }
}

function toContents(messages: WireMessage[] = []): JsonRecord[] {
  return messages.map(message => {
    const role =
      /^(human|user)$/i.test(String(message?.role || "")) ? "user" : "model";
    const text =
      typeof message?.content === "string"
        ? message.content
        : String(message?.content ?? "");
    return {
      role,
      parts: [{ text }],
    };
  });
}

function sanitizeOptions(options: unknown[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const next = String(option || "").trim();
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    out.push(next);
  }
  return out;
}

function normalizeToolName(name: string | undefined): string {
  const normalized = String(name || "").trim();
  if (!normalized) {
    return "";
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    return "";
  }
  return normalized;
}

function sanitizeTools(tools: AssistTool[], routeOptions: string[]): AssistTool[] {
  const optionSet = new Set(routeOptions);
  const seen = new Set<string>();
  const out: AssistTool[] = [];
  for (const tool of tools || []) {
    const name = normalizeToolName(tool?.name);
    if (!name || seen.has(name) || !optionSet.has(name)) {
      continue;
    }
    seen.add(name);
    out.push({
      name,
      description: String(tool?.description || "").trim(),
    });
  }
  return out;
}

function buildAssistSystemPrompt(args: {
  system: string;
  routeOptions: string[];
  tools: AssistTool[];
  canChat: boolean;
}): string {
  const { system, routeOptions, tools, canChat } = args;
  const toolLines = tools
    .map(tool => {
      const name = String(tool?.name || "").trim();
      if (!name) {
        return "";
      }
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
    "You are a strict browser command router.",
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

function asObject(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

function extractResponseText(responseJson: JsonRecord): string {
  const candidates = Array.isArray(responseJson.candidates)
    ? responseJson.candidates
    : [];
  const first = asObject(candidates[0]);
  const content = asObject(first.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const textParts = parts
    .map(part => asObject(part).text)
    .filter((value): value is string => typeof value === "string");
  return textParts.join("").trim();
}

function extractFunctionCall(responseJson: JsonRecord): JsonRecord | null {
  const candidates = Array.isArray(responseJson.candidates)
    ? responseJson.candidates
    : [];
  const first = asObject(candidates[0]);
  const content = asObject(first.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  for (const part of parts) {
    const functionCall = asObject(part).functionCall;
    if (functionCall && typeof functionCall === "object" && !Array.isArray(functionCall)) {
      return functionCall as JsonRecord;
    }
  }
  return null;
}

function parseFunctionArgs(value: unknown): JsonRecord {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    return safeParseJSON(value) || {};
  }
  return asObject(value);
}

async function callGemini(requestBody: JsonRecord): Promise<JsonRecord> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("MODEL") || "gemini-2.5-flash";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const text = await response.text();
  const parsed = safeParseJSON(text) || {};
  if (!response.ok) {
    throw new Error(
      `Gemini ${response.status}: ${text.substring(0, 500)}`
    );
  }
  return parsed;
}

async function handleAssist(req: AssistRequest): Promise<Response> {
  const validOptions = sanitizeOptions(Array.isArray(req.options) ? req.options : []);
  const canChat = validOptions.includes("chat");
  const routeOptions = validOptions.filter(option => option !== "chat");
  const declaredTools = sanitizeTools(
    Array.isArray(req.tools) ? req.tools : [],
    routeOptions
  );
  const enableFunctionCalling = routeOptions.length > 0 && declaredTools.length > 0;

  if (validOptions.length === 0) {
    return jsonResponse(400, { error: "assist requires non-empty options" });
  }

  const tempRaw = Number(Deno.env.get("TEMP") ?? "0.3");
  const temperature = Number.isFinite(tempRaw) ? tempRaw : 0.3;

  const geminiRequest: JsonRecord = {
    system_instruction: {
      parts: [
        {
          text: buildAssistSystemPrompt({
            system: String(req.system || ""),
            routeOptions,
            tools: declaredTools,
            canChat,
          }),
        },
      ],
    },
    contents: toContents(Array.isArray(req.messages) ? req.messages : []),
    generationConfig: {
      temperature,
    },
  };

  if (enableFunctionCalling) {
    geminiRequest.tools = [
      {
        functionDeclarations: [
          {
            name: "route_command",
            description: "Select one browser command and provide its JSON args.",
            parameters: {
              type: "object",
              properties: {
                next: {
                  type: "string",
                  enum: routeOptions,
                  description: "Command name selected from the valid options list.",
                },
                args: {
                  type: "object",
                  description: "Arguments object for the selected command.",
                },
              },
              required: ["next"],
            },
          },
        ],
      },
    ];
    geminiRequest.toolConfig = {
      functionCallingConfig: { mode: "AUTO" },
    };
  }

  let geminiJson: JsonRecord;
  try {
    geminiJson = await callGemini(geminiRequest);
  } catch (error) {
    return jsonResponse(502, {
      error: "gemini_request_failed",
      message: String(error),
    });
  }

  if (enableFunctionCalling) {
    const functionCall = extractFunctionCall(geminiJson);
    if (functionCall && String(functionCall.name || "") === "route_command") {
      const callArgs = parseFunctionArgs(functionCall.args);
      const next = String(callArgs.next || "").trim();
      const args = asObject(callArgs.args);
      if (routeOptions.includes(next)) {
        return jsonResponse(200, {
          next,
          args,
          reason: "native-tool-call",
        });
      }
    }
  }

  const content = extractResponseText(geminiJson);
  if (canChat) {
    return jsonResponse(200, {
      next: "chat",
      content,
      reason: "no-tool-call",
    });
  }

  return jsonResponse(200, {
    next: routeOptions[0],
    args: {},
    reason: "no-tool-call-fallback",
  });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  let payload: AssistRequest;
  try {
    payload = (await req.json()) as AssistRequest;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const op = String(payload?.op || "").toLowerCase();
  if (op && op !== "assist") {
    return jsonResponse(404, {
      error: "not_found",
      hint: 'POST with {"op":"assist"}',
    });
  }

  return handleAssist(payload);
});
