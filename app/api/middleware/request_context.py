from __future__ import annotations

import re
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.infrastructure.request_context import RequestContextTokens, bind, reset
from app.settings import GatewaySettings

_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,128}$")


def _request_id_from_headers(request: Request) -> str:
    for name in ("x-request-id", "x-correlation-id"):
        value = (request.headers.get(name) or "").strip()
        if value and _VALID_REQUEST_ID.fullmatch(value):
            return value
    return f"req_{uuid.uuid4().hex[:16]}"


def metric_route_label(request: Request) -> str:
    route = request.scope.get("route")
    template = getattr(route, "path", None)
    if not isinstance(template, str) or not template.strip():
        return "unmatched"
    cleaned = template.strip("/").replace("/", "_").replace("{", "").replace("}", "")
    return cleaned or "root"


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: GatewaySettings):
        super().__init__(app)
        self._settings = settings

    async def dispatch(self, request: Request, call_next):
        request_id = _request_id_from_headers(request) if self._settings.request_id_on() else None
        request.state.request_id = request_id
        tokens: RequestContextTokens = bind(request_id, None)
        try:
            response = await call_next(request)
        finally:
            reset(tokens)
        runtime = getattr(request.app.state, "runtime", None)
        metrics = getattr(runtime, "metrics", None)
        identity = getattr(request.state, "gateway_identity", None)
        identity_id = getattr(identity, "id", None)
        if metrics is not None and metrics.enabled():
            path = metric_route_label(request)
            metrics.incr("realmm_http_requests_total")
            metrics.incr(f"realmm_http_requests_total_{request.method.lower()}_{path}_{response.status_code}")
            if isinstance(identity_id, str) and identity_id:
                metrics.incr("realmm_identity_requests_total")
                if request.url.path in {"/chat", "/v1/chat/completions"}:
                    metrics.incr("realmm_chat_requests_total")
                if request.url.path == "/v1/embeddings":
                    metrics.incr("realmm_embedding_requests_total")
        if request_id:
            response.headers["X-Request-ID"] = request_id
        if isinstance(identity_id, str) and identity_id:
            response.headers["X-Gateway-Key-Id"] = identity_id
        return response
