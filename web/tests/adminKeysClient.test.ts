import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayKey, listGatewayKeys, revokeGatewayKey } from "@/lib/adminKeys";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("adminKeys client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists, creates, and revokes keys", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/admin/keys?") && url.includes("include_revoked=true")) {
          return json({ keys: [{ id: "worker", scopes: ["chat"] }] });
        }
        if (url.endsWith("/admin/keys") && (!init?.method || init.method === "GET")) {
          return json({ keys: [] });
        }
        if (url.endsWith("/admin/keys") && init?.method === "POST") {
          return json({ key: { id: "agent", scopes: ["chat"] }, secret: "issued" });
        }
        if (url.endsWith("/admin/keys/worker") && init?.method === "DELETE") {
          return json({ id: "worker", scopes: ["chat"], revoked_at: "now" });
        }
        return json({}, 404);
      }),
    );
    await expect(listGatewayKeys(true)).resolves.toEqual([{ id: "worker", scopes: ["chat"] }]);
    await expect(listGatewayKeys()).resolves.toEqual([]);
    await expect(createGatewayKey({ key_id: "agent", scopes: ["chat"] })).resolves.toMatchObject({ secret: "issued" });
    await expect(revokeGatewayKey("worker")).resolves.toMatchObject({ revoked_at: "now" });
  });
});
