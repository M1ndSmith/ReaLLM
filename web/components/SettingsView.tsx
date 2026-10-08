"use client";

import { AdminKeysPanel } from "@/components/AdminKeysPanel";
import { BillingPanel } from "@/components/StatusSidebar";
import type { BillingStatusResponse, ConfigLayers, ConfigResponse } from "@/lib/types";

const DEFAULT_LAYERS: ConfigLayers = {
  memory: false,
  pii: false,
  guard: false,
  guard_injection: true,
  guard_content: true,
};

const LAYER_ROWS = [
  ["memory", "MEMORY", ""],
  ["pii", "PII", ""],
  ["guard", "GUARD", ""],
  ["guard_injection", "GUARD_INJECTION", "Used when Guard is on."],
  ["guard_content", "GUARD_CONTENT", "Used when Guard is on."],
] as const;

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
  return (
    <div className="stack">
      <BillingPanel
        billing={billing}
        billingLoading={billingLoading}
        canReconcile={canAdmin}
        onReconcile={onReconcileBilling}
      />
      <section className="card">
        <header className="card-head">
          <div>
            <h2 className="card-title">Layers</h2>
            <p className="card-desc">
              {canPatch
                ? "These flags apply on the next chat. Changing embedder, Presidio entities, Redis, budgets, or provider keys still needs .env and a restart."
                : "Set GATEWAY_API_KEY in .env, restart uvicorn, and paste the key here to toggle layers from this page. .env remains valid without a gateway key."}
            </p>
          </div>
        </header>
        <div className="card-body">
          <div className="layer-list">
            {LAYER_ROWS.map(([field, label, hint]) => {
              const on = layers[field];
              const state = toggleBusy === field ? "Saving…" : on ? "On" : "Off";
              return (
                <div key={field} className="layer-row">
                  <div>
                    <div className="row-title">{label}</div>
                    {hint ? <p className="hint">{hint}</p> : null}
                  </div>
                  <button
                    className="outline"
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${label} ${state}`}
                    disabled={!canPatch || toggleBusy != null}
                    onClick={() => void onToggle(field, !on)}
                  >
                    {state}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <AdminKeysPanel enabled={canAdmin} onError={onAdminError} />
    </div>
  );
}
