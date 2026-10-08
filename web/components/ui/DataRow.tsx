import type { ReactNode } from "react";

export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="data-row">
      <span className="data-label">{label}</span>
      <span className="data-value">{value}</span>
    </div>
  );
}
