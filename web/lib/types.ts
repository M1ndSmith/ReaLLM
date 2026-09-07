export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ModelInfo = {
  id: string;
  provider: string;
};

export type PromptListItem = {
  name: string;
  source: string;
};

export type HealthResponse = {
  status: string;
  providers: string[];
  reliability: {
    retries: number;
    cache: boolean;
    cache_ttl: number | null;
    redis: boolean;
    fallback_policy: string | null;
    fallbacks: string[];
    routing_strategy: string;
  } | null;
  budget: {
    daily_tokens: number;
    daily_token_limit: number | null;
    daily_usd: number;
    daily_usd_limit: number | null;
    max_output_tokens: number;
    ledger: string;
  } | null;
  memory: { enabled: boolean } | null;
  pii: { enabled: boolean } | null;
  guard: { enabled: boolean; injection?: boolean; content?: boolean } | null;
};

export type ConfigLayers = {
  memory: boolean;
  pii: boolean;
  guard: boolean;
  guard_injection: boolean;
  guard_content: boolean;
};

export type ConfigResponse = {
  auth_required: boolean;
  layers: ConfigLayers;
  restart_for: string[];
};
