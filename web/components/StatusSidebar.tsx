"use client";

import { Badge, Card, DataRow, Stat } from "@/components/ui";
import { dominantSpendDriver, formatCost, formatUsdc, groupedFeatureSpend } from "@/lib/formatters";
import type { BillingStatusResponse, BillingUsageItem } from "@/lib/types";

type Lamp = { key: string; label: string; on: boolean };

type Props = {
  providers: string[] | undefined;
  lamps: Lamp[];
  redisMode?: string | null;
  usage?: BillingUsageItem[] | null;
  usageLoading?: boolean;
  onRefresh?: () => void;
};

export function StatusSidebar({ providers, lamps, redisMode, usage, usageLoading, onRefresh }: Props) {
  return (
    <Card title="Runtime" subtitle={redisMode ? `Redis mode: ${redisMode}` : "Providers and sidecars"}>
      <div className="stack">
        <div>
          <div className="label">Providers</div>
          <div className="lamps" aria-live="polite">
            {providers?.length ? (
              providers.map((name) => (
                <span key={name} className="lamp on">
                  <i aria-hidden="true" />
                  {name}
                </span>
              ))
            ) : (
              <p className="hint">No API keys found in .env.</p>
            )}
          </div>
        </div>
        {lamps.length ? (
          <div>
            <div className="label">Sidecars</div>
            <div className="lamps">
              {lamps.map((lamp) => (
                <span key={lamp.key} className={lamp.on ? "lamp on" : "lamp"} aria-label={`${lamp.label} ${lamp.on ? "on" : "off"}`}>
                  <i aria-hidden="true" />
                  {lamp.label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {onRefresh ? (
          <div>
            <div className="section-head">
              <h3 className="card-title">Recent usage</h3>
              <button className="outline" type="button" onClick={onRefresh} disabled={usageLoading}>
                {usageLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            {usage?.length ? (
              <ul className="usage-list">
                {usage.slice(0, 5).map((item) => (
                  <li key={`${item.idempotency_key}-${item.timestamp}`}>
                    <div>
                      <strong>{item.route}</strong>
                      <p className="hint">{item.model}</p>
                    </div>
                    <span className="money">{formatCost(item.total_usd) || "$0"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">No captured usage rows yet.</p>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function BillingPanel({
  billing,
  billingLoading,
  canReconcile,
  onReconcile,
}: {
  billing?: BillingStatusResponse | null;
  billingLoading?: boolean;
  canReconcile?: boolean;
  onReconcile?: () => void;
}) {
  const grouped = groupedFeatureSpend(billing?.line_item_totals);
  const driver = dominantSpendDriver(billing?.line_item_totals);
  const sidecar = grouped.security + grouped.memory + grouped.pii;
  const capRemaining =
    billing?.team_daily_cap_usd != null && billing?.team_daily_spent_usd != null
      ? Math.max(0, billing.team_daily_cap_usd - billing.team_daily_spent_usd)
      : null;

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Stat label="Prepaid balance" value={formatUsdc(billing?.prepaid_balance_usdc) || "n/a"} />
        <Stat label="Today burn" value={formatCost(billing?.team_daily_spent_usd) || "$0"} />
        <Stat label="Model spend" value={formatCost(grouped.model) || "$0"} />
        <Stat label="Sidecar spend" value={formatCost(sidecar) || "$0"} />
      </div>
      <Card
        title="Billing"
        subtitle={billing ? `${String(billing.mode).toUpperCase()} mode` : "Prepaid and feature spend"}
        actions={
          onReconcile ? (
            <button className="outline" type="button" onClick={onReconcile} disabled={!canReconcile || billingLoading}>
              {billingLoading ? "Refreshing…" : "Reconcile billing"}
            </button>
          ) : null
        }
      >
        {billing ? (
          <div className="billing-meta">
            <DataRow label="Prepaid required" value={billing.prepaid_required ? "yes" : "no"} />
            <DataRow label="Team" value={billing.team_id || "-"} />
            {billing.wallet_address ? (
              <DataRow label="Deposit address" value={<span className="wallet-address">{billing.wallet_address}</span>} />
            ) : null}
            {billing.faucet_url ? (
              <a className="faucet-link" href={billing.faucet_url} target="_blank" rel="noreferrer">
                Fund on Circle faucet (opens in a new tab)
              </a>
            ) : null}
            <DataRow label="Daily cap remaining" value={capRemaining == null ? "-" : formatCost(capRemaining) || "$0"} />
            <DataRow label="Top cost driver" value={driver ? `${driver.kind} (${formatCost(driver.usd) || "$0"})` : "none"} />
            {capRemaining != null && capRemaining <= 0 ? <Badge>cap reached</Badge> : null}
          </div>
        ) : (
          <p className="hint">Billing status unavailable yet. Refresh catalog or check gateway auth.</p>
        )}
      </Card>
    </div>
  );
}
