"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson, formatDetail, gatewayUrl } from "@/lib/gateway";
import { curlSnippet, pythonSnippet } from "@/lib/snippets";
import type { ChatMessage, HealthResponse, ModelInfo, PromptListItem } from "@/lib/types";

const USER_ID = "local";
const MODEL_KEY = "realmm.model";
const CONV_KEY = "realmm.conversation_id";
const INTRO =
  "Keys live in .env. This page only picks a model. Leave Prompt on Messages only to skip named prompts.";

type View = "play" | "connect";

type LogItem =
  | { kind: "system" | "user" | "error"; text: string }
  | { kind: "assistant"; text: string; meta: string[] };

type Catalog = {
  health: HealthResponse | null;
  models: ModelInfo[];
  prompts: PromptListItem[];
};

function conversationId(): string {
  let id = sessionStorage.getItem(CONV_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(CONV_KEY, id);
  }
  return id;
}

function formatTokens(usage: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null) {
  if (!usage) return "";
  const total =
    usage.total_tokens != null ? usage.total_tokens : (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  if (!total) return "";
  return `${total} tok`;
}

function formatCost(value: unknown) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "$0";
  return `$${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function budgetText(health: HealthResponse | null): string {
  const b = health?.budget;
  if (!b) return "budget —";
  if (b.daily_token_limit != null) return `${b.daily_tokens} / ${b.daily_token_limit} tok`;
  return `${b.daily_tokens} tok`;
}

export function Console({ view }: { view: View }) {
  const gateway = gatewayUrl();
  const [catalog, setCatalog] = useState<Catalog>({ health: null, models: [], prompts: [] });
  const [model, setModel] = useState("");
  const [promptName, setPromptName] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [log, setLog] = useState<LogItem[]>([{ kind: "system", text: INTRO }]);
  const logRef = useRef<HTMLDivElement>(null);
  const sendDisabled = busy || !model;

  const load = useCallback(async () => {
    try {
      const [health, modelsBody, promptsBody] = await Promise.all([
        fetchJson<HealthResponse>("/health"),
        fetchJson<{ models: ModelInfo[] }>("/models"),
        fetchJson<{ prompts: PromptListItem[] }>("/prompts"),
      ]);
      const models = modelsBody.models || [];
      setCatalog({ health, models, prompts: promptsBody.prompts || [] });
      const stored = sessionStorage.getItem(MODEL_KEY);
      const next = models.some((item) => item.id === stored) ? stored : models[0]?.id || "";
      setModel(next || "");
    } catch (err) {
      setCatalog({ health: null, models: [], prompts: [] });
      setLog((rows) => [
        ...rows.filter((row) => row.kind !== "error"),
        {
          kind: "error",
          text:
            err instanceof Error
              ? err.message
              : `Could not reach the gateway at ${gateway}. Start uvicorn on port 8000.`,
        },
      ]);
    }
  }, [gateway]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (model) sessionStorage.setItem(MODEL_KEY, model);
  }, [model]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const lamps = useMemo(() => {
    const health = catalog.health;
    return [
      { key: "memory", label: "memory", on: Boolean(health?.memory?.enabled) },
      { key: "pii", label: "pii", on: Boolean(health?.pii?.enabled) },
      { key: "guard", label: "guard", on: Boolean(health?.guard?.enabled) },
      { key: "redis", label: "redis", on: Boolean(health?.reliability?.redis) },
      { key: "budget", label: budgetText(health), on: health?.budget != null },
    ];
  }, [catalog.health]);

  function resetChat() {
    sessionStorage.setItem(CONV_KEY, crypto.randomUUID());
    setMessages([]);
    setLog([{ kind: "system", text: INTRO }]);
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!model || !content || busy) return;
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setLog((rows) => [...rows, { kind: "user", text: content }, { kind: "assistant", text: "", meta: [] }]);
    setDraft("");
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        model,
        messages: nextMessages,
        stream: true,
        user_id: USER_ID,
        conversation_id: conversationId(),
      };
      if (promptName) body.prompt = promptName;
      const res = await fetch(`${gateway}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => null);
        throw new Error(formatDetail(errBody, `Chat failed (${res.status}).`));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";
      const meta = {
        cached: false,
        fallbackFrom: null as string | null,
        served: model,
        promptName: "",
        promptSource: "",
        usage: null as { total_tokens?: number } | null,
        cost: null as unknown,
        memoriesUsed: null as number | null,
        pii: null as boolean | null,
        guard: null as boolean | null,
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((row) => row.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          const json = JSON.parse(payload) as Record<string, unknown>;
          if (json.error) throw new Error(String(json.error));
          if (typeof json.content === "string") {
            reply += json.content;
            setLog((rows) => {
              const copy = [...rows];
              const last = copy[copy.length - 1];
              if (last?.kind === "assistant") copy[copy.length - 1] = { ...last, text: reply };
              return copy;
            });
          }
          if (json.cached) meta.cached = true;
          if (typeof json.fallback_from === "string") meta.fallbackFrom = json.fallback_from;
          if (typeof json.model === "string") meta.served = json.model;
          if (typeof json.prompt_name === "string") meta.promptName = json.prompt_name;
          if (typeof json.prompt_source === "string") meta.promptSource = json.prompt_source;
          if (json.usage && typeof json.usage === "object") meta.usage = json.usage as { total_tokens?: number };
          if (json.cost_usd != null) meta.cost = json.cost_usd;
          if (typeof json.memories_used === "number") meta.memoriesUsed = json.memories_used;
          if (typeof json.pii_redacted === "boolean") meta.pii = json.pii_redacted;
          if (typeof json.guard_passed === "boolean") meta.guard = json.guard_passed;
        }
      }
      const labels = [
        meta.cached ? "cache hit" : "",
        meta.fallbackFrom ? `served by ${meta.served}` : "",
        meta.promptName ? `${meta.promptName}${meta.promptSource ? ` (${meta.promptSource})` : ""}` : "",
        meta.memoriesUsed ? `${meta.memoriesUsed} memories` : "",
        meta.pii ? "pii" : "",
        meta.guard ? "guard" : "",
        formatTokens(meta.usage),
        formatCost(meta.cost),
      ].filter(Boolean);
      const finalText = reply || "(empty response)";
      setMessages([...nextMessages, { role: "assistant", content: finalText }]);
      setLog((rows) => {
        const copy = [...rows];
        const last = copy[copy.length - 1];
        if (last?.kind === "assistant") copy[copy.length - 1] = { kind: "assistant", text: finalText, meta: labels };
        return copy;
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : "The model request failed.";
      setLog((rows) => {
        const copy = [...rows];
        const last = copy[copy.length - 1];
        if (last?.kind === "assistant" && !last.text) {
          copy[copy.length - 1] = { kind: "error", text };
          return copy;
        }
        return [...copy, { kind: "error", text }];
      });
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  const curl = curlSnippet(gateway, model || "your-model-id");
  const python = pythonSnippet(gateway, model || "your-model-id");

  return (
    <div className="frame">
      <aside className="strip">
        <div className="brand">
          <h1>ReaLMM</h1>
          <p>Keys live in .env. This page only picks a model.</p>
        </div>
        <div className="bus">
          <div className="label">Providers</div>
          <div className="lamps" aria-live="polite">
            {catalog.health?.providers?.length ? (
              catalog.health.providers.map((name) => (
                <span key={name} className="lamp on">
                  <i />
                  {name}
                </span>
              ))
            ) : (
              <p className="hint">No API keys found in .env.</p>
            )}
          </div>
          <div className="label">Sidecars</div>
          <div className="lamps">
            {lamps.map((lamp) => (
              <span key={lamp.key} className={lamp.on ? "lamp on" : "lamp"}>
                <i />
                {lamp.label}
              </span>
            ))}
          </div>
          <p className="hint">Sidecars come from .env. Edit the file and restart uvicorn. This page does not change them.</p>
        </div>
        <div className="picker">
          <label className="label" htmlFor="model">
            Model
          </label>
          <select id="model" value={model} onChange={(e) => setModel(e.target.value)} disabled={!catalog.models.length}>
            {catalog.models.length ? (
              catalog.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))
            ) : (
              <option value="">No models available</option>
            )}
          </select>
        </div>
        {view === "play" ? (
          <>
            <div className="picker">
              <label className="label" htmlFor="promptName">
                Prompt
              </label>
              <select id="promptName" value={promptName} onChange={(e) => setPromptName(e.target.value)}>
                <option value="">Messages only</option>
                {catalog.prompts.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.source === "langfuse" ? `${item.name} (langfuse)` : item.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="ghost" type="button" onClick={resetChat}>
              New chat
            </button>
          </>
        ) : (
          <p className="hint">Agents call the same POST /chat on {gateway}. Same host for every agent; change the JSON body.</p>
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
        </nav>
        {view === "play" ? (
          <>
            <div ref={logRef} className="log" aria-live="polite">
              {log.map((item, index) =>
                item.kind === "assistant" ? (
                  <div key={index} className="bubble-wrap">
                    <div className="bubble assistant">{item.text}</div>
                    {item.meta.length ? <div className="meta">{item.meta.join(" · ")}</div> : null}
                  </div>
                ) : (
                  <div key={index} className={`bubble ${item.kind}`}>
                    {item.text}
                  </div>
                ),
              )}
            </div>
            <form className="composer" onSubmit={onSend}>
              <label className="sr-only" htmlFor="prompt">
                Message
              </label>
              <textarea
                id="prompt"
                rows={3}
                placeholder="Ask the selected model…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                required
              />
              <button id="send" type="submit" disabled={sendDisabled}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="snippets">
            <p className="hint">
              Copy a client for agents or workflows. This is not a new URL and not a virtual key. Optional{" "}
              <code>response_format</code> is JSON on the request, not a control in this console.
            </p>
            <section>
              <div className="snippet-head">
                <h2>curl</h2>
                <button className="ghost" type="button" onClick={() => void copy("curl", curl)}>
                  {copied === "curl" ? "Copied" : "Copy curl"}
                </button>
              </div>
              <pre>{curl}</pre>
            </section>
            <section>
              <div className="snippet-head">
                <h2>Python</h2>
                <button className="ghost" type="button" onClick={() => void copy("python", python)}>
                  {copied === "python" ? "Copied" : "Copy Python"}
                </button>
              </div>
              <pre>{python}</pre>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
