"use client";

import { useCallback, useMemo, useState } from "react";

import { fetchBillingStatus, fetchBillingUsage, patchTeamBillingPolicy, reconcileBilling } from "@/lib/billing";
import type { BillingStatusResponse, BillingUsagePage, TeamBillingPolicy } from "@/lib/types";

export type BillingState = {
  status: BillingStatusResponse | null;
  usage: BillingUsagePage | null;
  loading: boolean;
  error: string | null;
  blockedHint: string | null;
  refresh: () => Promise<void>;
  patchTeam: (teamId: string, patch: TeamBillingPolicy) => Promise<TeamBillingPolicy>;
  reconcile: () => Promise<{ ok: boolean; mode: string; detail: string }>;
};

export function useBillingState(): BillingState {
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [usage, setUsage] = useState<BillingUsagePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextUsage] = await Promise.all([fetchBillingStatus(), fetchBillingUsage({ limit: 25 })]);
      setStatus(nextStatus);
      setUsage(nextUsage);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing status.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const patchTeam = useCallback(async (teamId: string, patch: TeamBillingPolicy) => {
    const next = await patchTeamBillingPolicy(teamId, patch);
    await refresh();
    return next;
  }, [refresh]);

  const reconcile = useCallback(async () => {
    const result = await reconcileBilling();
    await refresh();
    return result;
  }, [refresh]);

  const blockedHint = useMemo(() => {
    if (!status) return null;
    if (!status.prepaid_required) return null;
    const balance = status.prepaid_balance_usdc ?? 0;
    if (balance <= 0) return "Prepaid balance is empty. Top up USDC before paid model calls.";
    if (status.team_daily_cap_usd != null && status.team_daily_spent_usd != null) {
      const remaining = status.team_daily_cap_usd - status.team_daily_spent_usd;
      if (remaining <= 0) return "Team daily USD cap reached. Raise cap or wait for daily reset.";
    }
    return null;
  }, [status]);

  return { status, usage, loading, error, blockedHint, refresh, patchTeam, reconcile };
}
