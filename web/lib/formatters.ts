export function formatTokens(usage: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null) {
  if (!usage) return "";
  const total =
    usage.total_tokens != null ? usage.total_tokens : (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  if (!total) return "";
  return `${total} tok`;
}

export function formatCost(value: unknown) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "$0";
  return `$${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export function budgetText(
  health: { budget?: { daily_tokens: number; daily_token_limit: number | null } | null } | null,
): string {
  const b = health?.budget;
  if (!b) return "budget —";
  if (b.daily_token_limit != null) return `${b.daily_tokens} / ${b.daily_token_limit} tok`;
  return `${b.daily_tokens} tok`;
}
