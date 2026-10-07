"use client";

import { Badge, Card, DataRow, Stat } from "@/components/ui";
import { dominantSpendDriver, formatCost, formatUsdc, groupedFeatureSpend } from "@/lib/formatters";
import type { BillingStatusResponse } from "@/lib/types";

type Lamp = { key: string; label: string; on: boolean };

type Props = {
  providers: string[] | undefined;
  lamps: Lamp[];
  redisMode?: string | null;
  billing?: BillingStatusResponse | null;
};

export function StatusSidebar({ providers, lamps, redisMode, billing }: Props) {
  const grouped = groupedFeatureSpend(billing?.line_item_totals);
  const driver = dominantSpendDriver(billing?.line_item_totals);
  const capRemaining =
    billing?.team_daily_cap_usd != null && billing?.team_daily_spent_usd != null
      ? Math.max(0, billing.team_daily_cap_usd - billing.team_daily_spent_usd)
      : null;

  return (
    <div className="status-grid">
      <Card title="Providers" subtitle="Detected from configured API keys">
        <div className="lamps" aria-live="polite">
          {providers?.length ? (
            providers.map((name) => (
              <span key={name} className="lamp on">
                <i />
                {name}
              </span>
            ))
          ) : (
            <p className="hint">No API keys found in .env.</p>
          )}
        </div>
      </Card>

      <Card title="Runtime Sidecars" subtitle={redisMode ? `Redis mode: ${redisMode}` : "Layer state and reliability"}>
        <div className="lamps">
          {lamps.map((lamp) => (
            <span key={lamp.key} className={lamp.on ? "lamp on" : "lamp"}>
              <i />
              {lamp.label}
            </span>
          ))}
        </div>
        <p className="hint">
          Toggle MEMORY / PII / GUARD from Settings with a scoped key. Provider keys, Redis, and budgets stay in .env.
        </p>
      </Card>

      <Card title="Billing" subtitle="Prepaid and feature spend snapshot">
        {billing ? (
          <>
            <div className="stat-row">
              <Stat label="Mode" value={String(billing.mode).toUpperCase()} />
              <Stat label="Balance" value={formatUsdc(billing.prepaid_balance_usdc) || "n/a"} />
              <Stat label="Today Burn" value={formatCost(billing.team_daily_spent_usd) || "$0"} />
            </div>
            <div className="stat-row">
              <Stat label="Model" value={formatCost(grouped.model) || "$0"} />
              <Stat label="Security" value={formatCost(grouped.security) || "$0"} />
              <Stat label="Memory/PII" value={formatCost(grouped.memory + grouped.pii) || "$0"} />
            </div>
            <div className="billing-meta">
              <DataRow label="Prepaid required" value={billing.prepaid_required ? "yes" : "no"} />
              <DataRow label="Team" value={billing.team_id || "-"} />
              {billing.wallet_address ? (
                <DataRow
                  label="Deposit address"
                  value={<span className="wallet-address">{billing.wallet_address}</span>}
                />
              ) : null}
              {billing.faucet_url ? (
                <a className="faucet-link" href={billing.faucet_url} target="_blank" rel="noreferrer">
                  Fund on Circle faucet (Arc Testnet)
                </a>
              ) : null}
              <DataRow
                label="Daily cap remaining"
                value={capRemaining == null ? "-" : formatCost(capRemaining) || "$0"}
              />
              <DataRow
                label="Top cost driver"
                value={driver ? `${driver.kind} (${formatCost(driver.usd) || "$0"})` : "none"}
              />
            </div>
          </>
        ) : (
          <p className="hint">Billing status unavailable yet. Refresh catalog or check gateway auth.</p>
        )}
        <div className="badge-row">
          <Badge tone={billing?.prepaid_required ? "warn" : "neutral"}>
            {billing?.prepaid_required ? "prepaid" : "metered"}
          </Badge>
          {capRemaining != null && capRemaining <= 0 ? <Badge tone="danger">cap reached</Badge> : null}
        </div>
      </Card>
    </div>
  );
}
