from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass

_REQUEST_ID: ContextVar[str | None] = ContextVar("realmm_request_id", default=None)
_IDENTITY_ID: ContextVar[str | None] = ContextVar("realmm_identity_id", default=None)


@dataclass(frozen=True)
class RequestContextTokens:
    request: Token[str | None]
    identity: Token[str | None]


def get_request_id() -> str | None:
    return _REQUEST_ID.get()


def get_identity_id() -> str | None:
    return _IDENTITY_ID.get()


def set_request_id(value: str | None) -> Token[str | None]:
    return _REQUEST_ID.set(value)


def set_identity_id(value: str | None) -> Token[str | None]:
    return _IDENTITY_ID.set(value)


def bind(request_id: str | None, identity_id: str | None = None) -> RequestContextTokens:
    return RequestContextTokens(request=set_request_id(request_id), identity=set_identity_id(identity_id))


def reset(tokens: RequestContextTokens) -> None:
    _IDENTITY_ID.reset(tokens.identity)
    _REQUEST_ID.reset(tokens.request)
