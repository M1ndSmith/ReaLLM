import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BillingPanel, StatusSidebar } from "@/components/StatusSidebar";

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
    expect(screen.getByLabelText("MEMORY on")).toBeInTheDocument();
    expect(screen.getByLabelText("PII off")).toBeInTheDocument();
  });

  it("shows a hint when no providers are configured", () => {
    render(<StatusSidebar providers={[]} lamps={[]} />);
    expect(screen.getByText(/No API keys found in .env/i)).toBeInTheDocument();
  });

  it("shows redis mode when provided", () => {
    render(<StatusSidebar providers={["groq"]} lamps={[]} redisMode="local" />);
    expect(screen.getByText(/Redis mode: local/i)).toBeInTheDocument();
  });

  it("shows prepaid balance without a cap warning", () => {
    render(
      <BillingPanel
        billing={{
          mode: "hybrid",
          prepaid_required: true,
          ledger: "file",
          team_id: "team-a",
          prepaid_balance_usdc: 12.5,
          team_daily_spent_usd: 1.2,
          team_daily_cap_usd: 5,
          line_item_totals: { inference_model_call: 1.0, security_injection_scan: 0.2 },
        }}
      />,
    );
    expect(screen.getByText("12.5 USDC")).toBeInTheDocument();
    expect(screen.queryByText("cap reached")).not.toBeInTheDocument();
  });

  it("shows cap reached badge", () => {
    render(
      <BillingPanel
        billing={{
          mode: "wallet",
          prepaid_required: true,
          ledger: "file",
          team_id: "team-a",
          prepaid_balance_usdc: 0,
          team_daily_spent_usd: 3,
          team_daily_cap_usd: 3,
          line_item_totals: {},
        }}
      />,
    );
    expect(screen.getByText("cap reached")).toBeInTheDocument();
  });

  it("shows the Arc deposit address and faucet link", () => {
    render(
      <BillingPanel
        billing={{
          mode: "wallet",
          prepaid_required: true,
          ledger: "arc",
          team_id: "operator",
          prepaid_balance_usdc: 20,
          team_daily_spent_usd: 0,
          line_item_totals: {},
          wallet_address: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
          chain_id: 5042002,
          faucet_url: "https://faucet.circle.com",
        }}
      />,
    );
    expect(screen.getByText("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fund on Circle faucet/i })).toHaveAttribute(
      "href",
      "https://faucet.circle.com",
    );
  });
});
