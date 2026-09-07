from __future__ import annotations

import hmac
import logging

from fastapi import HTTPException, Request

from app.container import GatewayRuntime

logger = logging.getLogger(__name__)

GATEWAY_UNAUTHORIZED = {"error": "gateway_unauthorized"}


def _keys_match(provided: str, expected: str) -> bool:
    left = provided.encode("utf-8")
    right = expected.encode("utf-8")
    size = max(len(left), len(right), 1)
    return hmac.compare_digest(left.ljust(size, b"\0"), right.ljust(size, b"\0"))


def _provided_key(request: Request) -> str | None:
    header = (request.headers.get("authorization") or "").strip()
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        return token or None
    api_key = (request.headers.get("x-api-key") or "").strip()
    return api_key or None


def require_gateway_auth(request: Request) -> None:
    runtime: GatewayRuntime = request.app.state.runtime
    expected = runtime.settings.gateway_key()
    if not expected:
        return
    provided = _provided_key(request)
    if provided is None or not _keys_match(provided, expected):
        raise HTTPException(status_code=401, detail=GATEWAY_UNAUTHORIZED)


def require_configured_gateway_key(runtime: GatewayRuntime) -> None:
    if not runtime.settings.gateway_key():
        raise HTTPException(status_code=403, detail={"error": "gateway_key_required"})
