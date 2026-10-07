import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBillingState } from "@/hooks/useBillingState";
import { fetchBillingStatus, fetchBillingUsage, patchTeamBillingPolicy, reconcileBilling } from "@/lib/billing";

vi.mock("@/lib/billing", () => ({
  fetchBillingStatus: vi.fn(),
  fetchBillingUsage: vi.fn(),
  patchTeamBillingPolicy: vi.fn(),
  reconcileBilling: vi.fn(),
}));

const mockedStatus = vi.mocked(fetchBillingStatus);
const mockedUsage = vi.mocked(fetchBillingUsage);
const mockedPatch = vi.mocked(patchTeamBillingPolicy);
const mockedReconcile = vi.mocked(reconcileBilling);

describe("useBillingState", () => {
  beforeEach(() => {
    mockedStatus.mockReset();
    mockedUsage.mockReset();
    mockedPatch.mockReset();
    mockedReconcile.mockReset();
  });

  it("loads status and usage on refresh", async () => {
    mockedStatus.mockResolvedValueOnce({
      mode: "hybrid",
      prepaid_required: true,
      ledger: "file",
      team_id: "team-a",
      prepaid_balance_usdc: 2,
      team_daily_spent_usd: 1,
      team_daily_cap_usd: 4,
      line_item_totals: { inference_model_call: 1 },
    });
    mockedUsage.mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 25 });
    const { result } = renderHook(() => useBillingState());
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status?.mode).toBe("hybrid");
    expect(result.current.usage?.total).toBe(0);
    expect(result.current.blockedHint).toBeNull();
  });

  it("surfaces blocked hints", async () => {
    mockedStatus.mockResolvedValueOnce({
      mode: "wallet",
      prepaid_required: true,
      ledger: "file",
      team_id: "team-a",
      prepaid_balance_usdc: 0,
      team_daily_spent_usd: 4,
      team_daily_cap_usd: 4,
      line_item_totals: {},
    });
    mockedUsage.mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 25 });
    const { result } = renderHook(() => useBillingState());
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.blockedHint).toMatch(/prepaid balance is empty/i);
  });

  it("patches and reconciles then refreshes", async () => {
    mockedStatus.mockResolvedValue({
      mode: "hybrid",
      prepaid_required: false,
      ledger: "file",
      team_id: "team-a",
      prepaid_balance_usdc: 10,
      team_daily_spent_usd: 1,
      team_daily_cap_usd: 4,
      line_item_totals: {},
    });
    mockedUsage.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 25 });
    mockedPatch.mockResolvedValueOnce({ team_id: "team-a", daily_usd_cap: 8, prepaid_balance_usdc: 10 });
    mockedReconcile.mockResolvedValueOnce({ ok: true, mode: "ledger", detail: "ok" });
    const { result } = renderHook(() => useBillingState());
    await act(async () => {
      await result.current.patchTeam("team-a", { team_id: "team-a", daily_usd_cap: 8 });
      await result.current.reconcile();
    });
    expect(mockedPatch).toHaveBeenCalledWith("team-a", { team_id: "team-a", daily_usd_cap: 8 });
    expect(mockedReconcile).toHaveBeenCalled();
  });
});
