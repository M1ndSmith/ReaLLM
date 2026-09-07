import { describe, expect, it } from "vitest";

import { formatDetail, GatewayError } from "@/lib/gateway";

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
    expect(formatDetail({ detail: "plain" }, "x")).toBe("plain");
  });
});

describe("GatewayError", () => {
  it("stores status and optional error code", () => {
    const err = new GatewayError("denied", 401, "gateway_unauthorized");
    expect(err.status).toBe(401);
    expect(err.errorCode).toBe("gateway_unauthorized");
  });
});
