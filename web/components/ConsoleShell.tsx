"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ConnectView } from "@/components/ConnectView";
import { GatewayKeyField } from "@/components/GatewayKeyField";
import { ModelPicker } from "@/components/ModelPicker";
import { OperatorBanner } from "@/components/OperatorBanner";
import { PlaygroundView } from "@/components/PlaygroundView";
import { SettingsView } from "@/components/SettingsView";
import { StatusSidebar } from "@/components/StatusSidebar";
import { useChatSession } from "@/hooks/useChatSession";
import { useGatewayCatalog } from "@/hooks/useGatewayCatalog";
import { useGatewayKey } from "@/hooks/useGatewayKey";
import { useOperatorState } from "@/hooks/useOperatorState";
import { useRuntimeConfig } from "@/hooks/useRuntimeConfig";
import type { ConfigLayers } from "@/lib/types";
import { curlSnippet, openaiSnippet, pythonSnippet } from "@/lib/snippets";

type View = "play" | "connect" | "settings";

export function ConsoleShell({ view }: { view: View }) {
  const key = useGatewayKey();
  const config = useRuntimeConfig();
  const catalog = useGatewayCatalog();
  const chat = useChatSession(catalog.model, catalog.promptName, () => key.setNeedsAuth(true));
  const [copied, setCopied] = useState<string | null>(null);
  const sendDisabled = chat.busy || !catalog.model;
  const showKeyField = key.needsAuth || Boolean(key.gatewayKey);
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
        await config.refresh();
      } catch (err) {
        chat.reportError(err instanceof Error ? err.message : "Could not load runtime config.");
      }
      return;
    }
    if (result.unauthorized) key.setNeedsAuth(true);
    chat.reportError(result.message);
  }, [catalog.load, chat.reportError, config.refresh, key.setNeedsAuth]);

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

  function saveKey() {
    key.saveKey();
    void loadAll();
  }

  return (
    <div className="frame">
      <aside className="strip">
        <div className="brand">
          <h1>ReaLMM</h1>
          <p>Provider keys live in .env. Paste a gateway key only if this server requires it.</p>
        </div>
        {showKeyField || view === "settings" ? (
          <GatewayKeyField gatewayKey={key.gatewayKey} onChange={key.setGatewayKeyState} onSave={saveKey} />
        ) : null}
        <StatusSidebar
          providers={catalog.catalog.health?.providers}
          lamps={catalog.lamps}
          redisMode={catalog.catalog.ready?.redis_mode || catalog.catalog.health?.reliability?.redis_mode}
        />
        <ModelPicker models={catalog.catalog.models} model={catalog.model} onChange={catalog.setModel} />
        {view === "play" ? (
          <>
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
          </>
        ) : view === "connect" ? (
          <p className="hint">
            Agents call POST /chat or POST /v1/chat/completions on {catalog.gateway}. A gateway key is inbound auth, not a
            LiteLLM virtual key.
          </p>
        ) : (
          <p className="hint">Layer flags write data/runtime-flags.json. They do not rewrite .env secrets.</p>
        )}
      </aside>
      <main className="stage">
        <nav className="rail" aria-label="Console">
          <Link href="/" aria-current={view === "play" ? "page" : undefined}>
            Playground
          </Link>
          <Link href="/connect" aria-current={view === "connect" ? "page" : undefined}>
            Connect
          </Link>
          <Link href="/settings" aria-current={view === "settings" ? "page" : undefined}>
            Settings
          </Link>
        </nav>
        <OperatorBanner state={operator} runtimeError={config.configError} />
        {view === "play" ? (
          <PlaygroundView
            log={chat.log}
            logRef={chat.logRef}
            draft={chat.draft}
            onDraft={chat.setDraft}
            onSend={chat.onSend}
            sendDisabled={sendDisabled}
          />
        ) : view === "connect" ? (
          <ConnectView curl={curl} python={python} openai={openai} copied={copied} onCopy={copy} />
        ) : (
          <SettingsView
            config={config.config}
            needsAuth={key.needsAuth}
            toggleBusy={config.toggleBusy}
            onToggle={toggleLayer}
            canAdmin={operator.authState !== "needs_key" && !operator.blockedActions.includes("admin")}
            onAdminError={(message) => chat.reportError(message)}
          />
        )}
      </main>
    </div>
  );
}
