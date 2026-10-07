"use client";

import { Alert } from "@/components/ui";
import type { OperatorState } from "@/hooks/useOperatorState";

type Props = {
  state: OperatorState;
  runtimeError: string | null;
  billingHint?: string | null;
};

export function OperatorBanner({ state, runtimeError, billingHint }: Props) {
  if (!state.message && !runtimeError && !billingHint) return null;
  const body = runtimeError ? `Action failed: ${runtimeError}` : billingHint || state.message;
  const tone = runtimeError ? "danger" : billingHint ? "warn" : "info";
  return (
    <Alert tone={tone}>
      <div className="hint" role="status" aria-live="polite">
        {body}
      </div>
    </Alert>
  );
}

