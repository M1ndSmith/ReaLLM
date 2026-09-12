from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from app.api.dependencies import get_runtime, require_scopes
from app.container import GatewayRuntime

router = APIRouter(dependencies=[Depends(require_scopes("read"))])


@router.get("/metrics", response_class=PlainTextResponse)
async def metrics(runtime: GatewayRuntime = Depends(get_runtime)) -> PlainTextResponse:
    if not runtime.metrics.enabled():
        raise HTTPException(status_code=404, detail="Metrics are disabled.")
    return PlainTextResponse(runtime.metrics.render_prometheus(), media_type="text/plain; version=0.0.4")
