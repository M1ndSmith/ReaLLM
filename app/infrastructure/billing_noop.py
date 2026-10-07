from __future__ import annotations

from app.application.models import BillingLineItem, BillingStatus, BillingSubject, IdentityQuotas


class NoopBilling:
    def subject_for(self, identity_id: str | None, quotas: IdentityQuotas | None = None) -> BillingSubject:
        team_id = (quotas.team_id if quotas is not None else None) or identity_id
        return BillingSubject(identity_id=identity_id, team_id=team_id)

    def assert_can_spend(
        self,
        subject: BillingSubject,
        estimated_usd: float | None,
        *,
        quotas: IdentityQuotas | None = None,
    ) -> None:
        return None

    def hold(
        self,
        *,
        subject: BillingSubject,
        estimated_usd: float | None,
        idempotency_key: str,
    ) -> str | None:
        return None

    def release(self, hold_id: str | None) -> None:
        return None

    def settle(
        self,
        *,
        hold_id: str | None,
        actual_usd: float | None,
        idempotency_key: str,
        items: list[BillingLineItem] | None = None,
        subject: BillingSubject | None = None,
    ) -> None:
        return None

    def append_usage_event(self, **kwargs) -> None:
        return None

    def list_usage_events(self, *, offset: int = 0, limit: int = 100) -> list[dict]:
        return []

    def status(self, identity_id: str | None = None, quotas: IdentityQuotas | None = None) -> BillingStatus:
        subject = self.subject_for(identity_id, quotas)
        return BillingStatus(
            mode="off",
            prepaid_required=False,
            ledger="none",
            team_id=subject.team_id,
            prepaid_balance_usdc=None,
            team_daily_spent_usd=0.0,
            team_daily_cap_usd=quotas.team_daily_usd_cap if quotas else None,
            line_item_totals={},
        )

    def patch_team_policy(
        self,
        *,
        team_id: str,
        daily_usd_cap: float | None = None,
        prepaid_balance_usdc: float | None = None,
    ) -> dict[str, float | None]:
        return {
            "daily_usd_cap": daily_usd_cap,
            "prepaid_balance_usdc": prepaid_balance_usdc,
        }
