import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GatewayKeyField } from "@/components/GatewayKeyField";

describe("GatewayKeyField", () => {
  it("saves the pasted key", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(<GatewayKeyField gatewayKey="secret" onChange={onChange} onSave={onSave} />);
    expect(screen.getByLabelText("Gateway key")).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Use key" }));
    expect(onSave).toHaveBeenCalledOnce();
    await user.type(screen.getByLabelText("Gateway key"), "x");
    expect(onChange).toHaveBeenCalled();
  });
});
