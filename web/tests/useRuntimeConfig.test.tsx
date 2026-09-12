import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRuntimeConfig } from "@/hooks/useRuntimeConfig";
import { fetchJson } from "@/lib/gateway";

vi.mock("@/lib/gateway", () => ({
  fetchJson: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchJson);

describe("useRuntimeConfig", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("refreshes config and clears errors", async () => {
    mockedFetch.mockResolvedValueOnce({
      auth_required: true,
      identity: { id: "admin", scopes: ["config"] },
      layers: { memory: false, pii: false, guard: false, guard_injection: true, guard_content: true },
      restart_for: ["keys"],
    });
    const { result } = renderHook(() => useRuntimeConfig());
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.config?.auth_required).toBe(true);
    expect(result.current.configError).toBeNull();
  });

  it("captures refresh failures", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("denied"));
    const { result } = renderHook(() => useRuntimeConfig());
    await act(async () => {
      await expect(result.current.refresh()).rejects.toThrow("denied");
    });
    expect(result.current.config).toBeNull();
    expect(result.current.configError).toBe("denied");
  });

  it("toggleLayer updates config and clears prior errors", async () => {
    mockedFetch.mockResolvedValueOnce({
      auth_required: true,
      identity: { id: "admin", scopes: ["config"] },
      layers: { memory: true, pii: false, guard: false, guard_injection: true, guard_content: true },
      restart_for: [],
    });
    const { result } = renderHook(() => useRuntimeConfig());
    act(() => {
      result.current.setConfig({
        auth_required: true,
        identity: { id: "admin", scopes: ["config"] },
        layers: { memory: false, pii: false, guard: false, guard_injection: true, guard_content: true },
        restart_for: [],
      });
    });
    await act(async () => {
      await result.current.toggleLayer("memory", true);
    });
    expect(mockedFetch).toHaveBeenCalledWith(
      "/config",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ layers: { memory: true } }) }),
    );
    expect(result.current.config?.layers.memory).toBe(true);
    expect(result.current.configError).toBeNull();
    expect(result.current.toggleBusy).toBeNull();
  });

  it("toggleLayer stores errors and rejects", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("patch denied"));
    const { result } = renderHook(() => useRuntimeConfig());
    await act(async () => {
      await expect(result.current.toggleLayer("pii", true)).rejects.toThrow("patch denied");
    });
    expect(result.current.configError).toBe("patch denied");
    expect(result.current.toggleBusy).toBeNull();
  });
});

