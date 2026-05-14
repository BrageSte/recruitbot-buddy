import type {
  AiJsonSchema,
  AiMessage,
  AiMessageContent,
  AiProvider,
  AiProviderSetting,
  AiResult,
  AiRunOptions,
  AiTier,
  AiTool,
  AiToolCall,
  AiValidationStatus,
} from "./ai-types.ts";

declare const Deno:
  | {
      env?: { get: (name: string) => string | undefined };
    }
  | undefined;

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const LOVABLE_CHAT_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const DEFAULT_MODELS: Record<AiProvider, Record<AiTier, string>> = {
  openai: {
    fast: "gpt-5.4-mini",
    balanced: "gpt-5.4",
    deep: "gpt-5.5",
  },
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    balanced: "claude-sonnet-4-6",
    deep: "claude-opus-4-7",
  },
  lovable: {
    fast: "google/gemini-3-flash-preview",
    balanced: "google/gemini-3-flash-preview",
    deep: "google/gemini-3-flash-preview",
  },
};

const FEATURE_DEFAULT_PROVIDER: Record<string, AiProvider> = {
  generate_application: "anthropic",
  edit_application: "anthropic",
  tailor_cv: "openai",
  edit_tailored_cv: "openai",
  import_cv: "openai",
  parse_job: "openai",
  full_match: "openai",
  summarize_job: "openai",
  source_enrich: "openai",
  source_suggestions: "openai",
};

export async function runAi(options: AiRunOptions): Promise<AiResult> {
  const started = Date.now();
  const env = options.env ?? readEnv();
  const fetcher = options.fetcher ?? fetch;
  const provider = selectProvider(options.feature, env);
  const tier = options.tier ?? "balanced";
  const model = modelFor(provider, tier, env);
  const requestHash = await hashRequest(options);

  try {
    const result =
      provider === "openai"
        ? await callOpenAi(options, model, env, fetcher)
        : provider === "anthropic"
          ? await callAnthropic(options, model, env, fetcher)
          : await callLovable(options, model, env, fetcher);

    const runId = await logAiRun(options, {
      provider,
      model,
      usage: result.usage,
      latencyMs: Date.now() - started,
      requestHash,
      validationStatus: options.validationStatus ?? "not_validated",
    });

    return { ...result, provider, model, runId };
  } catch (error) {
    await logAiRun(options, {
      provider,
      model,
      usage: { input: 0, output: 0 },
      latencyMs: Date.now() - started,
      requestHash,
      validationStatus: "provider_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function recordAiValidation(
  supabase: AiRunOptions["supabase"] | undefined,
  runId: string | undefined,
  status: AiValidationStatus,
  error?: string,
) {
  if (!supabase || !runId) return;
  try {
    await (supabase as any)
      .from("ai_runs")
      .update({ validation_status: status, error: error ?? null })
      .eq("id", runId);
  } catch (updateError) {
    console.error("ai_runs validation update failed", updateError);
  }
}

export function selectProvider(feature: string, env: Record<string, string | undefined>): AiProvider {
  const normalizedFeature = normalizeFeature(feature);
  const override = envValue(env, `AI_PROVIDER__${normalizedFeature.toUpperCase()}`) as AiProviderSetting | undefined;
  const setting = override ?? (envValue(env, "AI_PROVIDER") as AiProviderSetting | undefined) ?? "auto";
  const preferred = setting === "auto" ? FEATURE_DEFAULT_PROVIDER[normalizedFeature] : setting;

  if (preferred && hasKeyForProvider(preferred, env)) return preferred;
  if (hasKeyForProvider("openai", env)) return "openai";
  if (hasKeyForProvider("anthropic", env)) return "anthropic";
  if (hasKeyForProvider("lovable", env)) return "lovable";

  throw new Error("Ingen AI-provider er konfigurert. Sett OPENAI_API_KEY, ANTHROPIC_API_KEY eller LOVABLE_API_KEY.");
}

export function modelFor(provider: AiProvider, tier: AiTier, env: Record<string, string | undefined>) {
  const envKey = `AI_MODEL_${tier.toUpperCase()}`;
  return envValue(env, envKey) || DEFAULT_MODELS[provider][tier];
}

function readEnv(): Record<string, string | undefined> {
  const denoEnv = globalThisHasDeno() ? Deno?.env : undefined;
  return {
    AI_PROVIDER: denoEnv?.get("AI_PROVIDER"),
    AI_PROVIDER__GENERATE_APPLICATION: denoEnv?.get("AI_PROVIDER__GENERATE_APPLICATION"),
    AI_PROVIDER__EDIT_APPLICATION: denoEnv?.get("AI_PROVIDER__EDIT_APPLICATION"),
    AI_PROVIDER__TAILOR_CV: denoEnv?.get("AI_PROVIDER__TAILOR_CV"),
    AI_PROVIDER__EDIT_TAILORED_CV: denoEnv?.get("AI_PROVIDER__EDIT_TAILORED_CV"),
    AI_PROVIDER__IMPORT_CV: denoEnv?.get("AI_PROVIDER__IMPORT_CV"),
    AI_PROVIDER__PARSE_JOB: denoEnv?.get("AI_PROVIDER__PARSE_JOB"),
    AI_PROVIDER__FULL_MATCH: denoEnv?.get("AI_PROVIDER__FULL_MATCH"),
    AI_MODEL_FAST: denoEnv?.get("AI_MODEL_FAST"),
    AI_MODEL_BALANCED: denoEnv?.get("AI_MODEL_BALANCED"),
    AI_MODEL_DEEP: denoEnv?.get("AI_MODEL_DEEP"),
    OPENAI_API_KEY: denoEnv?.get("OPENAI_API_KEY"),
    ANTHROPIC_API_KEY: denoEnv?.get("ANTHROPIC_API_KEY"),
    LOVABLE_API_KEY: denoEnv?.get("LOVABLE_API_KEY"),
  };
}

function globalThisHasDeno() {
  return typeof Deno !== "undefined" && Boolean(Deno?.env?.get);
}

function normalizeFeature(feature: string) {
  return feature.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function hasKeyForProvider(provider: AiProvider, env: Record<string, string | undefined>) {
  if (provider === "openai") return Boolean(envValue(env, "OPENAI_API_KEY"));
  if (provider === "anthropic") return Boolean(envValue(env, "ANTHROPIC_API_KEY"));
  return Boolean(envValue(env, "LOVABLE_API_KEY"));
}

function envValue(env: Record<string, string | undefined>, key: string) {
  return env[key] ?? (globalThisHasDeno() ? Deno?.env?.get(key) : undefined);
}

function buildMessages(options: AiRunOptions): AiMessage[] {
  if (options.messages?.length) return options.messages;
  const messages: AiMessage[] = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  if (options.user) messages.push({ role: "user", content: options.user });
  return messages;
}

async function callOpenAi(
  options: AiRunOptions,
  model: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<AiResult> {
  const apiKey = envValue(env, "OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY mangler");

  const messages = buildMessages(options);
  const body: Record<string, unknown> = {
    model,
    input: messages.map((message) => ({
      role: message.role === "system" ? "developer" : message.role,
      content: toOpenAiContent(message.content),
    })),
    max_output_tokens: options.maxOutputTokens ?? 1500,
    store: false,
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.responseSchema) {
    body.text = {
      format: {
        type: "json_schema",
        name: options.responseSchema.name,
        schema: options.responseSchema.schema,
        strict: options.responseSchema.strict ?? true,
      },
    };
  }
  if (options.tools?.length) {
    body.tools = options.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: tool.strict ?? true,
    }));
  }
  if (options.toolChoice) body.tool_choice = { type: "function", name: options.toolChoice.name };

  const response = await fetcher(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwIfProviderError(response, "OpenAI");
  const data = await response.json();
  const text = extractOpenAiText(data);
  const toolCalls = extractOpenAiToolCalls(data);
  return {
    text,
    json: parseJsonMaybe(text),
    toolCalls,
    usage: {
      input: Number(data?.usage?.input_tokens ?? 0),
      output: Number(data?.usage?.output_tokens ?? 0),
      cacheRead: Number(data?.usage?.input_tokens_details?.cached_tokens ?? 0),
      provider: "openai",
      model,
    },
    provider: "openai",
    model,
  };
}

async function callAnthropic(
  options: AiRunOptions,
  model: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<AiResult> {
  const apiKey = envValue(env, "ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY mangler");

  const messages = buildMessages(options);
  const system = messages.find((message) => message.role === "system")?.content;
  const nonSystem = messages.filter((message) => message.role !== "system");
  const tools = options.responseSchema
    ? [
        {
          name: options.responseSchema.name,
          description: "Returner strukturert JSON som matcher schema.",
          parameters: options.responseSchema.schema,
          strict: options.responseSchema.strict ?? true,
        },
      ]
    : options.tools;
  const toolChoice = options.responseSchema
    ? { name: options.responseSchema.name }
    : options.toolChoice;

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxOutputTokens ?? 1500,
    system: typeof system === "string" ? system : undefined,
    messages: nonSystem.map((message) => ({ role: message.role, content: toAnthropicContent(message.content) })),
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (tools?.length) {
    body.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
      strict: tool.strict ?? true,
    }));
  }
  if (toolChoice) body.tool_choice = { type: "tool", name: toolChoice.name };

  const response = await fetcher(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  await throwIfProviderError(response, "Anthropic");
  const data = await response.json();
  const text = extractAnthropicText(data);
  const toolCalls = extractAnthropicToolCalls(data);
  return {
    text,
    json: parseJsonMaybe(text),
    toolCalls,
    usage: {
      input: Number(data?.usage?.input_tokens ?? 0),
      output: Number(data?.usage?.output_tokens ?? 0),
      cacheRead: Number(data?.usage?.cache_read_input_tokens ?? 0),
      cacheWrite: Number(data?.usage?.cache_creation_input_tokens ?? 0),
      provider: "anthropic",
      model,
    },
    provider: "anthropic",
    model,
  };
}

async function callLovable(
  options: AiRunOptions,
  model: string,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch,
): Promise<AiResult> {
  const apiKey = envValue(env, "LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

  const messages = buildMessages(options);
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((message) => ({ role: message.role, content: message.content })),
    max_tokens: options.maxOutputTokens,
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.responseSchema) body.response_format = { type: "json_object" };
  if (options.tools?.length) {
    body.tools = options.tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }
  if (options.toolChoice) body.tool_choice = { type: "function", function: { name: options.toolChoice.name } };

  const response = await fetcher(LOVABLE_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await throwIfProviderError(response, "Lovable AI Gateway");
  const data = await response.json();
  const message = data?.choices?.[0]?.message ?? {};
  const text = typeof message.content === "string" ? message.content : "";
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map((call: any) => ({
        id: call.id,
        name: String(call.function?.name ?? ""),
        arguments: safeParseObject(call.function?.arguments),
      })).filter((call: AiToolCall) => call.name)
    : [];
  return {
    text,
    json: parseJsonMaybe(text),
    toolCalls,
    usage: {
      input: Number(data?.usage?.prompt_tokens ?? 0),
      output: Number(data?.usage?.completion_tokens ?? 0),
      provider: "lovable",
      model,
    },
    provider: "lovable",
    model,
  };
}

function toOpenAiContent(content: AiMessageContent) {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "input_text", text: part.text };
    return {
      type: "input_file",
      filename: part.file.filename ?? "file",
      file_data: part.file.file_data,
    };
  });
}

function toAnthropicContent(content: AiMessageContent) {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: contentTypeFromDataUrl(part.file.file_data) ?? "application/pdf",
        data: part.file.file_data.replace(/^data:[^;]+;base64,/, ""),
      },
    };
  });
}

function contentTypeFromDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1];
}

function extractOpenAiText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  const texts: string[] = [];
  for (const item of data?.output ?? []) {
    if (item?.type === "message") {
      for (const content of item.content ?? []) {
        if (typeof content?.text === "string") texts.push(content.text);
      }
    }
  }
  return texts.join("\n").trim();
}

function extractOpenAiToolCalls(data: any): AiToolCall[] {
  const calls: AiToolCall[] = [];
  for (const item of data?.output ?? []) {
    if (item?.type === "function_call") {
      calls.push({
        id: item.call_id ?? item.id,
        name: String(item.name ?? ""),
        arguments: safeParseObject(item.arguments),
      });
    }
  }
  return calls.filter((call) => call.name);
}

function extractAnthropicText(data: any): string {
  return (data?.content ?? [])
    .filter((block: any) => block?.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text)
    .join("\n")
    .trim();
}

function extractAnthropicToolCalls(data: any): AiToolCall[] {
  return (data?.content ?? [])
    .filter((block: any) => block?.type === "tool_use")
    .map((block: any) => ({
      id: block.id,
      name: String(block.name ?? ""),
      arguments: isRecord(block.input) ? block.input : {},
    }))
    .filter((call: AiToolCall) => call.name);
}

async function throwIfProviderError(response: Response, providerName: string) {
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  if (response.status === 429) throw new Error(`${providerName}: rate limit nådd`);
  if (response.status === 402) throw new Error(`${providerName}: kreditt eller billing kreves`);
  throw new Error(`${providerName}: ${response.status} ${body.slice(0, 500)}`);
}

function parseJsonMaybe(text: string | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

function safeParseObject(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function hashRequest(options: AiRunOptions) {
  const payload = JSON.stringify({
    feature: options.feature,
    promptVersion: options.promptVersion,
    mode: options.mode,
    system: typeof options.system === "string" ? options.system : "",
    user: options.user,
    messages: options.messages,
  });
  const data = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function logAiRun(
  options: AiRunOptions,
  data: {
    provider: AiProvider;
    model: string;
    usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
    latencyMs: number;
    requestHash: string;
    validationStatus: AiValidationStatus;
    error?: string;
  },
) {
  if (!options.supabase) return undefined;
  try {
    const insertable = {
      user_id: options.userId ?? null,
      feature: options.feature,
      provider: data.provider,
      model: data.model,
      mode: options.mode ?? "private",
      prompt_version: options.promptVersion ?? "unknown",
      input_tokens: data.usage.input,
      output_tokens: data.usage.output,
      cache_read_tokens: data.usage.cacheRead ?? 0,
      cache_write_tokens: data.usage.cacheWrite ?? 0,
      latency_ms: data.latencyMs,
      validation_status: data.validationStatus,
      request_hash: data.requestHash,
      error: data.error ?? null,
    };
    const query = (options.supabase as any).from("ai_runs").insert(insertable).select("id").maybeSingle();
    const { data: row } = await query;
    return row?.id as string | undefined;
  } catch (error) {
    console.error("ai_runs logging failed", error);
    return undefined;
  }
}
