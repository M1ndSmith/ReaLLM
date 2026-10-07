import { describe, expect, it } from "vitest";

import { designTokens } from "@/lib/designTokens";

describe("designTokens", () => {
  it("exports stable foundational scales", () => {
    expect(designTokens.color.bg).toMatch(/^#/);
    expect(designTokens.space.md).toBeGreaterThan(0);
    expect(designTokens.radius.md).toBeGreaterThan(0);
    expect(designTokens.shadow.card).toContain("rgba");
  });
});
