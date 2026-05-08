import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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
  /** Client may send snake_case (see assistant proxy). */
  max_inner_rounds?: unknown;
  refine_after_route?: unknown;
  generation_config?: unknown;
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

function createAnonClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured");
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  });
}

function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
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

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function getAuthenticatedUser(req: Request): Promise<{ id: string } | null> {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }
  const supabase = createAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    throw new Error(`auth_get_user_failed: ${error.message}`);
  }
  return data.user ?? null;
}

function extractUsageMetadata(responseJson: JsonRecord): JsonRecord | null {
  const usage = responseJson.usageMetadata ?? responseJson.usage_metadata;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return null;
  }
  const usageRecord = usage as JsonRecord;
  const promptTokenCount = usageRecord.promptTokenCount ?? usageRecord.prompt_token_count;
  const candidatesTokenCount =
    usageRecord.candidatesTokenCount ?? usageRecord.candidates_token_count;
  const totalTokenCount = usageRecord.totalTokenCount ?? usageRecord.total_token_count;
  const thoughtsTokenCount = usageRecord.thoughtsTokenCount ?? usageRecord.thoughts_token_count;
  const normalized: JsonRecord = {};
  if (typeof promptTokenCount === "number") {
    normalized.prompt_token_count = promptTokenCount;
  }
  if (typeof candidatesTokenCount === "number") {
    normalized.candidates_token_count = candidatesTokenCount;
  }
  if (typeof totalTokenCount === "number") {
    normalized.total_token_count = totalTokenCount;
  }
  if (typeof thoughtsTokenCount === "number") {
    normalized.thoughts_token_count = thoughtsTokenCount;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

function extractTokenUsage(responseJson: JsonRecord): TokenUsage {
  const usageMetadata = extractUsageMetadata(responseJson);
  const inputTokens = Number(usageMetadata?.prompt_token_count ?? 0);
  const outputTokens = Number(usageMetadata?.candidates_token_count ?? 0);
  const totalTokensRaw = Number(usageMetadata?.total_token_count ?? NaN);
  const totalTokens = Number.isFinite(totalTokensRaw)
    ? totalTokensRaw
    : inputTokens + outputTokens;
  return {
    input_tokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    output_tokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
  };
}

type UsageStats = {
  total_tokens: number;
  limit: number;
  remaining: number;
  usage_date: string;
  is_limit_reached: boolean;
};

const FREE_DAILY_TOKEN_LIMIT = 10_000;
const BASIC_DAILY_TOKEN_LIMIT = 200_000;

function fallbackLimitFromPlan(params: {
  stripeSubscriptionId?: unknown;
}): number {
  const stripeSubscriptionId = String(params.stripeSubscriptionId || "").trim();
  return stripeSubscriptionId ? BASIC_DAILY_TOKEN_LIMIT : FREE_DAILY_TOKEN_LIMIT;
}

async function resolveDailyTokenLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("user_plans")
    .select(`
      stripe_subscription_id,
      is_active,
      plans ( daily_token_limit )
    `)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`resolve_daily_token_limit_failed: ${error.message}`);
  }

  const planRecord =
    data && typeof data === "object" && "plans" in data && data.plans && typeof data.plans === "object"
      ? (data.plans as JsonRecord)
      : null;
  const dbLimit = Number(planRecord?.daily_token_limit ?? 0);
  if (Number.isFinite(dbLimit) && dbLimit > 0) {
    return dbLimit;
  }

  return fallbackLimitFromPlan({
    stripeSubscriptionId:
      data && typeof data === "object" && "stripe_subscription_id" in data
        ? (data as JsonRecord).stripe_subscription_id
        : null,
  });
}

function getUtcUsageDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function getTodayUsageTotal(
  supabase: SupabaseClient,
  userId: string,
  usageDate: string
): Promise<number> {
  const { data, error } = await supabase
    .from("llm_daily_usage")
    .select("total_tokens")
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    .maybeSingle();

  if (error) {
    throw new Error(`get_today_usage_total_failed: ${error.message}`);
  }

  const totalTokens = Number(data?.total_tokens ?? 0);
  return Number.isFinite(totalTokens) ? totalTokens : 0;
}

function buildUsageStats(totalTokens: number, limit: number, usageDate: string): UsageStats {
  const safeTotal = Math.max(0, totalTokens);
  const safeLimit = Math.max(0, limit);
  return {
    total_tokens: safeTotal,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - safeTotal),
    usage_date: usageDate,
    is_limit_reached: safeLimit > 0 ? safeTotal >= safeLimit : false,
  };
}

async function recordUsage(
  supabase: SupabaseClient,
  params: {
    userId: string;
    modelUsed: string;
    tokenUsage: TokenUsage;
    commandType?: unknown;
    userIntent?: unknown;
    success: boolean;
  }
): Promise<void> {
  const { error } = await supabase.rpc("record_llm_usage", {
    p_user_id: params.userId,
    p_model_used: params.modelUsed,
    p_input_tokens: params.tokenUsage.input_tokens,
    p_output_tokens: params.tokenUsage.output_tokens,
    p_success: params.success,
    p_command_type:
      typeof params.commandType === "string" && params.commandType.trim()
        ? params.commandType.trim()
        : null,
    p_user_intent:
      typeof params.userIntent === "string" && params.userIntent.trim()
        ? params.userIntent.trim()
        : null,
  });

  if (error) {
    throw new Error(`record_llm_usage_failed: ${error.message}`);
  }
}

function clampAssistInnerRounds(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.min(8, Math.max(1, Math.floor(n)));
}

function appendModelFunctionCallTurn(
  contents: JsonRecord[],
  functionCall: JsonRecord
): void {
  const fc: JsonRecord = {
    name: functionCall.name,
    args: functionCall.args && typeof functionCall.args === "object"
      ? functionCall.args
      : parseFunctionArgs(functionCall.args),
  };
  if (functionCall.id != null && String(functionCall.id) !== "") {
    fc.id = functionCall.id;
  }
  contents.push({
    role: "model",
    parts: [{ functionCall: fc }],
  });
}

function appendFunctionResponseTurn(
  contents: JsonRecord[],
  functionCall: JsonRecord,
  resultPayload: JsonRecord
): void {
  const part: JsonRecord = {
    name: String(functionCall.name || ""),
    response: { result: resultPayload },
  };
  if (functionCall.id != null && String(functionCall.id) !== "") {
    part.id = functionCall.id;
  }
  contents.push({
    role: "user",
    parts: [{ functionResponse: part }],
  });
}

function mergeClientGenerationConfig(
  base: JsonRecord,
  req: AssistRequest
): void {
  const extra = asObject(req.generation_config);
  if (Object.keys(extra).length === 0) {
    return;
  }
  const gen = asObject(base.generationConfig);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) {
      gen[key] = value;
    }
  }
  base.generationConfig = gen;
}

type RoutingLoopSuccess = {
  ok: true;
  body: JsonRecord;
  tokenUsage: TokenUsage;
  usageMetadata: JsonRecord | null;
  lastGeminiJson: JsonRecord;
};

type RoutingLoopFail = { ok: false; message: string };

type RoutingLoopResult = RoutingLoopSuccess | RoutingLoopFail;

/**
 * Multi-turn route_command loop (matches Lambda native-assist): synthetic
 * functionResponse turns until final route or chat text.
 */
async function runAssistRoutingLoop(params: {
  geminiBase: JsonRecord;
  contents: JsonRecord[];
  routeOptions: string[];
  canChat: boolean;
  enableFunctionCalling: boolean;
  maxInnerRounds: number;
  refineAfterRoute: boolean;
}): Promise<RoutingLoopResult> {
  const {
    geminiBase,
    contents,
    routeOptions,
    canChat,
    enableFunctionCalling,
    maxInnerRounds,
    refineAfterRoute,
  } = params;

  let lastValidRoute: { next: string; args: JsonRecord } | null = null;
  let roundCount = 0;
  let agg: TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  let lastMeta: JsonRecord | null = null;
  let lastGeminiJson: JsonRecord = {};

  const absorbUsage = (geminiJson: JsonRecord) => {
    agg = addTokenUsage(agg, extractTokenUsage(geminiJson));
    lastMeta = extractUsageMetadata(geminiJson) ?? lastMeta;
    lastGeminiJson = geminiJson;
  };

  const success = (body: JsonRecord): RoutingLoopSuccess => ({
    ok: true,
    body,
    tokenUsage: agg,
    usageMetadata: lastMeta,
    lastGeminiJson,
  });

  for (let i = 0; i < maxInnerRounds; i++) {
    const requestBody: JsonRecord = { ...geminiBase, contents: [...contents] };
    let geminiJson: JsonRecord;
    try {
      geminiJson = await callGemini(requestBody);
    } catch (error) {
      return { ok: false, message: String(error) };
    }
    absorbUsage(geminiJson);
    roundCount += 1;

    if (enableFunctionCalling) {
      const fc = extractFunctionCall(geminiJson);
      if (fc && String(fc.name || "") === "route_command") {
        const callArgs = parseFunctionArgs(fc.args);
        const next = String(callArgs.next || "").trim();
        const args = asObject(callArgs.args);
        if (routeOptions.includes(next)) {
          lastValidRoute = { next, args };
          const canRefineMore = refineAfterRoute && i + 1 < maxInnerRounds;
          if (!canRefineMore) {
            return success({
              next,
              args,
              reason: "native-tool-call",
              inner_rounds: roundCount,
            });
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

    const text = extractResponseText(geminiJson);

    if (lastValidRoute) {
      const payload: JsonRecord = {
        next: lastValidRoute.next,
        args: lastValidRoute.args,
        reason: "multi-turn-route",
        inner_rounds: roundCount,
      };
      if (text && text.toUpperCase() !== "DONE") {
        payload.content = text;
      }
      return success(payload);
    }

    if (canChat) {
      return success({
        next: "chat",
        content: text,
        reason: "no-tool-call",
        inner_rounds: roundCount,
      });
    }

    return success({
      next: routeOptions[0],
      args: {},
      reason: "no-tool-call-fallback",
      inner_rounds: roundCount,
    });
  }

  if (lastValidRoute) {
    return success({
      next: lastValidRoute.next,
      args: lastValidRoute.args,
      reason: "multi-turn-max-rounds",
      inner_rounds: roundCount,
    });
  }

  return success({
    next: routeOptions[0],
    args: {},
    reason: "no-tool-call-fallback",
    inner_rounds: roundCount,
  });
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

async function handleAssist(req: Request, payload: AssistRequest): Promise<Response> {
  let authenticatedUser: { id: string } | null = null;
  try {
    authenticatedUser = await getAuthenticatedUser(req);
  } catch (error) {
    console.warn("[oasis-assist] invalid auth", String(error));
    return jsonResponse(401, {
      error: "invalid_auth",
      message: String(error),
    });
  }

  const db = authenticatedUser ? createServiceClient() : null;
  const usageDate = getUtcUsageDateString();
  let dailyTokenLimit: number | null = null;
  let currentUsageStats: UsageStats | null = null;

  if (db && authenticatedUser) {
    try {
      dailyTokenLimit = await resolveDailyTokenLimit(db, authenticatedUser.id);
      const todayTotal = await getTodayUsageTotal(db, authenticatedUser.id, usageDate);
      currentUsageStats = buildUsageStats(todayTotal, dailyTokenLimit, usageDate);
      console.log("[oasis-assist] usage lookup", {
        userId: authenticatedUser.id,
        usageDate,
        currentTotalTokens: currentUsageStats.total_tokens,
        dailyTokenLimit,
      });
      if (currentUsageStats.is_limit_reached) {
        return jsonResponse(429, {
          error: "daily_token_limit_reached",
          message: "Daily token limit reached. Resets at midnight UTC.",
          usage_stats: currentUsageStats,
        });
      }
    } catch (error) {
      console.error("[oasis-assist] usage lookup failed", String(error));
      return jsonResponse(500, {
        error: "usage_lookup_failed",
        message: String(error),
      });
    }
  } else {
    console.log("[oasis-assist] anonymous assist request");
  }

  const validOptions = sanitizeOptions(Array.isArray(payload.options) ? payload.options : []);
  const canChat = validOptions.includes("chat");
  const routeOptions = validOptions.filter(option => option !== "chat");
  const declaredTools = sanitizeTools(
    Array.isArray(payload.tools) ? payload.tools : [],
    routeOptions
  );
  const enableFunctionCalling = routeOptions.length > 0 && declaredTools.length > 0;

  if (validOptions.length === 0) {
    return jsonResponse(400, { error: "assist requires non-empty options" });
  }

  const tempRaw = Number(Deno.env.get("TEMP") ?? "0.3");
  const temperature = Number.isFinite(tempRaw) ? tempRaw : 0.3;

  const maxInnerRounds = clampAssistInnerRounds(
    payload.max_inner_rounds ?? Deno.env.get("ASSIST_MAX_INNER_ROUNDS") ?? 1
  );
  const refineAfterRoute = Boolean(payload.refine_after_route);

  const geminiBase: JsonRecord = {
    system_instruction: {
      parts: [
        {
          text: buildAssistSystemPrompt({
            system: String(payload.system || ""),
            routeOptions,
            tools: declaredTools,
            canChat,
          }),
        },
      ],
    },
    generationConfig: {
      temperature,
    },
  };

  mergeClientGenerationConfig(geminiBase, payload);

  if (enableFunctionCalling) {
    geminiBase.tools = [
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
    geminiBase.toolConfig = {
      functionCallingConfig: { mode: "AUTO" },
    };

    const contents = toContents(Array.isArray(payload.messages) ? payload.messages : []);
    const outcome = await runAssistRoutingLoop({
      geminiBase,
      contents,
      routeOptions,
      canChat,
      enableFunctionCalling,
      maxInnerRounds,
      refineAfterRoute,
    });

    if (!outcome.ok) {
      return jsonResponse(502, {
        error: "gemini_request_failed",
        message: outcome.message,
      });
    }

    return await finishAssistResponse({
      db,
      authenticatedUser,
      dailyTokenLimit,
      currentUsageStats,
      usageDate,
      body: outcome.body,
      tokenUsage: outcome.tokenUsage,
      usageMetadata: outcome.usageMetadata,
      lastGeminiJson: outcome.lastGeminiJson,
    });
  }

  const geminiRequest: JsonRecord = {
    ...geminiBase,
    contents: toContents(Array.isArray(payload.messages) ? payload.messages : []),
  };

  let geminiJson: JsonRecord;
  try {
    geminiJson = await callGemini(geminiRequest);
  } catch (error) {
    return jsonResponse(502, {
      error: "gemini_request_failed",
      message: String(error),
    });
  }

  const tokenUsage = extractTokenUsage(geminiJson);
  const usageMetadata = extractUsageMetadata(geminiJson);
  const content = extractResponseText(geminiJson);

  const body: JsonRecord = canChat
    ? {
      next: "chat",
      content,
      reason: "no-tool-call",
      inner_rounds: 1,
    }
    : {
      next: routeOptions[0],
      args: {},
      reason: "no-tool-call-fallback",
      inner_rounds: 1,
    };

  return await finishAssistResponse({
    db,
    authenticatedUser,
    dailyTokenLimit,
    currentUsageStats,
    usageDate,
    body,
    tokenUsage,
    usageMetadata,
    lastGeminiJson: geminiJson,
  });
}

async function finishAssistResponse(params: {
  db: SupabaseClient | null;
  authenticatedUser: { id: string } | null;
  dailyTokenLimit: number | null;
  currentUsageStats: UsageStats | null;
  usageDate: string;
  body: JsonRecord;
  tokenUsage: TokenUsage;
  usageMetadata: JsonRecord | null;
  lastGeminiJson: JsonRecord;
}): Promise<Response> {
  const {
    db,
    authenticatedUser,
    dailyTokenLimit,
    currentUsageStats,
    usageDate,
    body,
    tokenUsage,
    usageMetadata,
    lastGeminiJson,
  } = params;

  let finalUsageStats = currentUsageStats;

  if (db && authenticatedUser && tokenUsage.total_tokens > 0) {
    const responseContent = extractResponseText(lastGeminiJson);
    let responseCommandType: unknown = null;
    let responseUserIntent: unknown = null;
    const parsedResponse = safeParseJSON(responseContent);
    if (parsedResponse) {
      responseCommandType = parsedResponse.command_type;
      responseUserIntent = parsedResponse.user_intent;
    }

    try {
      await recordUsage(db, {
        userId: authenticatedUser.id,
        modelUsed: Deno.env.get("MODEL") || "gemini-2.5-flash",
        tokenUsage,
        commandType: responseCommandType,
        userIntent: responseUserIntent,
        success: true,
      });
      console.log("[oasis-assist] usage recorded", {
        userId: authenticatedUser.id,
        usageDate,
        recordedTokens: tokenUsage.total_tokens,
      });
      if (dailyTokenLimit != null) {
        finalUsageStats = buildUsageStats(
          (currentUsageStats?.total_tokens ?? 0) + tokenUsage.total_tokens,
          dailyTokenLimit,
          usageDate
        );
      }
    } catch (error) {
      console.error("[oasis-assist] usage record failed", String(error));
      return jsonResponse(500, {
        error: "usage_record_failed",
        message: String(error),
      });
    }
  }

  const out: JsonRecord = {
    ...body,
    ...(usageMetadata ? { usage_metadata: usageMetadata } : {}),
    ...(finalUsageStats ? { usage_stats: finalUsageStats } : {}),
  };

  return jsonResponse(200, out);
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

  return handleAssist(req, payload);
});
