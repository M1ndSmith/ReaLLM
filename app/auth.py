from __future__ import annotations

import hmac
import logging
import os

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

GATEWAY_UNAUTHORIZED = {"error": "gateway_unauthorized"}


def gateway_key() -> str:
    return (os.getenv("GATEWAY_API_KEY") or "").strip()


def auth_required() -> bool:
    return bool(gateway_key())


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
    expected = gateway_key()
    if not expected:
        return
    provided = _provided_key(request)
    if provided is None or not _keys_match(provided, expected):
        raise HTTPException(status_code=401, detail=GATEWAY_UNAUTHORIZED)


def require_configured_gateway_key() -> None:
    if not gateway_key():
        raise HTTPException(status_code=403, detail={"error": "gateway_key_required"})


def log_auth_status() -> None:
    if auth_required():
        logger.info("gateway auth: on")
        return
    logger.warning(
        "gateway auth: off; anyone who can reach this port can call the API. "
        "Compose publishes 8000:8000 — set GATEWAY_API_KEY when the port is network-reachable."
    )
