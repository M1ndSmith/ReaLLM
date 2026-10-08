import { describe, expect, it } from "vitest";

import { designTokens } from "@/lib/designTokens";

describe("designTokens", () => {
  it("matches the neutral dark dashboard scale", () => {
    expect(designTokens.color.background).toBe("oklch(0.145 0 0)");
    expect(designTokens.color.card).toBe("oklch(0.205 0 0)");
    expect(designTokens.color.text).toBe("oklch(0.985 0 0)");
    expect(designTokens.color.textMuted).toBe("oklch(0.708 0 0)");
    expect(designTokens.color.line).toBe("oklch(1 0 0 / 10%)");
    expect(designTokens.color.on).toBe("oklch(0.696 0.17 162.48)");
    expect(designTokens.color.danger).toBe("oklch(0.704 0.191 22.216)");
    expect(designTokens.space).toEqual({ xs: 8, sm: 12, md: 16, lg: 24, xl: 32 });
    expect(designTokens.radius).toEqual({ control: 8, base: 10, card: 14 });
    expect(designTokens.shadow.card).toBe("none");
  });
});
