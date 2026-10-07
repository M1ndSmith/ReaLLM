import type { ReactNode } from "react";

type Tone = "info" | "warn" | "danger";

export function Alert({ children, tone = "info" }: { children: ReactNode; tone?: Tone }) {
  return <div className={`ui-alert ui-alert-${tone}`}>{children}</div>;
}
