import { act, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONV_KEY, INTRO, useChatSession } from "@/hooks/useChatSession";
import { streamChat } from "@/lib/chatClient";
import { GatewayError } from "@/lib/gateway";

vi.mock("@/lib/chatClient", () => ({
  streamChat: vi.fn(),
}));

const mockedStream = vi.mocked(streamChat);

function submitEvent(): FormEvent {
  return { preventDefault() {} } as FormEvent;
}

describe("useChatSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockedStream.mockReset();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("calls onUnauthorized on chat 401 and replaces the empty assistant bubble", async () => {
    const onUnauthorized = vi.fn();
    mockedStream.mockRejectedValue(new GatewayError("denied", 401, "gateway_unauthorized"));
    const { result } = renderHook(() => useChatSession("groq/openai/gpt-oss-20b", "", onUnauthorized));
    act(() => {
      result.current.setDraft("hi");
    });
    await act(async () => {
      await result.current.onSend(submitEvent());
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    const last = result.current.log[result.current.log.length - 1];
    expect(last).toEqual({ kind: "error", text: "denied" });
    expect(result.current.log.filter((item) => item.kind === "assistant")).toEqual([]);
  });

  it("turns a failed empty assistant bubble into an error row", async () => {
    const onUnauthorized = vi.fn();
    mockedStream.mockRejectedValue(new Error("blocked"));
    const { result } = renderHook(() => useChatSession("groq/openai/gpt-oss-20b", "", onUnauthorized));
    act(() => {
      result.current.setDraft("hi");
    });
    await act(async () => {
      await result.current.onSend(submitEvent());
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(result.current.log[result.current.log.length - 1]).toEqual({ kind: "error", text: "blocked" });
  });

  it("silences AbortError without an error row or auth prompt", async () => {
    const onUnauthorized = vi.fn();
    mockedStream.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    const { result } = renderHook(() => useChatSession("groq/openai/gpt-oss-20b", "", onUnauthorized));
    act(() => {
      result.current.setDraft("hi");
    });
    await act(async () => {
      await result.current.onSend(submitEvent());
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(result.current.log.some((item) => item.kind === "error")).toBe(false);
    expect(result.current.log).toEqual([
      { kind: "system", text: INTRO },
      { kind: "user", text: "hi" },
      { kind: "assistant", text: "", meta: [] },
    ]);
  });

  it("aborts an in-flight stream, rotates conversation id, and resets the log", async () => {
    const onUnauthorized = vi.fn();
    let releaseStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    mockedStream.mockImplementation(async (_body, _handlers, signal) => {
      releaseStarted();
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    const { result } = renderHook(() => useChatSession("groq/openai/gpt-oss-20b", "", onUnauthorized));
    act(() => {
      result.current.setDraft("hi");
    });
    let sendDone: Promise<void>;
    act(() => {
      sendDone = result.current.onSend(submitEvent());
    });
    await started;
    const previous = sessionStorage.getItem(CONV_KEY);
    expect(previous).toBeTruthy();
    act(() => {
      result.current.resetChat();
    });
    await act(async () => {
      await sendDone!;
    });
    expect(sessionStorage.getItem(CONV_KEY)).not.toBe(previous);
    expect(result.current.messages).toEqual([]);
    expect(result.current.log).toEqual([{ kind: "system", text: INTRO }]);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
