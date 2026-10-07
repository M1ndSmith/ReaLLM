import { describe, expect, it } from "vitest";

import { budgetText, dominantSpendDriver, formatCost, formatTokens, formatUsdc, groupedFeatureSpend } from "@/lib/formatters";

describe("formatTokens", () => {
  it("prefers total_tokens and otherwise sums parts", () => {
    expect(formatTokens(null)).toBe("");
    expect(formatTokens({ total_tokens: 12 })).toBe("12 tok");
    expect(formatTokens({ prompt_tokens: 3, completion_tokens: 4 })).toBe("7 tok");
    expect(formatTokens({ total_tokens: 0 })).toBe("");
  });
});

describe("formatCost", () => {
  it("formats finite costs without trailing zeros", () => {
    expect(formatCost(null)).toBe("");
    expect(formatCost(0)).toBe("$0");
    expect(formatCost(0.0012)).toBe("$0.0012");
    expect(formatCost("nope")).toBe("");
  });
});

describe("formatUsdc", () => {
  it("formats USDC balances", () => {
    expect(formatUsdc(null)).toBe("");
    expect(formatUsdc(0)).toBe("0 USDC");
    expect(formatUsdc(12.5)).toBe("12.5 USDC");
  });
});

describe("billing spend helpers", () => {
  it("groups line items and finds dominant driver", () => {
    const grouped = groupedFeatureSpend({
      inference_model_call: 0.4,
      security_injection_scan: 0.02,
      memory_retrieve_attach: 0.03,
      pii_redaction: 0.01,
    });
    expect(grouped.model).toBe(0.4);
    expect(grouped.security).toBe(0.02);
    expect(grouped.memory).toBe(0.03);
    expect(grouped.pii).toBe(0.01);
    expect(dominantSpendDriver({ inference_model_call: 0.4, memory_retrieve_attach: 0.03 })).toEqual({
      kind: "inference_model_call",
      usd: 0.4,
    });
    expect(dominantSpendDriver({})).toBeNull();
  });
});

describe("budgetText", () => {
  it("shows a dash when budget is missing", () => {
    expect(budgetText(null)).toBe("budget —");
    expect(budgetText({ budget: { daily_tokens: 10, daily_token_limit: null } })).toBe("10 tok");
    expect(budgetText({ budget: { daily_tokens: 10, daily_token_limit: 100 } })).toBe("10 / 100 tok");
  });
});
