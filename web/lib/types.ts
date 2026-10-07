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
    max_input_tokens?: number | null;
    max_output_tokens: number;
    ledger: string;
    line_item_totals?: Record<string, number>;
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
      team_id?: string | null;
      team_daily_usd_cap?: number | null;
      prepaid_required?: boolean | null;
      max_per_call_usd?: number | null;
    } | null;
  } | null;
  layers: ConfigLayers;
  restart_for: string[];
  billing?: BillingModeInfo | null;
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
  team_id?: string | null;
  team_daily_usd_cap?: number | null;
  prepaid_required?: boolean | null;
  max_per_call_usd?: number | null;
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

export type BillingModeInfo = {
  mode: "off" | "shadow" | "hybrid" | "wallet" | string;
  cache_billable: boolean;
  unpriced_model_policy: string;
};

export type BillingLineItem = {
  kind: string;
  usd: number;
  units?: number;
};

export type BillingStatusResponse = {
  mode: "off" | "shadow" | "hybrid" | "wallet" | string;
  prepaid_required: boolean;
  ledger: string;
  team_id?: string | null;
  prepaid_balance_usdc?: number | null;
  team_daily_spent_usd?: number | null;
  team_daily_cap_usd?: number | null;
  line_item_totals: Record<string, number>;
  wallet_address?: string | null;
  chain_id?: number | null;
  faucet_url?: string | null;
};

export type BillingUsageItem = {
  timestamp: string;
  idempotency_key: string;
  identity_id?: string | null;
  team_id?: string | null;
  hold_id?: string | null;
  model: string;
  route: string;
  total_usd: number;
  status: string;
  reason?: string | null;
  items: BillingLineItem[];
};

export type BillingUsagePage = {
  items: BillingUsageItem[];
  total: number;
  offset: number;
  limit: number;
};

export type TeamBillingPolicy = {
  team_id: string;
  daily_usd_cap?: number | null;
  prepaid_balance_usdc?: number | null;
  prepaid_required?: boolean | null;
};
