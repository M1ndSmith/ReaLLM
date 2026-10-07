export const designTokens = {
  color: {
    bg: "#0a0f1a",
    panel: "#111a2b",
    panelRaised: "#17233a",
    text: "#e7edf9",
    textMuted: "#94a3bd",
    line: "rgba(148, 163, 189, 0.2)",
    accent: "#4f9dff",
    success: "#37d39a",
    warning: "#ffbe5b",
    danger: "#ff6f6f",
  },
  space: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    pill: 999,
  },
  shadow: {
    card: "0 8px 24px rgba(5, 8, 15, 0.35)",
  },
} as const;

export type DesignTokens = typeof designTokens;
