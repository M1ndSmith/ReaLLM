"use client";

import { AdminKeysPanel } from "@/components/AdminKeysPanel";
import type { ConfigLayers, ConfigResponse } from "@/lib/types";

const DEFAULT_LAYERS: ConfigLayers = {
  memory: false,
  pii: false,
  guard: false,
  guard_injection: true,
  guard_content: true,
};

type Props = {
  config: ConfigResponse | null;
  needsAuth: boolean;
  toggleBusy: string | null;
  onToggle: (field: keyof ConfigLayers, value: boolean) => void;
  canAdmin: boolean;
  onAdminError: (message: string) => void;
};

export function SettingsView({ config, needsAuth, toggleBusy, onToggle, canAdmin, onAdminError }: Props) {
  const layers = config?.layers || DEFAULT_LAYERS;
  const canPatch = Boolean(config?.auth_required) && !needsAuth;
  return (
    <div className="snippets">
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
