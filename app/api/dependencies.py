from __future__ import annotations

from fastapi import Request

from app.container import GatewayRuntime


def get_runtime(request: Request) -> GatewayRuntime:
    return request.app.state.runtime
