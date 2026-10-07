import type { ReactNode } from "react";

type Tone = "neutral" | "good" | "warn" | "danger";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}
