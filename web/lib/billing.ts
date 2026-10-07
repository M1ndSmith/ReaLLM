import { fetchJson } from "@/lib/gateway";
import type { BillingStatusResponse, BillingUsagePage, TeamBillingPolicy } from "@/lib/types";

export async function fetchBillingStatus(): Promise<BillingStatusResponse> {
  return fetchJson<BillingStatusResponse>("/billing/status");
}

export async function fetchBillingUsage(params?: { offset?: number; limit?: number }): Promise<BillingUsagePage> {
  const offset = Math.max(0, params?.offset ?? 0);
  const limit = Math.min(500, Math.max(1, params?.limit ?? 25));
  return fetchJson<BillingUsagePage>(`/billing/usage?offset=${offset}&limit=${limit}`);
}

export async function patchTeamBillingPolicy(teamId: string, patch: TeamBillingPolicy): Promise<TeamBillingPolicy> {
  return fetchJson<TeamBillingPolicy>(`/billing/teams/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function reconcileBilling(): Promise<{ ok: boolean; mode: string; detail: string }> {
  return fetchJson<{ ok: boolean; mode: string; detail: string }>("/billing/reconcile", { method: "POST" });
}
