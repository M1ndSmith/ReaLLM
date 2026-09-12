import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminKeysPanel } from "@/components/AdminKeysPanel";
import * as adminKeys from "@/lib/adminKeys";

vi.mock("@/lib/adminKeys", () => ({
  listGatewayKeys: vi.fn(),
  createGatewayKey: vi.fn(),
  revokeGatewayKey: vi.fn(),
}));

const listGatewayKeys = vi.mocked(adminKeys.listGatewayKeys);
const createGatewayKey = vi.mocked(adminKeys.createGatewayKey);
const revokeGatewayKey = vi.mocked(adminKeys.revokeGatewayKey);

afterEach(() => {
  listGatewayKeys.mockReset();
  createGatewayKey.mockReset();
  revokeGatewayKey.mockReset();
});

describe("AdminKeysPanel", () => {
  it("renders nothing when disabled", () => {
    render(<AdminKeysPanel enabled={false} onError={() => undefined} />);
    expect(screen.queryByText("Gateway keys")).not.toBeInTheDocument();
  });

  it("lists keys and creates a secret once", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    listGatewayKeys.mockResolvedValue([
      { id: "worker", scopes: ["chat"], revoked_at: null },
    ]);
    createGatewayKey.mockResolvedValue({
      key: { id: "agent", scopes: ["chat"] },
      secret: "issued-secret",
    });
    render(<AdminKeysPanel enabled onError={onError} />);
    await waitFor(() => {
      expect(screen.getByText("worker")).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText("Key id"), "agent");
    await user.type(screen.getByLabelText("Label"), "worker bot");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => {
      expect(screen.getByTestId("issued-secret")).toHaveTextContent("issued-secret");
    });
    expect(createGatewayKey).toHaveBeenCalledWith({ key_id: "agent", scopes: ["chat"], label: "worker bot" });
  });

  it("revokes an active key", async () => {
    const user = userEvent.setup();
    listGatewayKeys.mockResolvedValue([{ id: "worker", scopes: ["chat"], revoked_at: null }]);
    revokeGatewayKey.mockResolvedValue({ id: "worker", scopes: ["chat"], revoked_at: "now" });
    render(<AdminKeysPanel enabled onError={() => undefined} />);
    await waitFor(() => expect(screen.getByText("worker")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(revokeGatewayKey).toHaveBeenCalledWith("worker");
  });

  it("reports load failures", async () => {
    const onError = vi.fn();
    listGatewayKeys.mockRejectedValue(new Error("denied"));
    render(<AdminKeysPanel enabled onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("denied"));
  });

  it("ignores empty creates and shows revoked keys without a revoke button", async () => {
    const user = userEvent.setup();
    listGatewayKeys.mockResolvedValue([{ id: "old", scopes: ["chat"], revoked_at: "yesterday" }]);
    render(<AdminKeysPanel enabled onError={() => undefined} />);
    await waitFor(() => expect(screen.getByText("old")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create key" }));
    expect(createGatewayKey).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText("chat"));
    await user.type(screen.getByLabelText("Key id"), "agent");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    expect(createGatewayKey).not.toHaveBeenCalled();
  });

  it("toggles scopes and reports create/revoke errors", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    listGatewayKeys.mockResolvedValue([{ id: "worker", scopes: ["chat"], revoked_at: null }]);
    createGatewayKey.mockRejectedValue(new Error("create failed"));
    revokeGatewayKey.mockRejectedValue(new Error("revoke failed"));
    render(<AdminKeysPanel enabled onError={onError} />);
    await waitFor(() => expect(screen.getByText("worker")).toBeInTheDocument());
    await user.click(screen.getByLabelText("admin"));
    await user.click(screen.getByLabelText("admin"));
    await user.click(screen.getByLabelText("chat"));
    await user.click(screen.getByLabelText("chat"));
    await user.type(screen.getByLabelText("Key id"), "agent");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("create failed"));
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("revoke failed"));
  });
});
