from __future__ import annotations

from pathlib import Path

import pytest

from app.infrastructure.catalog import ProviderCatalog
from app.schemas import ModelInfo

FROZEN_CATALOG = [
    ModelInfo(id="groq/openai/gpt-oss-20b", provider="groq"),
    ModelInfo(id="groq/openai/gpt-oss-120b", provider="groq"),
    ModelInfo(id="groq/allam-2-7b", provider="groq"),
    ModelInfo(id="groq/whisper-large-v3", provider="groq"),
    ModelInfo(id="groq/meta-llama/llama-prompt-guard-2-22m", provider="groq"),
    ModelInfo(id="groq/meta-llama/llama-guard-4-12b", provider="groq"),
    ModelInfo(id="openai/gpt-4o-mini", provider="openai"),
]

_FETCH_IDS = {
    "groq": [
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
        "allam-2-7b",
        "whisper-large-v3",
        "meta-llama/llama-prompt-guard-2-22m",
        "meta-llama/llama-guard-4-12b",
    ],
    "openai": ["gpt-4o-mini"],
}

ROOT = Path(__file__).resolve().parent.parent
ORIGINAL_FETCH = ProviderCatalog._fetch_openai_compat_models


@pytest.fixture
def frozen_catalog() -> list[ModelInfo]:
    return list(FROZEN_CATALOG)


@pytest.fixture(autouse=True)
def isolate_env(monkeypatch, tmp_path):
    import litellm

    from app.infrastructure import catalog as catalog_mod
    from app.infrastructure import prompts as prompts_mod
    from app.infrastructure.catalog import ProviderCatalog
    from app.infrastructure.prompts import PromptRepository

    monkeypatch.setenv("MEMORY", "0")
    monkeypatch.setenv("PII", "0")
    monkeypatch.setenv("GUARD", "0")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai")
    monkeypatch.delenv("FALLBACKS", raising=False)
    monkeypatch.delenv("DAILY_TOKEN_BUDGET", raising=False)
    monkeypatch.delenv("DAILY_USD_BUDGET", raising=False)
    monkeypatch.delenv("MAX_INPUT_TOKENS", raising=False)
    monkeypatch.delenv("MAX_OUTPUT_TOKENS", raising=False)
    monkeypatch.delenv("GROQ_TPM", raising=False)
    monkeypatch.delenv("OPENAI_TPM", raising=False)
    monkeypatch.delenv("DEFAULT_TPM", raising=False)
    monkeypatch.delenv("GROQ_RPM", raising=False)
    monkeypatch.delenv("OPENAI_RPM", raising=False)
    monkeypatch.delenv("DEFAULT_RPM", raising=False)
    monkeypatch.delenv("REALMM_CONFIG", raising=False)
    monkeypatch.delenv("LITELLM_CACHE_TTL", raising=False)
    monkeypatch.delenv("PII_ENTITIES", raising=False)
    monkeypatch.delenv("PII_SPACY_MODEL", raising=False)
    monkeypatch.delenv("GUARD_INJECTION", raising=False)
    monkeypatch.delenv("GUARD_CONTENT", raising=False)
    monkeypatch.delenv("GUARD_INJECTION_MODEL", raising=False)
    monkeypatch.delenv("GUARD_CONTENT_MODEL", raising=False)
    monkeypatch.delenv("GUARD_CONTENT_IGNORE", raising=False)
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    monkeypatch.setenv("CONSOLE_URL", "http://localhost:3000")
    monkeypatch.delenv("GATEWAY_API_KEY", raising=False)
    monkeypatch.setenv("GATEWAY_ALLOW_OPEN", "1")
    monkeypatch.setenv("GATEWAY_KEY_PEPPER", "unit-test-pepper")
    monkeypatch.delenv("GATEWAY_ALLOW_SPLIT_BUDGET", raising=False)
    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    monkeypatch.delenv("WEB_CONCURRENCY", raising=False)
    monkeypatch.delenv("UVICORN_WORKERS", raising=False)
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
    monkeypatch.delenv("OLLAMA_API_BASE", raising=False)

    monkeypatch.setattr(catalog_mod, "_infer_valid_provider_from_env_vars", lambda: ["groq", "openai"])

    def fake_fetch(self, provider: str) -> list[str]:
        return list(_FETCH_IDS.get(provider, []))

    monkeypatch.setattr(ProviderCatalog, "_fetch_openai_compat_models", fake_fetch)
    monkeypatch.setattr(PromptRepository, "_get_langfuse_client", lambda self: None)

    class _NoNet:
        def raise_for_status(self):
            raise RuntimeError("network disabled in tests")

        def json(self):
            return {}

    monkeypatch.setattr(prompts_mod.httpx, "get", lambda *a, **k: _NoNet())

    original_callbacks = list(litellm.callbacks) if litellm.callbacks else []
    yield
    litellm.callbacks = original_callbacks


@pytest.fixture
def make_app(tmp_path):
    from tests.factories import app_for

    def _make():
        return app_for(tmp_path)

    return _make


@pytest.fixture
def client(make_app):
    from fastapi.testclient import TestClient

    with TestClient(make_app()) as test_client:
        yield test_client
