export type AiProvider = "openai" | "anthropic" | "lovable";
export type AiProviderSetting = AiProvider | "auto";
export type AiTier = "fast" | "balanced" | "deep";
export type AiMode = "private" | "public" | "cv_first";
export type AiValidationStatus = "not_validated" | "passed" | "warning" | "failed" | "provider_error";

export type AiMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "file"; file: { filename?: string; file_data: string } }
    >;

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: AiMessageContent;
}

export interface AiTool {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

export interface AiToolChoice {
  name: string;
}

export interface AiJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface AiToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  provider: AiProvider;
  model: string;
}

export interface AiResult {
  text?: string;
  json?: unknown;
  toolCalls: AiToolCall[];
  usage: AiUsage;
  provider: AiProvider;
  model: string;
  runId?: string;
}

export interface AiRunOptions {
  feature: string;
  tier?: AiTier;
  mode?: AiMode;
  promptVersion?: string;
  userId?: string | null;
  system?: string;
  user?: AiMessageContent;
  messages?: AiMessage[];
  tools?: AiTool[];
  toolChoice?: AiToolChoice;
  responseSchema?: AiJsonSchema;
  maxOutputTokens?: number;
  temperature?: number;
  validationStatus?: AiValidationStatus;
  env?: Pick<Record<string, string | undefined>, string>;
  fetcher?: typeof fetch;
  supabase?: any;
}
