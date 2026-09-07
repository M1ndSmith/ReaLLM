import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GATEWAY_KEY } from "@/lib/auth";
import { useGatewayCatalog } from "@/hooks/useGatewayCatalog";
import { useGatewayKey } from "@/hooks/useGatewayKey";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("useGatewayCatalog", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("restores the stored model when it is still listed", async () => {
    sessionStorage.setItem("realmm.model", "openai/gpt-4o-mini");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/health")) return json({ status: "ok", providers: ["openai"] });
        if (url.endsWith("/models")) {
          return json({
            models: [
              { id: "groq/openai/gpt-oss-20b", provider: "groq" },
              { id: "openai/gpt-4o-mini", provider: "openai" },
            ],
          });
        }
        if (url.endsWith("/prompts")) return json({ prompts: [] });
        return json({}, 404);
      }),
    );
    const { result } = renderHook(() => useGatewayCatalog());
    await act(async () => {
      const loaded = await result.current.load();
      expect(loaded).toEqual({ ok: true });
    });
    expect(result.current.model).toBe("openai/gpt-4o-mini");
  });

  it("marks unauthorized catalog fetches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ detail: { error: "gateway_unauthorized" } }, 401)),
    );
    const { result } = renderHook(() => useGatewayCatalog());
    await act(async () => {
      const loaded = await result.current.load();
      expect(loaded.ok).toBe(false);
      if (!loaded.ok) expect(loaded.unauthorized).toBe(true);
    });
  });
});

describe("useGatewayKey", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("persists the pasted key in sessionStorage", () => {
    const { result } = renderHook(() => useGatewayKey());
    act(() => {
      result.current.setGatewayKeyState("secret-gateway");
    });
    act(() => {
      result.current.saveKey();
    });
    expect(sessionStorage.getItem(GATEWAY_KEY)).toBe("secret-gateway");
  });
});
