from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from litellm.exceptions import APIError, AuthenticationError, BadRequestError, RateLimitError

from app.application.errors import (
    BudgetExceededError,
    GuardBlockedError,
    GuardConfigError,
    InputTooLargeError,
    MemoryConfigError,
    PiiConfigError,
    UnknownModelError,
    UnknownPromptError,
)
from app.structured import SchemaError


@dataclass(frozen=True)
class ErrorDescriptor:
    status: int | None
    payload: dict
    http: bool


def guard_blocked_detail(exc: GuardBlockedError) -> dict:
    return {
        "error": str(exc),
        "scanner": exc.scanner,
        "categories": exc.categories,
        "category_names": exc.category_names,
    }


def classify(exc: BaseException) -> ErrorDescriptor:
    if isinstance(exc, UnknownModelError):
        return ErrorDescriptor(400, {"error": str(exc)}, True)
    if isinstance(exc, UnknownPromptError):
        return ErrorDescriptor(400, {"error": str(exc)}, True)
    if isinstance(exc, InputTooLargeError):
        return ErrorDescriptor(400, {"error": str(exc)}, True)
    if isinstance(exc, BudgetExceededError):
        return ErrorDescriptor(402, {"error": str(exc)}, True)
    if isinstance(exc, GuardBlockedError):
        return ErrorDescriptor(400, guard_blocked_detail(exc), True)
    if isinstance(exc, SchemaError):
        detail: dict = {"error": str(exc)}
        if exc.path:
            detail["path"] = exc.path
        return ErrorDescriptor(400, detail, True)
    if isinstance(exc, GuardConfigError):
        return ErrorDescriptor(503, {"error": str(exc)}, True)
    if isinstance(exc, PiiConfigError):
        return ErrorDescriptor(503, {"error": str(exc)}, True)
    if isinstance(exc, MemoryConfigError):
        return ErrorDescriptor(503, {"error": str(exc)}, True)
    if isinstance(exc, AuthenticationError):
        return ErrorDescriptor(401, {"error": str(exc)}, True)
    if isinstance(exc, RateLimitError):
        return ErrorDescriptor(429, {"error": str(exc)}, True)
    if isinstance(exc, BadRequestError):
        return ErrorDescriptor(400, {"error": str(exc)}, True)
    if isinstance(exc, APIError):
        return ErrorDescriptor(502, {"error": str(exc)}, True)
    return ErrorDescriptor(None, {"error": str(exc)}, False)


def as_http(exc: BaseException) -> HTTPException | None:
    mapped = classify(exc)
    if not mapped.http or mapped.status is None:
        return None
    if isinstance(exc, GuardBlockedError):
        return HTTPException(status_code=mapped.status, detail=mapped.payload)
    if isinstance(exc, SchemaError):
        return HTTPException(status_code=mapped.status, detail=mapped.payload)
    return HTTPException(
        status_code=mapped.status,
        detail=mapped.payload["error"] if "error" in mapped.payload and len(mapped.payload) == 1 else mapped.payload,
    )


def raise_chat(exc: BaseException) -> None:
    mapped = as_http(exc)
    if mapped is not None:
        raise mapped from exc
    raise exc


def native_sse_payload(exc: BaseException) -> dict:
    mapped = classify(exc)
    if isinstance(exc, GuardBlockedError):
        return mapped.payload
    if isinstance(exc, SchemaError):
        return mapped.payload
    return {"error": str(exc)}


def openai_error_payload(exc: BaseException) -> dict:
    payload: dict = {"error": {"message": str(exc), "type": type(exc).__name__}}
    if isinstance(exc, GuardBlockedError):
        payload["error"]["type"] = "guard_blocked"
        payload["scanner"] = exc.scanner
        payload["categories"] = exc.categories
        payload["category_names"] = exc.category_names
    return payload
