import { describe, expect, it } from "vitest";

import { flushSseBuffer, parseSseBuffer } from "@/lib/sseParser";

describe("parseSseBuffer", () => {
  it("keeps a trailing partial event in rest", () => {
    const first = parseSseBuffer('data: {"content":"he');
    expect(first.events).toEqual([]);
    expect(first.rest).toBe('data: {"content":"he');
    const second = parseSseBuffer(`${first.rest}llo"}\n\n`);
    expect(second.events).toEqual([{ kind: "json", payload: { content: "hello" } }]);
    expect(second.rest).toBe("");
  });

  it("parses multiple events, [DONE], and native errors", () => {
    const { events, rest } = parseSseBuffer(
      'data: {"model":"groq/x"}\n\ndata: {"content":"hi"}\n\ndata: {"error":"blocked"}\n\ndata: [DONE]\n\n',
    );
    expect(rest).toBe("");
    expect(events).toEqual([
      { kind: "json", payload: { model: "groq/x" } },
      { kind: "json", payload: { content: "hi" } },
      { kind: "error", message: "blocked" },
      { kind: "done" },
    ]);
  });

  it("reports malformed JSON as an error event", () => {
    const { events } = parseSseBuffer("data: {not-json}\n\n");
    expect(events).toEqual([{ kind: "error", message: "Malformed SSE payload." }]);
  });
});

describe("flushSseBuffer", () => {
  it("flushes a trailing buffer without a blank line", () => {
    expect(flushSseBuffer('data: {"content":"tail"}')).toEqual([
      { kind: "json", payload: { content: "tail" } },
    ]);
    expect(flushSseBuffer("   ")).toEqual([]);
  });
});
