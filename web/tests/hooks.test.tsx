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
        if (url.endsWith("/ready")) return json({ ready: true, redis_mode: "unconfigured" });
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

  it("builds lamps from health and ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/health")) {
          return json({
            status: "ok",
            providers: ["groq"],
            memory: { enabled: true },
            pii: { enabled: false },
            guard: { enabled: true },
            reliability: { redis: true },
            budget: { daily_tokens: 10, daily_token_limit: 100 },
          });
        }
        if (url.endsWith("/models")) return json({ models: [{ id: "groq/x", provider: "groq" }] });
        if (url.endsWith("/prompts")) return json({ prompts: [{ name: "chat", source: "local" }] });
        if (url.endsWith("/ready")) return json({ ready: true, redis_mode: "redis" });
        return json({}, 404);
      }),
    );
    const { result } = renderHook(() => useGatewayCatalog());
    await act(async () => {
      await result.current.load();
    });
    const byKey = Object.fromEntries(result.current.lamps.map((lamp) => [lamp.key, lamp]));
    expect(byKey.ready.on).toBe(true);
    expect(byKey.memory.on).toBe(true);
    expect(byKey.pii.on).toBe(false);
    expect(byKey.guard.on).toBe(true);
    expect(byKey.redis.on).toBe(true);
    expect(byKey.budget.on).toBe(true);
    expect(byKey.budget.label).toBe("10 / 100 tok");
  });

  it("clears the model when the catalog has no models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/health")) return json({ status: "ok", providers: [] });
        if (url.endsWith("/models")) return json({});
        if (url.endsWith("/prompts")) return json({});
        if (url.endsWith("/ready")) return json({ ready: false });
        return json({}, 404);
      }),
    );
    const { result } = renderHook(() => useGatewayCatalog());
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.model).toBe("");
    expect(result.current.catalog.prompts).toEqual([]);
    expect(result.current.catalog.models).toEqual([]);
  });

  it("marks non-auth catalog failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "gateway down" }, 503)),
    );
    const { result } = renderHook(() => useGatewayCatalog());
    await act(async () => {
      const loaded = await result.current.load();
      expect(loaded).toEqual({ ok: false, unauthorized: false, message: "gateway down" });
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
