import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusSidebar } from "@/components/StatusSidebar";

describe("StatusSidebar", () => {
  it("renders provider and sidecar lamps", () => {
    render(
      <StatusSidebar
        providers={["groq", "openai"]}
        lamps={[
          { key: "memory", label: "MEMORY", on: true },
          { key: "pii", label: "PII", on: false },
        ]}
      />,
    );
    expect(screen.getByText("groq")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("MEMORY").closest("span")).toHaveClass("on");
    expect(screen.getByText("PII").closest("span")).not.toHaveClass("on");
  });

  it("shows a hint when no providers are configured", () => {
    render(<StatusSidebar providers={[]} lamps={[]} />);
    expect(screen.getByText(/No API keys found in .env/i)).toBeInTheDocument();
  });

  it("shows redis mode when provided", () => {
    render(<StatusSidebar providers={["groq"]} lamps={[]} redisMode="local" />);
    expect(screen.getByText(/Redis mode: local/i)).toBeInTheDocument();
  });
});
