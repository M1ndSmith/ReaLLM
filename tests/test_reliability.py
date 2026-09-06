from __future__ import annotations

import os

from app.reliability import (
    cache_enabled,
    cache_ttl,
    chat_fallback_ids,
    fallback_policy,
    fallback_pool,
    is_chat_model,
    num_retries,
    provider_rpm,
    provider_tpm,
    redis_enabled,
    reliability_status,
    _deployment_params,
    get_router,
)
from app.schemas import ModelInfo
from tests.conftest import FROZEN_CATALOG


def test_same_provider_fallbacks_skip_weak_and_whisper():
    ids = chat_fallback_ids("groq/openai/gpt-oss-20b", FROZEN_CATALOG)
    assert ids == ["groq/openai/gpt-oss-120b"]
    assert "groq/allam-2-7b" not in ids
    assert "openai/gpt-4o-mini" not in ids
    assert "groq/whisper-large-v3" not in fallback_pool(FROZEN_CATALOG)
    assert "groq/meta-llama/llama-guard-4-12b" not in ids
    assert "groq/meta-llama/llama-prompt-guard-2-22m" not in fallback_pool(FROZEN_CATALOG)
    assert fallback_policy() == "same-provider"


def test_retry_only_and_allowlist(monkeypatch):
    monkeypatch.setenv("FALLBACKS", "off")
    assert fallback_policy() == "retry-only"
    assert chat_fallback_ids("groq/openai/gpt-oss-20b", FROZEN_CATALOG) == []
    assert fallback_pool(FROZEN_CATALOG) == []

    monkeypatch.setenv("FALLBACKS", "openai/gpt-4o-mini,groq/allam-2-7b")
    assert fallback_policy() == "allowlist"
    assert chat_fallback_ids("groq/openai/gpt-oss-20b", FROZEN_CATALOG) == [
        "openai/gpt-4o-mini",
        "groq/allam-2-7b",
    ]

    monkeypatch.setenv("FALLBACKS", "gpt-oss-120b")
    assert chat_fallback_ids("groq/openai/gpt-oss-20b", FROZEN_CATALOG) == ["groq/openai/gpt-oss-120b"]


def test_cache_rpm_tpm(monkeypatch):
    assert cache_enabled() is True
    assert cache_ttl() == 120
    monkeypatch.setenv("LITELLM_CACHE", "0")
    monkeypatch.setenv("LITELLM_CACHE_TTL", "30")
    monkeypatch.setenv("LITELLM_NUM_RETRIES", "4")
    assert cache_enabled() is False
    assert cache_ttl() == 30
    assert num_retries() == 4
    assert redis_enabled() is False
    assert not is_chat_model("groq/whisper-large-v3")
    assert not is_chat_model("groq/meta-llama/llama-guard-4-12b")
    assert not is_chat_model("groq/meta-llama/llama-prompt-guard-2-22m")
    assert provider_rpm("groq") == 30
    monkeypatch.setenv("GROQ_RPM", "12")
    assert provider_rpm("groq") == 12
    assert provider_tpm("groq") is None
    monkeypatch.setenv("GROQ_TPM", "15000")
    item = ModelInfo(id="groq/openai/gpt-oss-20b", provider="groq")
    params = _deployment_params(item)
    assert params["tpm"] == 15000
    assert params["rpm"] == 12


def test_get_router_and_status(monkeypatch):
    built = []

    class DummyRouter:
        def __init__(self, **kwargs):
            built.append(kwargs)

    monkeypatch.setattr("app.prompts.ensure_tracing", lambda: None)
    monkeypatch.setattr("app.reliability.Router", DummyRouter)

    first = get_router()
    second = get_router()
    assert first is second
    assert len(built) == 1
    assert built[0]["routing_strategy"] == "simple-shuffle"
    assert built[0]["default_fallbacks"] is None
    assert built[0]["cache_responses"] is True

    status = reliability_status()
    assert status.fallback_policy == "same-provider"
    assert "groq/allam-2-7b" not in status.fallbacks
    assert status.cache_ttl == 120
    assert status.redis is False
    assert os.getenv("REDIS_URL") == ""


def test_invalid_env_and_redis_url(monkeypatch):
    monkeypatch.setenv("LITELLM_NUM_RETRIES", "nope")
    monkeypatch.setenv("GROQ_TPM", "nope")
    monkeypatch.setenv("DEFAULT_TPM", "40")
    assert num_retries() == 2
    assert provider_tpm("groq") == 40
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    assert redis_enabled() is True
    from app.reliability import _redis_kwargs

    assert _redis_kwargs()["redis_url"].startswith("redis://")

