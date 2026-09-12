from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request

from app.container import GatewayRuntime


def get_runtime(request: Request) -> GatewayRuntime:
    return request.app.state.runtime


def bound_identity_id(request: Request) -> str | None:
    identity = getattr(request.state, "gateway_identity", None)
    return getattr(identity, "id", None) if identity is not None else None


def require_scopes(*scopes: str) -> Callable[[Request, GatewayRuntime], None]:
    required = tuple(scope.strip() for scope in scopes if scope.strip())

    def _check(request: Request, runtime: GatewayRuntime = Depends(get_runtime)) -> None:
        identity = getattr(request.state, "gateway_identity", None)
        if identity is None:
            if runtime.identities.auth_enabled():
                raise HTTPException(status_code=401, detail={"error": "gateway_unauthorized"})
            return
        held = set(getattr(identity, "scopes", ()) or ())
        if required and held.isdisjoint(required):
            raise HTTPException(
                status_code=403,
                detail={"error": "forbidden", "required_scope": required[0]},
            )

    return _check
