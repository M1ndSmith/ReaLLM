from __future__ import annotations

import hashlib
from dataclasses import dataclass

from app.application.models import BillingLineItem, BillingSubject, IdentityQuotas
from app.application.ports import BillingEntitlementPort, BillingHoldPort, BillingSettlementPort, UsageAuditPort


@dataclass(frozen=True)
class BillingReservation:
    hold_id: str | None
    subject: BillingSubject
    idempotency_key: str


class BillingCoordinator:
    def __init__(
        self,
        *,
        entitlement: BillingEntitlementPort,
        holds: BillingHoldPort,
        settlement: BillingSettlementPort,
        audit: UsageAuditPort,
    ):
        self._entitlement = entitlement
        self._holds = holds
        self._settlement = settlement
        self._audit = audit

    @staticmethod
    def idempotency_key(
        *,
        identity_id: str | None,
        request_id: str | None,
        route: str,
        turn_index: int = 0,
    ) -> str:
        base = f"{identity_id or '-'}|{request_id or '-'}|{route}|{turn_index}"
        digest = hashlib.sha256(base.encode("utf-8")).hexdigest()
        return f"bill:{digest[:32]}"

    def pre_authorize(
        self,
        *,
        identity_id: str | None,
        quotas: IdentityQuotas | None,
        estimated_usd: float | None,
        request_id: str | None,
        route: str,
        turn_index: int = 0,
    ) -> BillingReservation:
        subject = self._entitlement.subject_for(identity_id, quotas)
        self._entitlement.assert_can_spend(subject, estimated_usd, quotas=quotas)
        key = self.idempotency_key(identity_id=identity_id, request_id=request_id, route=route, turn_index=turn_index)
        hold_id = self._holds.hold(subject=subject, estimated_usd=estimated_usd, idempotency_key=key)
        return BillingReservation(hold_id=hold_id, subject=subject, idempotency_key=key)

    def settle(
        self,
        *,
        reservation: BillingReservation | None,
        model: str,
        route: str,
        actual_usd: float | None,
        items: list[BillingLineItem],
        status: str,
        reason: str | None = None,
    ) -> None:
        if reservation is None:
            return
        total = max(0.0, float(actual_usd or 0.0))
        self._settlement.settle(
            hold_id=reservation.hold_id,
            actual_usd=total,
            idempotency_key=reservation.idempotency_key,
            items=items,
            subject=reservation.subject,
        )
        self._audit.append_usage_event(
            idempotency_key=reservation.idempotency_key,
            subject=reservation.subject,
            hold_id=reservation.hold_id,
            model=model,
            route=route,
            items=items,
            total_usd=total,
            status=status,
            reason=reason,
        )

    def release(self, reservation: BillingReservation | None) -> None:
        if reservation is None:
            return
        self._holds.release(reservation.hold_id)

