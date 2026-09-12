import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useOperatorState } from "@/hooks/useOperatorState";
import type { ConfigResponse } from "@/lib/types";

const baseLayers = {
  memory: false,
  pii: false,
  guard: false,
  guard_injection: true,
  guard_content: true,
};

function config(overrides: Partial<ConfigResponse>): ConfigResponse {
  return {
    auth_required: true,
    layers: baseLayers,
    restart_for: [],
    ...overrides,
  };
}

describe("useOperatorState", () => {
  it("returns open state when auth is off", () => {
    const { result } = renderHook(() => useOperatorState(config({ auth_required: false }), false));
    expect(result.current.authState).toBe("open");
    expect(result.current.blockedActions).toEqual([]);
    expect(result.current.message).toMatch(/auth is off/i);
  });

  it("returns needs_key state when auth is required and no identity is active", () => {
    const { result } = renderHook(() => useOperatorState(config({ identity: null }), true));
    expect(result.current.authState).toBe("needs_key");
    expect(result.current.blockedActions).toEqual(["chat", "config", "admin"]);
  });

  it("returns authorized state with no blocked actions for full-scope keys", () => {
    const { result } = renderHook(() =>
      useOperatorState(config({ identity: { id: "admin", scopes: ["chat", "config", "admin"] } }), false),
    );
    expect(result.current.authState).toBe("authorized");
    expect(result.current.blockedActions).toEqual([]);
    expect(result.current.message).toMatch(/can access chat, config, and admin/i);
  });

  it("returns blocked actions when scopes are partial", () => {
    const { result } = renderHook(() =>
      useOperatorState(config({ identity: { id: "chat-only", scopes: ["chat"] } }), false),
    );
    expect(result.current.authState).toBe("authorized");
    expect(result.current.blockedActions).toEqual(["config", "admin"]);
    expect(result.current.message).toMatch(/cannot access: config, admin/i);
  });
});
