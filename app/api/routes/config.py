from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.api.auth import require_configured_gateway_key
from app.api.dependencies import get_runtime, require_scopes
from app.application.models import GatewayIdentity
from app.container import GatewayRuntime
from app.schemas import ConfigPatch, ConfigResponse

router = APIRouter()


@router.get("/config", response_model=ConfigResponse)
async def get_config(request: Request, runtime: GatewayRuntime = Depends(get_runtime)) -> ConfigResponse:
    payload = runtime.flags.config_payload(auth_required=runtime.identities.auth_enabled())
    payload["identity"] = _identity_payload(getattr(request.state, "gateway_identity", None))
    return ConfigResponse.model_validate(payload)


@router.patch("/config", response_model=ConfigResponse, dependencies=[Depends(require_scopes("config"))])
async def patch_config(
    body: ConfigPatch, request: Request, runtime: GatewayRuntime = Depends(get_runtime)
) -> ConfigResponse:
    require_configured_gateway_key(runtime)
    layers = runtime.flags.apply_layer_patch(body.layers.model_dump())
    payload = runtime.flags.config_payload(auth_required=runtime.identities.auth_enabled())
    payload["layers"] = {
        "memory": layers.memory,
        "pii": layers.pii,
        "guard": layers.guard,
        "guard_injection": layers.guard_injection,
        "guard_content": layers.guard_content,
    }
    payload["identity"] = _identity_payload(getattr(request.state, "gateway_identity", None))
    return ConfigResponse.model_validate(payload)


def _identity_payload(identity: GatewayIdentity | None) -> dict | None:
    if identity is None:
        return None
    return {
        "id": identity.id,
        "scopes": list(identity.scopes),
        "label": identity.label,
        "created_at": identity.created_at,
        "revoked_at": identity.revoked_at,
        "last_used_at": identity.last_used_at,
        "quotas": {
            "daily_token_budget": identity.quotas.daily_token_budget,
            "daily_usd_budget": identity.quotas.daily_usd_budget,
            "rpm": identity.quotas.rpm_limit,
        },
    }
