from __future__ import annotations

from tests.conftest import _FETCH_IDS

from app.infrastructure.catalog import ProviderCatalog, ollama_host
from app.infrastructure.router import LiteLLMRouterRuntime
from app.schemas import ModelInfo
from app.settings import GatewaySettings


def test_ollama_not_detected_without_key(monkeypatch):
    monkeypatch.setenv("OLLAMA_API_BASE", "http://127.0.0.1:11434")
    catalog = ProviderCatalog(GatewaySettings())
    assert "ollama" not in catalog.detected_providers()


def test_ollama_detected_with_dummy_key(monkeypatch):
    monkeypatch.setenv("OLLAMA_API_KEY", "ollama")
    catalog = ProviderCatalog(GatewaySettings())
    assert "ollama" in catalog.detected_providers()


def test_ollama_lists_compat_ids(monkeypatch):
    monkeypatch.setenv("OLLAMA_API_KEY", "ollama")

    def fake_fetch(self, provider: str) -> list[str]:
        if provider == "ollama":
            return ["llama3.2"]
        return list(_FETCH_IDS.get(provider, []))

    monkeypatch.setattr(ProviderCatalog, "_fetch_openai_compat_models", fake_fetch)
    catalog = ProviderCatalog(GatewaySettings())
    ids = {item.id for item in catalog.list_available_models()}
    assert "ollama/llama3.2" in ids


def test_ollama_host_strips_v1(monkeypatch):
    monkeypatch.setenv("OLLAMA_API_BASE", "http://127.0.0.1:11434/v1")
    assert ollama_host() == "http://127.0.0.1:11434"
    catalog = ProviderCatalog(GatewaySettings())
    assert catalog._compat_base("ollama") == "http://127.0.0.1:11434/v1"


def test_ollama_deployment_api_base(monkeypatch):
    monkeypatch.setenv("OLLAMA_API_KEY", "ollama")
    monkeypatch.setenv("OLLAMA_API_BASE", "http://192.168.1.10:11434")
    settings = GatewaySettings()
    runtime = LiteLLMRouterRuntime(settings, ProviderCatalog(settings))
    item = ModelInfo(id="ollama/llama3.2", provider="ollama")
    params = runtime._deployment_params(item)
    assert params["api_base"] == "http://192.168.1.10:11434"
    assert params["model"] == "ollama/llama3.2"
    sig = runtime._compute_router_signature([item])
    assert "http://192.168.1.10:11434" in sig
