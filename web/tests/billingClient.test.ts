import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchBillingStatus, fetchBillingUsage, patchTeamBillingPolicy, reconcileBilling } from "@/lib/billing";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("billing client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches status, usage, policy patch, and reconcile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/billing/status")) {
          return json({ mode: "hybrid", prepaid_required: false, ledger: "file", line_item_totals: {} });
        }
        if (url.includes("/billing/usage?offset=0&limit=25")) {
          return json({ items: [], total: 0, offset: 0, limit: 25 });
        }
        if (url.endsWith("/billing/teams/team-a") && init?.method === "PATCH") {
          return json({ team_id: "team-a", daily_usd_cap: 5, prepaid_balance_usdc: 3 });
        }
        if (url.endsWith("/billing/reconcile") && init?.method === "POST") {
          return json({ ok: true, mode: "ledger", detail: "ok" });
        }
        return json({}, 404);
      }),
    );
    await expect(fetchBillingStatus()).resolves.toMatchObject({ mode: "hybrid" });
    await expect(fetchBillingUsage()).resolves.toMatchObject({ total: 0 });
    await expect(patchTeamBillingPolicy("team-a", { team_id: "team-a", daily_usd_cap: 5 })).resolves.toMatchObject({
      team_id: "team-a",
    });
    await expect(reconcileBilling()).resolves.toMatchObject({ ok: true });
  });
});
