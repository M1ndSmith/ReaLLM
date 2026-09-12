import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ModelPicker } from "@/components/ModelPicker";

describe("ModelPicker", () => {
  it("disables model select when no models are available", () => {
    render(<ModelPicker models={[]} model="" onChange={() => undefined} />);
    expect(screen.getByLabelText("Model")).toBeDisabled();
    expect(screen.getByRole("option", { name: "No models available" })).toBeInTheDocument();
  });

  it("renders options and dispatches onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ModelPicker
        models={[
          { id: "groq/openai/gpt-oss-20b", provider: "groq" },
          { id: "openai/gpt-4o-mini", provider: "openai" },
        ]}
        model="groq/openai/gpt-oss-20b"
        onChange={onChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Model"), "openai/gpt-4o-mini");
    expect(onChange).toHaveBeenCalledWith("openai/gpt-4o-mini");
  });
});
