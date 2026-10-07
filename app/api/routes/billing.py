from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import bound_identity_id, get_runtime, require_scopes
from app.api.errors import raise_chat
from app.application.errors import BillingUnavailableError
from app.container import GatewayRuntime
from app.schemas import BillingStatusResponse, BillingUsagePage, TeamBillingPolicy

router = APIRouter()


@router.get("/billing/status", response_model=BillingStatusResponse, dependencies=[Depends(require_scopes("read"))])
async def billing_status(
    runtime: GatewayRuntime = Depends(get_runtime),
    identity_id: str | None = Depends(bound_identity_id),
) -> BillingStatusResponse:
    quotas = runtime.identities.quotas_for(identity_id)
    try:
        status = runtime.billing.status(identity_id=identity_id, quotas=quotas)
    except BillingUnavailableError as exc:
        raise_chat(exc)
        raise
    return BillingStatusResponse(
        mode=status.mode,
        prepaid_required=status.prepaid_required,
        ledger=status.ledger,
        team_id=status.team_id,
        prepaid_balance_usdc=status.prepaid_balance_usdc,
        team_daily_spent_usd=status.team_daily_spent_usd,
        team_daily_cap_usd=status.team_daily_cap_usd,
        line_item_totals=status.line_item_totals,
        wallet_address=status.wallet_address,
        chain_id=status.chain_id,
        faucet_url=status.faucet_url,
    )


@router.get("/billing/usage", response_model=BillingUsagePage, dependencies=[Depends(require_scopes("read"))])
async def billing_usage(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    runtime: GatewayRuntime = Depends(get_runtime),
) -> BillingUsagePage:
    rows = runtime.billing_audit.list_usage_events(offset=offset, limit=limit)
    total = runtime.billing_audit.count()
    return BillingUsagePage(items=rows, total=total, offset=offset, limit=limit)


@router.get("/billing/teams/{team_id}", response_model=TeamBillingPolicy, dependencies=[Depends(require_scopes("admin"))])
async def get_team_policy(
    team_id: str,
    runtime: GatewayRuntime = Depends(get_runtime),
) -> TeamBillingPolicy:
    patched = runtime.billing.patch_team_policy(team_id=team_id)
    return TeamBillingPolicy(
        team_id=team_id,
        daily_usd_cap=patched.get("daily_usd_cap"),
        prepaid_balance_usdc=patched.get("prepaid_balance_usdc"),
        prepaid_required=None,
    )


@router.patch("/billing/teams/{team_id}", response_model=TeamBillingPolicy, dependencies=[Depends(require_scopes("admin"))])
async def patch_team_policy(
    team_id: str,
    body: TeamBillingPolicy,
    runtime: GatewayRuntime = Depends(get_runtime),
) -> TeamBillingPolicy:
    patched = runtime.billing.patch_team_policy(
        team_id=team_id,
        daily_usd_cap=body.daily_usd_cap,
        prepaid_balance_usdc=body.prepaid_balance_usdc,
    )
    return TeamBillingPolicy(
        team_id=team_id,
        daily_usd_cap=patched.get("daily_usd_cap"),
        prepaid_balance_usdc=patched.get("prepaid_balance_usdc"),
        prepaid_required=body.prepaid_required,
    )


@router.post("/billing/reconcile", dependencies=[Depends(require_scopes("admin"))])
async def billing_reconcile(runtime: GatewayRuntime = Depends(get_runtime)) -> dict:
    try:
        result = runtime.billing_gateway.reconcile()
    except BillingUnavailableError as exc:
        raise_chat(exc)
        raise
    return {"ok": result.ok, "mode": result.mode, "detail": result.detail}

