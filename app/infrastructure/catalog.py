from __future__ import annotations

import asyncio
import os
import threading
import time

import httpx
import litellm
from litellm import get_valid_models
from litellm.utils import _infer_valid_provider_from_env_vars

from app.application.errors import UnknownModelError
from app.schemas import ModelInfo
from app.settings import GatewaySettings

_CACHE_TTL_SECONDS = 60.0
_NON_CHAT_MARKERS = ("whisper", "tts", "orpheus", "prompt-guard", "llama-guard")
_DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434"

_DEFAULT_COMPAT_BASES = {
    "groq": "https://api.groq.com/openai/v1",
    "openai": "https://api.openai.com/v1",
    "deepseek": "https://api.deepseek.com",
    "xai": "https://api.x.ai/v1",
    "mistral": "https://api.mistral.ai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "together_ai": "https://api.together.xyz/v1",
    "cerebras": "https://api.cerebras.ai/v1",
    "fireworks_ai": "https://api.fireworks.ai/inference/v1",
}


def is_chat_model(model_id: str) -> bool:
    lowered = model_id.lower()
    return not any(marker in lowered for marker in _NON_CHAT_MARKERS)


def provider_for_model(model_id: str) -> str:
    if "/" in model_id:
        return model_id.split("/", 1)[0]
    return "unknown"


def _provider_name(provider: object) -> str:
    value = getattr(provider, "value", provider)
    return str(value)


def ollama_host() -> str:
    raw = (os.getenv("OLLAMA_API_BASE") or "").strip() or _DEFAULT_OLLAMA_HOST
    host = raw.rstrip("/")
    if host.endswith("/v1"):
        host = host[:-3].rstrip("/")
    return host or _DEFAULT_OLLAMA_HOST


def _provider_api_key(provider: str) -> str | None:
    compact = f"{provider.replace('_', '').upper()}_API_KEY"
    underscored = f"{provider.upper()}_API_KEY"
    raw = os.getenv(compact) or os.getenv(underscored)
    if raw is None:
        return None
    stripped = raw.strip()
    return stripped or None


class ProviderCatalog:
    def __init__(self, settings: GatewaySettings):
        self._settings = settings
        self._lock = threading.Lock()
        self._cache: tuple[float, list[ModelInfo]] | None = None
        self._refresh_pending = False

    def detected_providers(self) -> list[str]:
        providers: list[str] = []
        for provider in _infer_valid_provider_from_env_vars():
            name = _provider_name(provider)
            if _provider_api_key(name):
                providers.append(name)
        if "ollama" not in providers and _provider_api_key("ollama"):
            providers.append("ollama")
        return providers

    def _compat_base(self, provider: str) -> str | None:
        if provider == "groq":
            return os.getenv("GROQ_API_BASE", _DEFAULT_COMPAT_BASES["groq"])
        if provider == "openai":
            return os.getenv("OPENAI_BASE_URL") or os.getenv("OPENAI_API_BASE") or _DEFAULT_COMPAT_BASES["openai"]
        if provider == "deepseek":
            return os.getenv("DEEPSEEK_API_BASE", _DEFAULT_COMPAT_BASES["deepseek"])
        if provider == "xai":
            return os.getenv("XAI_API_BASE", _DEFAULT_COMPAT_BASES["xai"])
        if provider == "mistral":
            return os.getenv("MISTRAL_API_BASE", _DEFAULT_COMPAT_BASES["mistral"])
        if provider == "openrouter":
            return os.getenv("OPENROUTER_API_BASE", _DEFAULT_COMPAT_BASES["openrouter"])
        if provider == "together_ai":
            return os.getenv("TOGETHERAI_API_BASE", _DEFAULT_COMPAT_BASES["together_ai"])
        if provider == "cerebras":
            return os.getenv("CEREBRAS_API_BASE", _DEFAULT_COMPAT_BASES["cerebras"])
        if provider == "fireworks_ai":
            return os.getenv("FIREWORKS_API_BASE", _DEFAULT_COMPAT_BASES["fireworks_ai"])
        if provider == "ollama":
            return f"{ollama_host()}/v1"
        return _DEFAULT_COMPAT_BASES.get(provider)

    def _fetch_openai_compat_models(self, provider: str) -> list[str]:
        base = self._compat_base(provider)
        api_key = _provider_api_key(provider)
        if not base or not api_key:
            return []
        url = f"{base.rstrip('/')}/models"
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(url, headers={"Authorization": f"Bearer {api_key}"})
            response.raise_for_status()
            payload = response.json()
            return [item["id"] for item in payload.get("data", []) if isinstance(item, dict) and item.get("id")]
        except Exception:
            return []

    def _normalize_model_id(self, model_id: str, provider: str) -> str:
        if model_id.startswith(f"{provider}/"):
            return model_id
        return f"{provider}/{model_id}"

    def _models_for_provider(self, provider: str) -> list[str]:
        compat = self._fetch_openai_compat_models(provider)
        if compat:
            return compat
        live = get_valid_models(check_provider_endpoint=True, custom_llm_provider=provider)
        if live:
            return list(live)
        static = litellm.models_by_provider.get(provider, [])
        return sorted(static)

    def list_available_models(self, *, refresh: bool = False) -> list[ModelInfo]:
        now = time.monotonic()
        with self._lock:
            if not refresh and self._cache and now - self._cache[0] < _CACHE_TTL_SECONDS:
                return self._cache[1]
            stale = self._cache[1] if self._cache else None
            if not refresh and stale is not None:
                self._schedule_refresh_unlocked()
                return stale
        return self._rebuild()

    def _schedule_refresh_unlocked(self) -> None:
        if self._refresh_pending:
            return
        self._refresh_pending = True
        threading.Thread(target=self._refresh_worker, name="realmm-catalog-refresh", daemon=True).start()

    def _refresh_worker(self) -> None:
        try:
            self._rebuild()
        finally:
            with self._lock:
                self._refresh_pending = False

    def _rebuild(self) -> list[ModelInfo]:
        models: list[ModelInfo] = []
        seen: set[str] = set()
        for provider in self.detected_providers():
            for model_id in self._models_for_provider(provider):
                litellm_id = self._normalize_model_id(str(model_id), provider)
                if litellm_id in seen:
                    continue
                seen.add(litellm_id)
                models.append(ModelInfo(id=litellm_id, provider=provider))
        models.sort(key=lambda item: (item.provider, item.id))
        with self._lock:
            self._cache = (time.monotonic(), models)
        return models

    async def refresh_async(self) -> list[ModelInfo]:
        return await asyncio.to_thread(self._rebuild)

    def resolve_model(self, requested: str) -> str:
        catalog = self.list_available_models()
        if not catalog:
            raise UnknownModelError("No providers detected. Set a PROVIDER_API_KEY in .env.")

        exact = [item for item in catalog if item.id == requested]
        if len(exact) == 1:
            return exact[0].id

        bare = requested.split("/")[-1]
        matches = [
            item
            for item in catalog
            if item.id == requested
            or item.id.endswith(f"/{requested}")
            or item.id.split("/")[-1] == requested
            or item.id.split("/")[-1] == bare
        ]
        unique_ids = list(dict.fromkeys(item.id for item in matches))
        if len(unique_ids) == 1:
            return unique_ids[0]
        if len(unique_ids) > 1:
            raise UnknownModelError(f"Ambiguous model '{requested}'. Use a fully qualified id such as {unique_ids[0]}.")
        raise UnknownModelError(f"Unknown model '{requested}'. Choose one from GET /models.")

    def provider_for_model(self, model_id: str) -> str:
        return provider_for_model(model_id)

    def is_chat_model(self, model_id: str) -> bool:
        return is_chat_model(model_id)

    def fallback_from(self, requested: str, served: str) -> str | None:
        if served == requested:
            return None
        if requested.endswith(f"/{served}"):
            return None
        catalog_ids = {item.id for item in self.list_available_models()}
        if served in catalog_ids and served != requested:
            return requested
        return None
