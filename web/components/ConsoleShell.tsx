"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { ConnectView } from "@/components/ConnectView";
import { GatewayKeyField } from "@/components/GatewayKeyField";
import { ModelPicker } from "@/components/ModelPicker";
import { OperatorBanner } from "@/components/OperatorBanner";
import { PlaygroundView } from "@/components/PlaygroundView";
import { SettingsView } from "@/components/SettingsView";
import { StatusSidebar } from "@/components/StatusSidebar";
import { Badge } from "@/components/ui";
import { useBillingState } from "@/hooks/useBillingState";
import { useChatSession } from "@/hooks/useChatSession";
import { useGatewayCatalog } from "@/hooks/useGatewayCatalog";
import { useGatewayKey } from "@/hooks/useGatewayKey";
import { useOperatorState } from "@/hooks/useOperatorState";
import { useRuntimeConfig } from "@/hooks/useRuntimeConfig";
import { formatCost } from "@/lib/formatters";
import type { ConfigLayers } from "@/lib/types";
import { curlSnippet, openaiSnippet, pythonSnippet } from "@/lib/snippets";

type View = "play" | "connect" | "settings";

const TITLES: Record<View, string> = {
  play: "Playground",
  connect: "Connect",
  settings: "Settings",
};

export function ConsoleShell({ view }: { view: View }) {
  const key = useGatewayKey();
  const config = useRuntimeConfig();
  const billing = useBillingState();
  const catalog = useGatewayCatalog();
  const chat = useChatSession(catalog.model, catalog.promptName, () => key.setNeedsAuth(true));
  const [copied, setCopied] = useState<string | null>(null);
  const sendDisabled = chat.busy || !catalog.model;
  const showKeyField = key.needsAuth || Boolean(key.gatewayKey) || view === "settings";
  const authOn = Boolean(config.config?.auth_required || key.needsAuth);
  const operator = useOperatorState(config.config, key.needsAuth);
  const curl = curlSnippet(catalog.gateway, catalog.model || "your-model-id", authOn);
  const python = pythonSnippet(catalog.gateway, catalog.model || "your-model-id", authOn);
  const openai = openaiSnippet(catalog.gateway, catalog.model || "your-model-id");

  const loadAll = useCallback(async () => {
    const result = await catalog.load();
    if (result.ok) {
      key.setNeedsAuth(false);
      try {
        await Promise.all([config.refresh(), billing.refresh()]);
      } catch (err) {
        chat.reportError(err instanceof Error ? err.message : "Could not load runtime config.");
      }
      return;
    }
    if (result.unauthorized) key.setNeedsAuth(true);
    chat.reportError(result.message);
  }, [billing.refresh, catalog.load, chat.reportError, config.refresh, key.setNeedsAuth]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  async function toggleLayer(field: keyof ConfigLayers, value: boolean) {
    try {
      await config.toggleLayer(field, value);
      await loadAll();
    } catch (err) {
      chat.reportError(err instanceof Error ? err.message : "Could not update layers.");
    }
  }

  async function reconcileBilling() {
    try {
      await billing.reconcile();
    } catch (err) {
      chat.reportError(err instanceof Error ? err.message : "Billing reconcile failed.");
    }
  }

  function saveKey() {
    key.saveKey();
    void loadAll();
  }

  const keyField = (
    <GatewayKeyField gatewayKey={key.gatewayKey} onChange={key.setGatewayKeyState} onSave={saveKey} />
  );

  return (
    <div className="frame">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="ReaLMM">
          <img src="/reallm-logo-wordmark.png" alt="ReaLMM" />
        </Link>
        <nav className="nav" aria-label="Console">
          <NavLink href="/" current={view === "play"} icon="play">
            Playground
          </NavLink>
          <NavLink href="/connect" current={view === "connect"} icon="connect">
            Connect
          </NavLink>
          <NavLink href="/settings" current={view === "settings"} icon="settings">
            Settings
          </NavLink>
        </nav>
      </aside>
      <main className="stage">
        <header className="page-header">
          <div>
            <h1 className="page-title">{TITLES[view]}</h1>
            <p className="hint">Gateway endpoint: {catalog.gateway}</p>
          </div>
          <div className="page-header-badges">
            <Badge tone={operator.authState === "authorized" ? "good" : operator.authState === "open" ? "warn" : "danger"}>
              auth: {operator.authState}
            </Badge>
            <Badge tone={billing.status?.mode === "wallet" ? "good" : "neutral"}>
              billing: {billing.status?.mode || "off"}
            </Badge>
          </div>
        </header>
        <OperatorBanner state={operator} runtimeError={config.configError || billing.error} billingHint={billing.blockedHint} />
        {view === "play" ? (
          <section className="chat-card">
            <div className="toolbar">
              {showKeyField ? keyField : null}
              <ModelPicker models={catalog.catalog.models} model={catalog.model} onChange={catalog.setModel} />
              <div className="picker">
                <label className="label" htmlFor="promptName">
                  Prompt
                </label>
                <select id="promptName" value={catalog.promptName} onChange={(e) => catalog.setPromptName(e.target.value)}>
                  <option value="">Messages only</option>
                  {catalog.catalog.prompts.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.source === "langfuse" ? `${item.name} (langfuse)` : item.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="ghost" type="button" onClick={chat.resetChat}>
                New chat
              </button>
            </div>
            <PlaygroundView
              log={chat.log}
              logRef={chat.logRef}
              draft={chat.draft}
              onDraft={chat.setDraft}
              onSend={chat.onSend}
              sendDisabled={sendDisabled}
            />
          </section>
        ) : view === "connect" ? (
          <>
            {showKeyField ? <div className="panel">{keyField}</div> : null}
            <p className="hint">
              Agents call POST /chat or POST /v1/chat/completions on {catalog.gateway}. A gateway key is inbound auth, not a
              LiteLLM virtual key.
            </p>
            <ConnectView curl={curl} python={python} openai={openai} copied={copied} onCopy={copy} />
          </>
        ) : (
          <>
            {showKeyField ? <div className="panel">{keyField}</div> : null}
            <p className="hint">Layer flags write data/runtime-flags.json. They do not rewrite .env secrets.</p>
            <SettingsView
              config={config.config}
              billing={billing.status}
              billingLoading={billing.loading}
              needsAuth={key.needsAuth}
              toggleBusy={config.toggleBusy}
              onToggle={toggleLayer}
              canAdmin={operator.authState !== "needs_key" && !operator.blockedActions.includes("admin")}
              onReconcileBilling={() => void reconcileBilling()}
              onAdminError={(message) => chat.reportError(message)}
            />
          </>
        )}
      </main>
      <aside className="ops-rail">
        <StatusSidebar
          providers={catalog.catalog.health?.providers}
          lamps={catalog.lamps}
          redisMode={catalog.catalog.ready?.redis_mode || catalog.catalog.health?.reliability?.redis_mode}
          billing={billing.status}
        />
        <section className="panel usage-panel">
          <div className="snippet-head">
            <h2>Recent usage</h2>
            <button className="ghost" type="button" onClick={() => void billing.refresh()} disabled={billing.loading}>
              {billing.loading ? "Loading" : "Refresh"}
            </button>
          </div>
          {billing.usage?.items?.length ? (
            <ul className="usage-list">
              {billing.usage.items.slice(0, 5).map((item) => (
                <li key={`${item.idempotency_key}-${item.timestamp}`}>
                  <div>
                    <strong>{item.route}</strong>
                    <p className="hint">{item.model}</p>
                  </div>
                  <span>{formatCost(item.total_usd) || "$0"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No captured usage rows yet.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function NavLink({
  href,
  current,
  icon,
  children,
}: {
  href: string;
  current: boolean;
  icon: "play" | "connect" | "settings";
  children: ReactNode;
}) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      <NavIcon name={icon} />
      {children}
      <span className="dot" aria-hidden="true" />
    </Link>
  );
}

function NavIcon({ name }: { name: "play" | "connect" | "settings" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "play") {
    return (
      <svg {...common}>
        <path d="M8 6h12M8 12h12M8 18h8" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
    );
  }
  if (name === "connect") {
    return (
      <svg {...common}>
        <path d="M8 8l-3 3a3 3 0 000 4l1 1" />
        <path d="M16 16l3-3a3 3 0 000-4l-1-1" />
        <path d="M9 15l6-6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}
