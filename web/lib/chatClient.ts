import { authHeaders } from "@/lib/auth";
import { formatDetail, gatewayUrl, GatewayError } from "@/lib/gateway";
import { flushSseBuffer, parseSseBuffer, type NativeSseEvent } from "@/lib/sseParser";

export type ChatStreamHandlers = {
  onEvent: (event: NativeSseEvent) => void;
};

export async function streamChat(
  body: Record<string, unknown>,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${gatewayUrl()}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => null);
    throw new GatewayError(formatDetail(errBody, `Chat failed (${res.status}).`), res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseBuffer(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        handlers.onEvent(event);
        if (event.kind === "error") {
          throw new Error(event.message);
        }
      }
    }
    for (const event of flushSseBuffer(buffer)) {
      handlers.onEvent(event);
      if (event.kind === "error") {
        throw new Error(event.message);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
