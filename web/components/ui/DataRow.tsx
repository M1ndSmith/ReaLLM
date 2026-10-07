import type { ReactNode } from "react";

export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ui-data-row">
      <span className="ui-data-label">{label}</span>
      <span className="ui-data-value">{value}</span>
    </div>
  );
}
