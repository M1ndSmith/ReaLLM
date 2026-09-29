"use client";

import type { OperatorState } from "@/hooks/useOperatorState";

type Props = {
  state: OperatorState;
  runtimeError: string | null;
};

export function OperatorBanner({ state, runtimeError }: Props) {
  if (!state.message && !runtimeError) return null;
  return (
    <div className="banner hint" role="status" aria-live="polite">
      {runtimeError ? `Action failed: ${runtimeError}` : state.message}
    </div>
  );
}

