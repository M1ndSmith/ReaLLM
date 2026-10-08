import type { ReactNode } from "react";

type Tone = "info" | "warn" | "danger";

export function Alert({ children, tone = "info" }: { children: ReactNode; tone?: Tone }) {
  return <div className={`alert alert-${tone}`}>{children}</div>;
}
