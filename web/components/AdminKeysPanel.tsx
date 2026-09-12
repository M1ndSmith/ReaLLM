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
  const [scopes, setScopes] = useState<string[]>(["chat"]);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const created = await createGatewayKey({ key_id: id, scopes, label: label.trim() || undefined });
      setIssuedSecret(created.secret);
      setKeyId("");
      setLabel("");
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
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not revoke gateway key.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-keys">
      <h2>Gateway keys</h2>
      <p className="hint">
        Create scoped inbound keys. The secret is shown once. Provider keys stay in .env.
      </p>
      {issuedSecret ? (
        <pre className="secret-once" data-testid="issued-secret">
          {issuedSecret}
        </pre>
      ) : null}
      <div className="picker">
        <label className="label" htmlFor="newKeyId">
          Key id
        </label>
        <input id="newKeyId" value={keyId} onChange={(event) => setKeyId(event.target.value)} />
        <label className="label" htmlFor="newKeyLabel">
          Label
        </label>
        <input id="newKeyLabel" value={label} onChange={(event) => setLabel(event.target.value)} />
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
        <button className="ghost" type="button" disabled={busy} onClick={() => void onCreate()}>
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
                {item.revoked_at ? " · revoked" : ""}
              </p>
            </div>
            {item.revoked_at ? null : (
              <button className="ghost" type="button" disabled={busy} onClick={() => void onRevoke(item.id)}>
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
