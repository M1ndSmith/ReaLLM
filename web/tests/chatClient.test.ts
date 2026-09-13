import { afterEach, describe, expect, it, vi } from "vitest";

import { streamChat } from "@/lib/chatClient";
import { GatewayError } from "@/lib/gateway";

function sseResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
        return;
      }
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

describe("streamChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reassembles split SSE chunks and surfaces native error events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(['data: {"content":"he', 'llo"}\n\ndata: {"error":"blocked"}\n\n']),
      ),
    );
    const events: Array<{ kind: string }> = [];
    await expect(
      streamChat({ model: "x", messages: [] }, { onEvent: (event) => events.push(event) }),
    ).rejects.toThrow("blocked");
    expect(events).toEqual([
      { kind: "json", payload: { content: "hello" } },
      { kind: "error", message: "blocked" },
    ]);
  });

  it("throws GatewayError on HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: { error: "gateway_unauthorized" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(streamChat({ model: "x", messages: [] }, { onEvent: () => undefined })).rejects.toBeInstanceOf(
      GatewayError,
    );
  });

  it("flushes a trailing buffer without a final blank line", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(['data: {"content":"tail"}'])));
    const events: Array<{ kind: string; payload?: { content?: string } }> = [];
    await streamChat({ model: "x", messages: [] }, { onEvent: (event) => events.push(event) });
    expect(events).toEqual([{ kind: "json", payload: { content: "tail" } }]);
  });

  it("delivers [DONE] without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(["data: [DONE]\n\n"])));
    const events: Array<{ kind: string }> = [];
    await expect(
      streamChat({ model: "x", messages: [] }, { onEvent: (event) => events.push(event) }),
    ).resolves.toBeUndefined();
    expect(events).toEqual([{ kind: "done" }]);
  });

  it("throws on a trailing SSE error event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(['data: {"error":"late"}'])));
    await expect(streamChat({ model: "x", messages: [] }, { onEvent: () => undefined })).rejects.toThrow("late");
  });
});
