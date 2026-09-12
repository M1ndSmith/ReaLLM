from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.errors import classify, native_sse_payload, openai_error_payload, raise_chat
from app.application.errors import GuardBlockedError, IdentityRateLimitError, MemoryConfigError
from app.structured import SchemaError


def test_identity_rate_limit_is_429():
    mapped = classify(IdentityRateLimitError("too fast"))
    assert mapped.status == 429
    with pytest.raises(HTTPException) as exc:
        raise_chat(IdentityRateLimitError("too fast"))
    assert exc.value.status_code == 429


def test_memory_config_is_503():
    mapped = classify(MemoryConfigError("no mem0"))
    assert mapped.status == 503


def test_unmapped_exception_is_reraised():
    with pytest.raises(RuntimeError, match="boom"):
        raise_chat(RuntimeError("boom"))


def test_schema_and_guard_payloads():
    schema = SchemaError("bad json", path="$.a")
    assert native_sse_payload(schema)["path"] == "$.a"
    blocked = GuardBlockedError("injection", "Prompt injection blocked.")
    payload = openai_error_payload(blocked)
    assert payload["error"]["type"] == "guard_blocked"
    assert payload["scanner"] == "injection"
