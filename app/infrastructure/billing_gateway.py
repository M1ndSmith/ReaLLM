from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class BillingGatewayReconcileResult:
    ok: bool
    mode: str
    detail: str


class BillingGateway:
    """Reconcile prepaid balance.

    Ledger mode reports the local file. Arc mode reads testnet USDC and writes
    the funded team's available balance (on-chain minus lifetime settled).
    """

    def __init__(self, *, mode: str = "ledger", store: Any | None = None):
        self._mode = mode
        self._store = store

    def reconcile(self) -> BillingGatewayReconcileResult:
        if self._mode == "ledger":
            return BillingGatewayReconcileResult(
                ok=True, mode=self._mode, detail="Ledger-authoritative reconciliation."
            )
        if self._mode == "arc":
            if self._store is None or not hasattr(self._store, "refresh_chain_balance"):
                return BillingGatewayReconcileResult(ok=False, mode=self._mode, detail="Arc wallet is not configured.")
            available = float(self._store.refresh_chain_balance())
            return BillingGatewayReconcileResult(
                ok=True,
                mode=self._mode,
                detail=f"Arc USDC available {available:.6f}.",
            )
        return BillingGatewayReconcileResult(ok=False, mode=self._mode, detail="Unknown reconciliation mode.")
