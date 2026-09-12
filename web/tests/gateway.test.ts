import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson, fetchReady, formatDetail, GatewayError } from "@/lib/gateway";

describe("formatDetail", () => {
  it("explains a missing gateway key", () => {
    expect(formatDetail({ detail: { error: "gateway_unauthorized" } }, "fallback")).toContain(
      "This gateway requires GATEWAY_API_KEY",
    );
    expect(formatDetail({ detail: { error: "gateway_key_required" } }, "fallback")).toContain(
      "Set GATEWAY_API_KEY in .env",
    );
  });

  it("falls back for unstructured payloads", () => {
    expect(formatDetail(null, "Request failed (500).")).toBe("Request failed (500).");
    expect(formatDetail({ detail: { error: "forbidden", required_scope: "chat" } }, "x")).toContain("needs chat");
    expect(formatDetail({ detail: { error: "forbidden" } }, "x")).toBe("Action failed: forbidden");
    expect(formatDetail({ detail: "plain" }, "x")).toBe("plain");
    expect(formatDetail({ detail: [{ msg: "field required" }] }, "x")).toBe("field required");
    expect(formatDetail({ error: { message: "upstream" } }, "x")).toBe("upstream");
    expect(formatDetail({ error: "boom" }, "x")).toBe("boom");
    expect(formatDetail({ foo: 1 }, "x")).toBe("x");
  });
});

describe("GatewayError", () => {
  it("stores status and optional error code", () => {
    const err = new GatewayError("denied", 401, "gateway_unauthorized");
    expect(err.status).toBe(401);
    expect(err.errorCode).toBe("gateway_unauthorized");
  });
});

describe("fetch helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches auth headers and parses JSON", async () => {
    sessionStorage.setItem("realmm.gateway_key", "secret-gateway");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer secret-gateway");
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    await expect(fetchJson<{ ok: boolean }>("/health")).resolves.toEqual({ ok: true });
    await expect(
      fetchJson<{ ok: boolean }>("/admin/keys", { method: "POST", body: JSON.stringify({ key_id: "agent" }) }),
    ).resolves.toEqual({ ok: true });
    sessionStorage.clear();
  });

  it("returns ready payload from a 503 detail body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: { ready: false, redis_mode: "local" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(fetchReady()).resolves.toEqual({ ready: false, redis_mode: "local" });
  });

  it("throws GatewayError when fetchJson is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "nope" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(fetchJson("/admin/keys")).rejects.toMatchObject({ status: 403, message: "nope" });
  });

  it("uses a fallback message when error JSON is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(fetchJson("/health")).rejects.toMatchObject({
      status: 500,
      message: "Request failed (500).",
    });
  });

  it("returns ready JSON on 200 and null otherwise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ready: true, redis_mode: "redis" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(fetchReady()).resolves.toEqual({ ready: true, redis_mode: "redis" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    await expect(fetchReady()).resolves.toBeNull();
  });
});
