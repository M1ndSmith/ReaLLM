from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import get_runtime, require_scopes
from app.application.models import IdentityQuotas
from app.container import GatewayRuntime
from app.schemas import GatewayKeyCreate, GatewayKeyCreated, GatewayKeyListResponse, GatewayKeyPatch, IdentityPublic

router = APIRouter()


def _identity_to_public(item: dict) -> IdentityPublic:
    return IdentityPublic.model_validate(item)


def _identity_response(identity) -> IdentityPublic:
    return IdentityPublic(
        id=identity.id,
        scopes=list(identity.scopes),
        label=identity.label,
        created_at=identity.created_at,
        revoked_at=identity.revoked_at,
        last_used_at=identity.last_used_at,
        quotas={
            "daily_token_budget": identity.quotas.daily_token_budget,
            "daily_usd_budget": identity.quotas.daily_usd_budget,
            "rpm": identity.quotas.rpm_limit,
        },
    )


@router.get("/admin/keys", response_model=GatewayKeyListResponse, dependencies=[Depends(require_scopes("admin"))])
async def list_keys(
    include_revoked: bool = Query(False),
    runtime: GatewayRuntime = Depends(get_runtime),
) -> GatewayKeyListResponse:
    rows = runtime.identities.public_payload(include_revoked=include_revoked)
    return GatewayKeyListResponse(keys=[_identity_to_public(row) for row in rows])


@router.post("/admin/keys", response_model=GatewayKeyCreated, dependencies=[Depends(require_scopes("admin"))])
async def create_key(body: GatewayKeyCreate, runtime: GatewayRuntime = Depends(get_runtime)) -> GatewayKeyCreated:
    quotas = body.quotas
    try:
        identity, secret = runtime.identities.create(
            key_id=body.key_id,
            scopes=body.scopes,
            label=body.label,
            secret=body.secret,
            quotas=IdentityQuotas(
                daily_token_budget=quotas.daily_token_budget if quotas else None,
                daily_usd_budget=quotas.daily_usd_budget if quotas else None,
                rpm_limit=quotas.rpm if quotas else None,
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return GatewayKeyCreated(key=_identity_response(identity), secret=secret)


@router.patch("/admin/keys/{key_id}", response_model=IdentityPublic, dependencies=[Depends(require_scopes("admin"))])
async def patch_key(
    key_id: str, body: GatewayKeyPatch, runtime: GatewayRuntime = Depends(get_runtime)
) -> IdentityPublic:
    quotas = body.quotas
    try:
        identity = runtime.identities.patch(
            key_id=key_id,
            scopes=body.scopes,
            label=body.label,
            revoked=body.revoked,
            quotas=IdentityQuotas(
                daily_token_budget=quotas.daily_token_budget if quotas else None,
                daily_usd_budget=quotas.daily_usd_budget if quotas else None,
                rpm_limit=quotas.rpm if quotas else None,
            )
            if quotas is not None
            else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _identity_response(identity)


@router.delete("/admin/keys/{key_id}", response_model=IdentityPublic, dependencies=[Depends(require_scopes("admin"))])
async def revoke_key(key_id: str, runtime: GatewayRuntime = Depends(get_runtime)) -> IdentityPublic:
    try:
        identity = runtime.identities.revoke(key_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _identity_response(identity)
