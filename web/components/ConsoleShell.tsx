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
import { useBillingState } from "@/hooks/useBillingState";
import { useChatSession } from "@/hooks/useChatSession";
import { useGatewayCatalog } from "@/hooks/useGatewayCatalog";
import { useGatewayKey } from "@/hooks/useGatewayKey";
import { useOperatorState } from "@/hooks/useOperatorState";
import { useRuntimeConfig } from "@/hooks/useRuntimeConfig";
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
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            <img src="/reallm-logo-wordmark.png" alt="ReaLMM" width={148} height={28} />
          </Link>
          <nav className="nav" aria-label="Console">
            <NavLink href="/" current={view === "play"}>
              Playground
            </NavLink>
            <NavLink href="/connect" current={view === "connect"}>
              Connect
            </NavLink>
            <NavLink href="/settings" current={view === "settings"}>
              Settings
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="main" className="page">
        <header className="page-header">
          <h1 className="page-title">{TITLES[view]}</h1>
          {view === "play" ? (
            <p className="page-desc">
              Chat with the selected model. Gateway <code>{catalog.gateway}</code>
            </p>
          ) : view === "connect" ? (
            <p className="page-desc">
              Agents call POST /chat or POST /v1/chat/completions on <code>{catalog.gateway}</code>. A gateway key is inbound
              auth, not a LiteLLM virtual key.
            </p>
          ) : (
            <p className="page-desc">Layer flags write data/runtime-flags.json. They do not rewrite .env secrets.</p>
          )}
        </header>
        <OperatorBanner state={operator} runtimeError={config.configError || billing.error} billingHint={billing.blockedHint} />
        {key.needsAuth ? <section className="card card-pad">{keyField}</section> : null}
        {view === "play" ? (
          <div className="split">
            <section className="chat-card">
              <div className="toolbar">
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
            <StatusSidebar
              providers={catalog.catalog.health?.providers}
              lamps={catalog.lamps}
              redisMode={catalog.catalog.ready?.redis_mode || catalog.catalog.health?.reliability?.redis_mode}
              usage={billing.usage?.items}
              usageLoading={billing.loading}
              onRefresh={() => void billing.refresh()}
            />
          </div>
        ) : view === "connect" ? (
          <ConnectView curl={curl} python={python} openai={openai} copied={copied} onCopy={copy} />
        ) : (
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
        )}
      </main>
    </>
  );
}

function NavLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
