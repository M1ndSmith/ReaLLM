from __future__ import annotations

import pytest

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


@pytest.fixture
def frozen_catalog() -> list[ModelInfo]:
    return list(FROZEN_CATALOG)


@pytest.fixture(autouse=True)
def isolate_app(monkeypatch, tmp_path):
    import litellm

    import app.budget as budget
    import app.llm as llm
    import app.memory as memory
    import app.pii as pii
    import app.prompts as prompts
    import app.reliability as reliability
    import app.runtime_flags as runtime_flags

    monkeypatch.setattr(budget, "_STATE_PATH", tmp_path / "budget-state.json")
    monkeypatch.setattr(runtime_flags, "_FLAGS_PATH", tmp_path / "runtime-flags.json")
    budget._redis_client = None
    budget._redis_unavailable = False
    llm._models_cache = None
    reliability._router = None
    reliability._router_signature = None
    prompts._tracing_ready = False
    memory._memory = None
    pii._engines = None

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
    monkeypatch.delenv("GROQ_TPM", raising=False)
    monkeypatch.delenv("OPENAI_TPM", raising=False)
    monkeypatch.delenv("DEFAULT_TPM", raising=False)
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

    monkeypatch.setattr(llm, "_infer_valid_provider_from_env_vars", lambda: ["groq", "openai"])
    monkeypatch.setattr(llm, "_fetch_openai_compat_models", lambda provider: list(_FETCH_IDS.get(provider, [])))
    monkeypatch.setattr(prompts, "_get_langfuse_client", lambda: None)

    class _NoNet:
        def raise_for_status(self):
            raise RuntimeError("network disabled in tests")

        def json(self):
            return {}

    monkeypatch.setattr(prompts.httpx, "get", lambda *a, **k: _NoNet())

    original_callbacks = list(litellm.callbacks) if litellm.callbacks else []
    yield
    litellm.callbacks = original_callbacks
    budget._redis_client = None
    budget._redis_unavailable = False
    llm._models_cache = None
    reliability._router = None
    reliability._router_signature = None
    prompts._tracing_ready = False
    memory._memory = None
    pii._engines = None
