from __future__ import annotations

import os

from tests.conftest import FROZEN_CATALOG

from app.infrastructure.catalog import ProviderCatalog
from app.infrastructure.router import LiteLLMRouterRuntime
from app.schemas import ModelInfo
from app.settings import GatewaySettings


def _router() -> LiteLLMRouterRuntime:
    settings = GatewaySettings()
    return LiteLLMRouterRuntime(settings, ProviderCatalog(settings))


def test_same_provider_fallbacks_skip_weak_and_whisper():
    runtime = _router()
    ids = runtime.chat_fallback_ids("groq/openai/gpt-oss-20b", FROZEN_CATALOG)
    assert ids == ["groq/openai/gpt-oss-120b"]
    assert "groq/allam-2-7b" not in ids
    assert "openai/gpt-4o-mini" not in ids
    assert "groq/whisper-large-v3" not in runtime.fallback_pool(FROZEN_CATALOG)
    assert "groq/meta-llama/llama-guard-4-12b" not in ids
    assert "groq/meta-llama/llama-prompt-guard-2-22m" not in runtime.fallback_pool(FROZEN_CATALOG)
    assert runtime.fallback_policy() == "same-provider"


def test_retry_only_and_allowlist(monkeypatch):
    monkeypatch.setenv("FALLBACKS", "off")
    runtime = _router()
    assert runtime.fallback_policy() == "retry-only"
    assert runtime.chat_fallback_ids("groq/openai/gpt-oss-20b", FROZEN_CATALOG) == []
    assert runtime.fallback_pool(FROZEN_CATALOG) == []

    monkeypatch.setenv("FALLBACKS", "openai/gpt-4o-mini,groq/allam-2-7b")
    runtime = _router()
    assert runtime.fallback_policy() == "allowlist"
    assert runtime.chat_fallback_ids("groq/openai/gpt-oss-20b", FROZEN_CATALOG) == [
        "openai/gpt-4o-mini",
        "groq/allam-2-7b",
    ]

    monkeypatch.setenv("FALLBACKS", "gpt-oss-120b")
    runtime = _router()
    assert runtime.chat_fallback_ids("groq/openai/gpt-oss-20b", FROZEN_CATALOG) == ["groq/openai/gpt-oss-120b"]


def test_cache_rpm_tpm(monkeypatch):
    runtime = _router()
    assert runtime.cache_enabled() is True
    assert runtime.cache_ttl() == 120
    monkeypatch.setenv("LITELLM_CACHE", "0")
    monkeypatch.setenv("LITELLM_CACHE_TTL", "30")
    monkeypatch.setenv("LITELLM_NUM_RETRIES", "4")
    runtime = _router()
    assert runtime.cache_enabled() is False
    assert runtime.cache_ttl() == 30
    assert runtime.num_retries() == 4
    assert runtime.redis_enabled() is False
    from app.infrastructure.catalog import is_chat_model

    assert not is_chat_model("groq/whisper-large-v3")
    assert not is_chat_model("groq/meta-llama/llama-guard-4-12b")
    assert not is_chat_model("groq/meta-llama/llama-prompt-guard-2-22m")
    assert runtime.provider_rpm("groq") == 30
    monkeypatch.setenv("GROQ_RPM", "12")
    runtime = _router()
    assert runtime.provider_rpm("groq") == 12
    assert runtime.provider_tpm("groq") is None
    monkeypatch.setenv("GROQ_TPM", "15000")
    runtime = _router()
    item = ModelInfo(id="groq/openai/gpt-oss-20b", provider="groq")
    params = runtime._deployment_params(item)
    assert params["tpm"] == 15000
    assert params["rpm"] == 12


def test_get_router_and_status(monkeypatch):
    built = []

    class DummyRouter:
        def __init__(self, **kwargs):
            built.append(kwargs)

    runtime = _router()
    monkeypatch.setattr("app.infrastructure.router.Router", DummyRouter)
    monkeypatch.setattr(runtime, "_tracing", lambda: None)

    first = runtime.get_router()
    second = runtime.get_router()
    assert first is second
    assert len(built) == 1
    assert built[0]["routing_strategy"] == "simple-shuffle"
    assert built[0]["default_fallbacks"] is None
    assert built[0]["cache_responses"] is True

    status = runtime.reliability_status()
    assert status.fallback_policy == "same-provider"
    assert "groq/allam-2-7b" not in status.fallbacks
    assert status.cache_ttl == 120
    assert status.redis is False
    assert os.getenv("REDIS_URL") == ""


def test_invalid_env_and_redis_url(monkeypatch):
    monkeypatch.setenv("LITELLM_NUM_RETRIES", "nope")
    monkeypatch.setenv("GROQ_TPM", "nope")
    monkeypatch.setenv("DEFAULT_TPM", "40")
    runtime = _router()
    assert runtime.num_retries() == 2
    assert runtime.provider_tpm("groq") == 40
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    runtime = _router()
    assert runtime.redis_enabled() is True
    assert runtime._redis_kwargs()["redis_url"].startswith("redis://")


def test_independent_runtimes_do_not_share_router(tmp_path):
    from tests.factories import runtime

    a = runtime(tmp_path / "a")
    b = runtime(tmp_path / "b")
    assert a.router is not b.router
    assert a.catalog is not b.catalog
    a.catalog._cache = (0.0, [])
    assert b.catalog._cache is None
