from __future__ import annotations

import logging
import os
import threading
from collections.abc import Callable
from typing import Any, Literal

import litellm
from litellm import Router
from litellm.types.router import RetryPolicy

from app.infrastructure.catalog import ProviderCatalog, is_chat_model, ollama_host, provider_for_model
from app.infrastructure.redis_health import RedisHealth
from app.schemas import ModelInfo, ReliabilityInfo
from app.settings import GatewaySettings

logger = logging.getLogger(__name__)

_WEAK_FALLBACK_MARKERS = ("compound", "allam", "safeguard", "canopy")
_DEFAULT_PROVIDER_RPM = {
    "groq": 30,
    "openai": 500,
    "anthropic": 50,
    "gemini": 60,
    "xai": 60,
    "mistral": 60,
    "deepseek": 60,
    "openrouter": 60,
}
_OFF_VALUES = {"0", "false", "no", "off", "none"}

FallbackPolicy = Literal["same-provider", "allowlist", "retry-only"]


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _optional_int_env(name: str) -> int | None:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return None
    try:
        return int(raw)
    except ValueError:
        return None


class LiteLLMRouterRuntime:
    """Sole owner of litellm.Router construction and litellm.cache mutation."""

    def __init__(
        self,
        settings: GatewaySettings,
        catalog: ProviderCatalog,
        *,
        tracing: Callable[[], None] | None = None,
        redis_health: RedisHealth | None = None,
    ):
        self._settings = settings
        self._catalog = catalog
        self._tracing = tracing
        self._redis_health = redis_health
        self._lock = threading.Lock()
        self._router: Router | None = None
        self._router_signature: tuple[Any, ...] | None = None

    def cache_enabled(self) -> bool:
        return self._settings.cache_enabled()

    def cache_ttl(self) -> int:
        return self._settings.litellm_cache_ttl

    def num_retries(self) -> int:
        return self._settings.litellm_num_retries

    def redis_url(self) -> str | None:
        return self._settings.redis_url_value()

    def redis_enabled(self) -> bool:
        return self._settings.redis_enabled()

    def redis_mode(self) -> str:
        if self._redis_health is not None:
            return self._redis_health.mode()
        return "shared" if self.redis_enabled() else "unconfigured"

    def provider_rpm(self, provider: str) -> int:
        compact = f"{provider.replace('_', '').upper()}_RPM"
        underscored = f"{provider.upper()}_RPM"
        raw = os.getenv(compact) or os.getenv(underscored)
        if raw and raw.strip():
            try:
                return int(raw)
            except ValueError:
                pass
        default = self._settings.default_rpm
        return _int_env("DEFAULT_RPM", _DEFAULT_PROVIDER_RPM.get(provider, default))

    def provider_tpm(self, provider: str) -> int | None:
        compact = f"{provider.replace('_', '').upper()}_TPM"
        underscored = f"{provider.upper()}_TPM"
        raw = os.getenv(compact) or os.getenv(underscored)
        if raw and raw.strip():
            try:
                return int(raw)
            except ValueError:
                pass
        if self._settings.default_tpm is not None:
            return self._settings.default_tpm
        return _optional_int_env("DEFAULT_TPM")

    def fallback_policy(self) -> FallbackPolicy:
        raw = self._settings.fallbacks
        if raw is None:
            env_raw = os.getenv("FALLBACKS")
            if env_raw is None:
                return "same-provider"
            raw = env_raw
        stripped = raw.strip().lower()
        if not stripped or stripped in _OFF_VALUES:
            return "retry-only"
        return "allowlist"

    def _match_catalog_id(self, token: str, catalog: list[ModelInfo]) -> str | None:
        requested = token.strip()
        if not requested:
            return None
        exact = [item.id for item in catalog if item.id == requested]
        if len(exact) == 1:
            return exact[0]
        bare = requested.split("/")[-1]
        matches = [
            item.id
            for item in catalog
            if item.id == requested
            or item.id.endswith(f"/{requested}")
            or item.id.split("/")[-1] == requested
            or item.id.split("/")[-1] == bare
        ]
        unique = list(dict.fromkeys(matches))
        if len(unique) == 1:
            return unique[0]
        return None

    def _explicit_fallback_ids(self, catalog: list[ModelInfo]) -> list[str]:
        raw = self._settings.fallbacks if self._settings.fallbacks is not None else (os.getenv("FALLBACKS") or "")
        found: list[str] = []
        seen: set[str] = set()
        for token in raw.split(","):
            matched = self._match_catalog_id(token, catalog)
            if matched is None or not is_chat_model(matched) or matched in seen:
                continue
            seen.add(matched)
            found.append(matched)
        return found

    def _is_auto_fallback_candidate(self, model_id: str) -> bool:
        if not is_chat_model(model_id):
            return False
        lowered = model_id.lower()
        return not any(marker in lowered for marker in _WEAK_FALLBACK_MARKERS)

    def fallback_pool(self, catalog: list[ModelInfo] | None = None) -> list[str]:
        items = catalog if catalog is not None else self._catalog.list_available_models()
        policy = self.fallback_policy()
        if policy == "retry-only":
            return []
        if policy == "allowlist":
            return self._explicit_fallback_ids(items)
        return [item.id for item in items if self._is_auto_fallback_candidate(item.id)]

    def chat_fallback_ids(self, requested: str, catalog: list[ModelInfo] | None = None) -> list[str]:
        items = catalog if catalog is not None else self._catalog.list_available_models()
        policy = self.fallback_policy()
        if policy == "retry-only":
            return []
        if policy == "allowlist":
            return [model_id for model_id in self._explicit_fallback_ids(items) if model_id != requested]
        requested_provider = provider_for_model(requested)
        return [
            item.id
            for item in items
            if item.id != requested
            and self._is_auto_fallback_candidate(item.id)
            and provider_for_model(item.id) == requested_provider
        ]

    def _redis_kwargs(self) -> dict[str, Any]:
        if self._redis_health is not None:
            return self._redis_health.redis_kwargs()
        url = self.redis_url()
        if not url:
            return {}
        return {"redis_url": url}

    def _deployment_params(self, item: ModelInfo) -> dict[str, Any]:
        params: dict[str, Any] = {
            "model": item.id,
            "rpm": self.provider_rpm(item.provider),
        }
        tpm = self.provider_tpm(item.provider)
        if tpm is not None:
            params["tpm"] = tpm
        if item.provider == "ollama":
            params["api_base"] = ollama_host()
        return params

    def _compute_router_signature(self, catalog: list[ModelInfo]) -> tuple[Any, ...]:
        return (
            tuple((item.id, self.provider_rpm(item.provider), self.provider_tpm(item.provider)) for item in catalog),
            self.redis_mode(),
            self.redis_url(),
            self.cache_enabled(),
            self.cache_ttl(),
            self._settings.fallbacks if self._settings.fallbacks is not None else os.getenv("FALLBACKS"),
            self.num_retries(),
            ollama_host() if any(item.provider == "ollama" for item in catalog) else None,
        )

    def _build_router(self, catalog: list[ModelInfo]) -> Router:
        model_list = [
            {
                "model_name": item.id,
                "litellm_params": self._deployment_params(item),
            }
            for item in catalog
        ]
        redis_kwargs = self._redis_kwargs()
        ttl = float(self.cache_ttl())
        if self.cache_enabled() and not redis_kwargs:
            litellm.cache = litellm.Cache(type="local", ttl=ttl)
        router = Router(
            model_list=model_list,
            routing_strategy="simple-shuffle",
            num_retries=self.num_retries(),
            retry_after=1,
            retry_policy=RetryPolicy(
                RateLimitErrorRetries=3,
                TimeoutErrorRetries=2,
                InternalServerErrorRetries=2,
                AuthenticationErrorRetries=0,
                BadRequestErrorRetries=0,
            ),
            allowed_fails=2,
            cooldown_time=60,
            enable_pre_call_checks=True,
            default_max_parallel_requests=8,
            cache_responses=self.cache_enabled(),
            timeout=45,
            stream_timeout=60,
            default_fallbacks=None,
            ignore_invalid_deployments=True,
            **redis_kwargs,
        )
        if self.cache_enabled() and litellm.cache is not None:
            litellm.cache.ttl = ttl
        return router

    def get_router(self) -> Router:
        if self._tracing is not None:
            self._tracing()
        with self._lock:
            catalog = self._catalog.list_available_models()
            signature = self._compute_router_signature(catalog)
            if self._router is None or self._router_signature != signature:
                litellm.cache = None
                self._router = self._build_router(catalog)
                self._router_signature = signature
            return self._router

    async def acompletion(self, **kwargs):
        return await self.get_router().acompletion(**kwargs)

    async def aembedding(self, **kwargs):
        return await self.get_router().aembedding(**kwargs)

    def completion(self, **kwargs):
        return self.get_router().completion(**kwargs)

    def reliability_status(self) -> ReliabilityInfo:
        self.get_router()
        catalog = self._catalog.list_available_models()
        return ReliabilityInfo(
            retries=self.num_retries(),
            cache=self.cache_enabled(),
            cache_ttl=self.cache_ttl(),
            redis=self.redis_mode() == "shared",
            redis_mode=self.redis_mode(),
            fallback_policy=self.fallback_policy(),
            fallbacks=self.fallback_pool(catalog),
            routing_strategy="simple-shuffle",
        )

    def close(self) -> None:
        with self._lock:
            self._router = None
            self._router_signature = None
            litellm.cache = None
