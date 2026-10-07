"use client";

import { AdminKeysPanel } from "@/components/AdminKeysPanel";
import { formatCost, formatUsdc, groupedFeatureSpend } from "@/lib/formatters";
import type { BillingStatusResponse, ConfigLayers, ConfigResponse } from "@/lib/types";

const DEFAULT_LAYERS: ConfigLayers = {
  memory: false,
  pii: false,
  guard: false,
  guard_injection: true,
  guard_content: true,
};

type Props = {
  config: ConfigResponse | null;
  billing: BillingStatusResponse | null;
  billingLoading: boolean;
  needsAuth: boolean;
  toggleBusy: string | null;
  onToggle: (field: keyof ConfigLayers, value: boolean) => void;
  canAdmin: boolean;
  onReconcileBilling: () => void;
  onAdminError: (message: string) => void;
};

export function SettingsView({
  config,
  billing,
  billingLoading,
  needsAuth,
  toggleBusy,
  onToggle,
  canAdmin,
  onReconcileBilling,
  onAdminError,
}: Props) {
  const layers = config?.layers || DEFAULT_LAYERS;
  const canPatch = Boolean(config?.auth_required) && !needsAuth;
  const spend = groupedFeatureSpend(billing?.line_item_totals);
  return (
    <div className="snippets">
      <section className="setting-row setting-row-stack">
        <div>
          <h2>Billing mode</h2>
          <p className="hint">
            {config?.billing
              ? `${String(config.billing.mode).toUpperCase()} mode, unpriced policy ${config.billing.unpriced_model_policy}, cache billable ${
                  config.billing.cache_billable ? "yes" : "no"
                }.`
              : "Billing hints unavailable. Load /config with a key that has read scope."}
          </p>
        </div>
        <div className="billing-quick-grid">
          <div>
            <div className="label">Prepaid balance</div>
            <strong>{formatUsdc(billing?.prepaid_balance_usdc) || "n/a"}</strong>
          </div>
          <div>
            <div className="label">Today burn</div>
            <strong>{formatCost(billing?.team_daily_spent_usd) || "$0"}</strong>
          </div>
          <div>
            <div className="label">Feature split</div>
            <strong>
              {formatCost(spend.model) || "$0"} / {formatCost(spend.security + spend.memory + spend.pii) || "$0"}
            </strong>
          </div>
          <button className="ghost" type="button" onClick={onReconcileBilling} disabled={!canAdmin || billingLoading}>
            {billingLoading ? "Refreshing" : "Reconcile billing"}
          </button>
        </div>
      </section>
      <p className="hint">
        {canPatch
          ? "These flags apply on the next chat. Changing embedder, Presidio entities, Redis, budgets, or provider keys still needs .env and a restart."
          : "Set GATEWAY_API_KEY in .env, restart uvicorn, and paste the key here to toggle layers from this page. .env remains valid without a gateway key."}
      </p>
      {(
        [
          ["memory", "MEMORY", layers.memory],
          ["pii", "PII", layers.pii],
          ["guard", "GUARD", layers.guard],
          ["guard_injection", "GUARD_INJECTION", layers.guard_injection],
          ["guard_content", "GUARD_CONTENT", layers.guard_content],
        ] as const
      ).map(([field, label, on]) => (
        <section key={field} className="setting-row">
          <div>
            <h2>{label}</h2>
            <p className="hint">
              {field === "guard_injection" || field === "guard_content"
                ? "Used when GUARD is on."
                : "Overlay flag. Not a provider key."}
            </p>
          </div>
          <button
            className={on ? "ghost on" : "ghost"}
            type="button"
            disabled={!canPatch || toggleBusy != null}
            onClick={() => void onToggle(field, !on)}
          >
            {toggleBusy === field ? "Saving" : on ? "On" : "Off"}
          </button>
        </section>
      ))}
      <AdminKeysPanel enabled={canAdmin} onError={onAdminError} />
    </div>
  );
}
