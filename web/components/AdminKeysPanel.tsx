"use client";

import { useCallback, useEffect, useState } from "react";

import { createGatewayKey, listGatewayKeys, revokeGatewayKey } from "@/lib/adminKeys";
import type { IdentityPublic } from "@/lib/types";

const SCOPE_OPTIONS = ["read", "chat", "config", "admin"] as const;

type Props = {
  enabled: boolean;
  onError: (message: string) => void;
};

export function AdminKeysPanel({ enabled, onError }: Props) {
  const [keys, setKeys] = useState<IdentityPublic[]>([]);
  const [keyId, setKeyId] = useState("");
  const [label, setLabel] = useState("");
  const [teamId, setTeamId] = useState("");
  const [teamDailyCap, setTeamDailyCap] = useState("");
  const [maxPerCallUsd, setMaxPerCallUsd] = useState("");
  const [prepaidRequired, setPrepaidRequired] = useState(false);
  const [scopes, setScopes] = useState<string[]>(["chat"]);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      setKeys(await listGatewayKeys(true));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load gateway keys.");
    }
  }, [enabled, onError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!enabled) return null;

  async function onCreate() {
    const id = keyId.trim();
    if (!id || scopes.length === 0 || busy) return;
    setBusy(true);
    try {
      const cap = teamDailyCap.trim() === "" ? Number.NaN : Number(teamDailyCap);
      const maxPerCall = maxPerCallUsd.trim() === "" ? Number.NaN : Number(maxPerCallUsd);
      const payload: {
        key_id: string;
        scopes: string[];
        label?: string;
        quotas?: {
          team_id?: string;
          team_daily_usd_cap?: number;
          max_per_call_usd?: number;
          prepaid_required?: boolean;
        };
      } = {
        key_id: id,
        scopes,
        label: label.trim() || undefined,
      };
      if (teamId.trim() || Number.isFinite(cap) || Number.isFinite(maxPerCall) || prepaidRequired) {
        payload.quotas = {
          team_id: teamId.trim() || undefined,
          team_daily_usd_cap: Number.isFinite(cap) ? cap : undefined,
          max_per_call_usd: Number.isFinite(maxPerCall) ? maxPerCall : undefined,
          prepaid_required: prepaidRequired || undefined,
        };
      }
      const created = await createGatewayKey(payload);
      setIssuedSecret(created.secret);
      setKeyId("");
      setLabel("");
      setTeamId("");
      setTeamDailyCap("");
      setMaxPerCallUsd("");
      setPrepaidRequired(false);
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create gateway key.");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    setBusy(true);
    try {
      await revokeGatewayKey(id);
      setPendingRevoke(null);
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not revoke gateway key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2 className="card-title">Gateway keys</h2>
          <p className="card-desc">Create scoped inbound keys. The secret is shown once. Provider keys stay in .env.</p>
        </div>
      </header>
      <div className="card-body stack">
      {issuedSecret ? (
        <pre className="secret-once" data-testid="issued-secret">
          {issuedSecret}
        </pre>
      ) : null}
      <div className="picker">
        <label className="label" htmlFor="newKeyId">
          Key id
        </label>
        <input
          id="newKeyId"
          name="keyId"
          spellCheck={false}
          autoComplete="off"
          value={keyId}
          onChange={(event) => setKeyId(event.target.value)}
        />
        <label className="label" htmlFor="newKeyLabel">
          Label
        </label>
        <input id="newKeyLabel" value={label} onChange={(event) => setLabel(event.target.value)} />
        <label className="label" htmlFor="newTeamId">
          Team id (optional)
        </label>
        <input id="newTeamId" value={teamId} onChange={(event) => setTeamId(event.target.value)} />
        <label className="label" htmlFor="newTeamDailyCap">
          Team daily USD cap (optional)
        </label>
        <input
          id="newTeamDailyCap"
          type="text"
          inputMode="decimal"
          value={teamDailyCap}
          onChange={(event) => setTeamDailyCap(event.target.value)}
        />
        <label className="label" htmlFor="newMaxPerCallUsd">
          Max per-call USD (optional)
        </label>
        <input
          id="newMaxPerCallUsd"
          type="text"
          inputMode="decimal"
          value={maxPerCallUsd}
          onChange={(event) => setMaxPerCallUsd(event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={prepaidRequired}
            onChange={(event) => setPrepaidRequired(event.target.checked)}
          />
          Require prepaid
        </label>
        <div className="scope-row">
          {SCOPE_OPTIONS.map((scope) => (
            <label key={scope}>
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={() => {
                  setScopes((current) =>
                    current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
                  );
                }}
              />
              {scope}
            </label>
          ))}
        </div>
        <button type="button" disabled={busy} onClick={() => void onCreate()}>
          Create key
        </button>
      </div>
      <ul className="key-list">
        {keys.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.id}</strong>
              <p className="hint">
                {item.scopes.join(", ")}
                {item.quotas?.team_id ? ` · team ${item.quotas.team_id}` : ""}
                {item.quotas?.team_daily_usd_cap != null ? ` · cap $${item.quotas.team_daily_usd_cap}` : ""}
                {item.quotas?.prepaid_required ? " · prepaid" : ""}
                {item.revoked_at ? " · revoked" : ""}
              </p>
            </div>
            {item.revoked_at ? null : pendingRevoke === item.id ? (
              <span className="scope-row">
                <button className="destructive" type="button" disabled={busy} onClick={() => void onRevoke(item.id)}>
                  Confirm revoke
                </button>
                <button className="ghost" type="button" disabled={busy} onClick={() => setPendingRevoke(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="destructive" type="button" disabled={busy} onClick={() => setPendingRevoke(item.id)}>
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}
