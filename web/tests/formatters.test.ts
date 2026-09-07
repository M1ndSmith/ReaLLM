import { describe, expect, it } from "vitest";

import { budgetText, formatCost, formatTokens } from "@/lib/formatters";

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

describe("budgetText", () => {
  it("shows a dash when budget is missing", () => {
    expect(budgetText(null)).toBe("budget —");
    expect(budgetText({ budget: { daily_tokens: 10, daily_token_limit: null } })).toBe("10 tok");
    expect(budgetText({ budget: { daily_tokens: 10, daily_token_limit: 100 } })).toBe("10 / 100 tok");
  });
});
