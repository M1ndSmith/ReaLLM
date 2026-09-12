from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_runtime, require_scopes
from app.container import GatewayRuntime

router = APIRouter(dependencies=[Depends(require_scopes("read"))])


@router.get("/ready")
async def ready(runtime: GatewayRuntime = Depends(get_runtime)) -> dict:
    providers_ok = bool(runtime.catalog.detected_providers())
    redis_configured = runtime.redis_health.configured()
    redis_reachable = runtime.redis_health.reachable() if redis_configured else True
    allow_redis_degraded = runtime.settings.readiness_allow_redis_degraded_on()
    redis_ok = redis_reachable or (redis_configured and allow_redis_degraded)
    checks = {"providers": providers_ok, "redis": redis_ok}
    payload = {
        "ready": bool(providers_ok and redis_ok),
        "checks": checks,
        "redis_mode": runtime.redis_health.mode(),
    }
    if payload["ready"]:
        return payload
    raise HTTPException(status_code=503, detail=payload)
