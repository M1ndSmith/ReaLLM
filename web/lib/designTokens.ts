export const designTokens = {
  color: {
    background: "oklch(0.145 0 0)",
    card: "oklch(0.205 0 0)",
    secondary: "oklch(0.269 0 0)",
    text: "oklch(0.985 0 0)",
    textMuted: "oklch(0.708 0 0)",
    line: "oklch(1 0 0 / 10%)",
    input: "oklch(1 0 0 / 15%)",
    primary: "oklch(0.922 0 0)",
    primaryText: "oklch(0.205 0 0)",
    danger: "oklch(0.704 0.191 22.216)",
    on: "oklch(0.696 0.17 162.48)",
  },
  space: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    control: 8,
    base: 10,
    card: 14,
  },
  shadow: {
    card: "none",
  },
} as const;

export type DesignTokens = typeof designTokens;
