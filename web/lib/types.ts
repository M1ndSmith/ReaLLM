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
    redis_mode?: string | null;
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
  identity?: {
    id: string;
    scopes: string[];
    label?: string | null;
    created_at?: string | null;
    revoked_at?: string | null;
    last_used_at?: string | null;
    quotas?: {
      daily_token_budget?: number | null;
      daily_usd_budget?: number | null;
      rpm?: number | null;
    } | null;
  } | null;
  layers: ConfigLayers;
  restart_for: string[];
};

export type ReadyResponse = {
  ready: boolean;
  checks?: Record<string, boolean>;
  redis_mode?: string | null;
};

export type IdentityQuotas = {
  daily_token_budget?: number | null;
  daily_usd_budget?: number | null;
  rpm?: number | null;
};

export type IdentityPublic = {
  id: string;
  scopes: string[];
  label?: string | null;
  created_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  quotas?: IdentityQuotas | null;
};

export type GatewayKeyCreated = {
  key: IdentityPublic;
  secret: string;
};
