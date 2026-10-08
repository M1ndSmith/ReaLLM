export function formatTokens(usage: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null) {
  if (!usage) return "";
  const total =
    usage.total_tokens != null ? usage.total_tokens : (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  if (!total) return "";
  return `${total} tok`;
}

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

const usdcFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

export function formatCost(value: unknown) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return usdFormat.format(n);
}

export function formatUsdc(value: unknown) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${usdcFormat.format(n)} USDC`;
}

export function dominantSpendDriver(lineItems: Record<string, number> | undefined): { kind: string; usd: number } | null {
  if (!lineItems) return null;
  let top: { kind: string; usd: number } | null = null;
  for (const [kind, raw] of Object.entries(lineItems)) {
    const usd = Number(raw);
    if (!Number.isFinite(usd) || usd <= 0) continue;
    if (!top || usd > top.usd) top = { kind, usd };
  }
  return top;
}

export function groupedFeatureSpend(lineItems: Record<string, number> | undefined): Record<"model" | "security" | "memory" | "pii", number> {
  const grouped = { model: 0, security: 0, memory: 0, pii: 0 };
  if (!lineItems) return grouped;
  for (const [kind, raw] of Object.entries(lineItems)) {
    const usd = Number(raw);
    if (!Number.isFinite(usd) || usd <= 0) continue;
    if (kind === "inference_model_call") grouped.model += usd;
    else if (kind.startsWith("security_")) grouped.security += usd;
    else if (kind.startsWith("memory_")) grouped.memory += usd;
    else if (kind.startsWith("pii_")) grouped.pii += usd;
  }
  return grouped;
}

export function budgetText(
  health: { budget?: { daily_tokens: number; daily_token_limit: number | null } | null } | null,
): string {
  const b = health?.budget;
  if (!b) return "budget —";
  if (b.daily_token_limit != null) return `${b.daily_tokens} / ${b.daily_token_limit} tok`;
  return `${b.daily_tokens} tok`;
}
