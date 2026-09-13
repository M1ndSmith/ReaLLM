"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { streamChat } from "@/lib/chatClient";
import { formatCost, formatTokens } from "@/lib/formatters";
import { GatewayError } from "@/lib/gateway";
import type { ChatMessage } from "@/lib/types";

export const USER_ID = "local";
export const CONV_KEY = "realmm.conversation_id";
export const INTRO =
  "Provider keys live in .env. This page picks a model. Paste GATEWAY_API_KEY if the gateway requires it. Leave Prompt on Messages only to skip named prompts.";

export type LogItem =
  | { kind: "system" | "user" | "error"; text: string }
  | { kind: "assistant"; text: string; meta: string[] };

function conversationId(): string {
  let id = sessionStorage.getItem(CONV_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(CONV_KEY, id);
  }
  return id;
}

export function useChatSession(model: string, promptName: string, onUnauthorized: () => void) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [log, setLog] = useState<LogItem[]>([{ kind: "system", text: INTRO }]);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const reportError = useCallback((text: string) => {
    setLog((rows) => [...rows.filter((row) => row.kind !== "error"), { kind: "error", text }]);
  }, []);

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    sessionStorage.setItem(CONV_KEY, crypto.randomUUID());
    setMessages([]);
    setLog([{ kind: "system", text: INTRO }]);
  }, []);

  const onSend = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const content = draft.trim();
      if (!model || !content || busy) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
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
          buffered: false,
        };
        await streamChat(
          body,
          {
            onEvent(event) {
              if (event.kind !== "json") return;
              const json = event.payload;
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
              if (json.buffered === true) meta.buffered = true;
            },
          },
          controller.signal,
        );
        const labels = [
          meta.cached ? "cache hit" : "",
          meta.fallbackFrom ? `served by ${meta.served}` : "",
          meta.promptName ? `${meta.promptName}${meta.promptSource ? ` (${meta.promptSource})` : ""}` : "",
          meta.memoriesUsed ? `${meta.memoriesUsed} memories` : "",
          meta.pii ? "pii" : "",
          meta.guard ? "guard" : "",
          meta.buffered ? "buffered" : "",
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
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof GatewayError && err.status === 401) onUnauthorized();
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
    },
    [busy, draft, messages, model, onUnauthorized, promptName],
  );

  return { draft, setDraft, busy, messages, log, logRef, resetChat, onSend, reportError };
}
