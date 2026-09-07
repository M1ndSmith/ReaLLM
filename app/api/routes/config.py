from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.auth import require_configured_gateway_key
from app.api.dependencies import get_runtime
from app.container import GatewayRuntime
from app.schemas import ConfigPatch, ConfigResponse

router = APIRouter()


@router.get("/config", response_model=ConfigResponse)
async def get_config(runtime: GatewayRuntime = Depends(get_runtime)) -> ConfigResponse:
    return ConfigResponse.model_validate(runtime.flags.config_payload(auth_required=runtime.settings.auth_required()))


@router.patch("/config", response_model=ConfigResponse)
async def patch_config(body: ConfigPatch, runtime: GatewayRuntime = Depends(get_runtime)) -> ConfigResponse:
    require_configured_gateway_key(runtime)
    layers = runtime.flags.apply_layer_patch(body.layers.model_dump())
    payload = runtime.flags.config_payload(auth_required=runtime.settings.auth_required())
    payload["layers"] = {
        "memory": layers.memory,
        "pii": layers.pii,
        "guard": layers.guard,
        "guard_injection": layers.guard_injection,
        "guard_content": layers.guard_content,
    }
    return ConfigResponse.model_validate(payload)
