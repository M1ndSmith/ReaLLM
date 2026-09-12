import { afterEach, describe, expect, it } from "vitest";

import { authHeaders, GATEWAY_KEY, getGatewayKey, setGatewayKey } from "@/lib/auth";

describe("auth storage", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("stores, reads, and clears the gateway key", () => {
    setGatewayKey("secret-gateway");
    expect(getGatewayKey()).toBe("secret-gateway");
    expect(sessionStorage.getItem(GATEWAY_KEY)).toBe("secret-gateway");
    expect(authHeaders()).toEqual({ Authorization: "Bearer secret-gateway" });
    setGatewayKey("  ");
    expect(getGatewayKey()).toBe("");
    expect(authHeaders()).toEqual({});
  });
});
