from __future__ import annotations

import os
from typing import Any, Literal

import litellm
from litellm import Router
from litellm.types.router import RetryPolicy

from app.llm import list_available_models, provider_for_model
from app.schemas import ModelInfo, ReliabilityInfo

_NON_CHAT_MARKERS = ("whisper", "tts", "orpheus", "prompt-guard", "llama-guard")
_WEAK_FALLBACK_MARKERS = ("compound", "allam", "safeguard", "canopy")
_DEFAULT_CACHE_TTL = 120
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

_router: Router | None = None
_router_signature: tuple[Any, ...] | None = None


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


def cache_enabled() -> bool:
    raw = os.getenv("LITELLM_CACHE", "1").strip().lower()
    return raw not in _OFF_VALUES


def cache_ttl() -> int:
    return max(1, _int_env("LITELLM_CACHE_TTL", _DEFAULT_CACHE_TTL))


def num_retries() -> int:
    return _int_env("LITELLM_NUM_RETRIES", 2)


def redis_url() -> str | None:
    url = (os.getenv("REDIS_URL") or "").strip()
    return url or None


def redis_enabled() -> bool:
    return redis_url() is not None


def is_chat_model(model_id: str) -> bool:
    lowered = model_id.lower()
    return not any(marker in lowered for marker in _NON_CHAT_MARKERS)


def _is_auto_fallback_candidate(model_id: str) -> bool:
    if not is_chat_model(model_id):
        return False
    lowered = model_id.lower()
    return not any(marker in lowered for marker in _WEAK_FALLBACK_MARKERS)


def provider_rpm(provider: str) -> int:
    compact = f"{provider.replace('_', '').upper()}_RPM"
    underscored = f"{provider.upper()}_RPM"
    raw = os.getenv(compact) or os.getenv(underscored)
    if raw and raw.strip():
        try:
            return int(raw)
        except ValueError:
            pass
    return _int_env("DEFAULT_RPM", _DEFAULT_PROVIDER_RPM.get(provider, 60))


def provider_tpm(provider: str) -> int | None:
    compact = f"{provider.replace('_', '').upper()}_TPM"
    underscored = f"{provider.upper()}_TPM"
    raw = os.getenv(compact) or os.getenv(underscored)
    if raw and raw.strip():
        try:
            return int(raw)
        except ValueError:
            pass
    return _optional_int_env("DEFAULT_TPM")


def fallback_policy() -> FallbackPolicy:
    raw = os.getenv("FALLBACKS")
    if raw is None:
        return "same-provider"
    stripped = raw.strip().lower()
    if not stripped or stripped in _OFF_VALUES:
        return "retry-only"
    return "allowlist"


def _match_catalog_id(token: str, catalog: list[ModelInfo]) -> str | None:
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


def _explicit_fallback_ids(catalog: list[ModelInfo]) -> list[str]:
    raw = os.getenv("FALLBACKS") or ""
    found: list[str] = []
    seen: set[str] = set()
    for token in raw.split(","):
        matched = _match_catalog_id(token, catalog)
        if matched is None or not is_chat_model(matched) or matched in seen:
            continue
        seen.add(matched)
        found.append(matched)
    return found


def fallback_pool(catalog: list[ModelInfo] | None = None) -> list[str]:
    items = catalog if catalog is not None else list_available_models()
    policy = fallback_policy()
    if policy == "retry-only":
        return []
    if policy == "allowlist":
        return _explicit_fallback_ids(items)
    return [item.id for item in items if _is_auto_fallback_candidate(item.id)]


def chat_fallback_ids(requested: str, catalog: list[ModelInfo] | None = None) -> list[str]:
    items = catalog if catalog is not None else list_available_models()
    policy = fallback_policy()
    if policy == "retry-only":
        return []
    if policy == "allowlist":
        return [model_id for model_id in _explicit_fallback_ids(items) if model_id != requested]
    requested_provider = provider_for_model(requested)
    return [
        item.id
        for item in items
        if item.id != requested
        and _is_auto_fallback_candidate(item.id)
        and provider_for_model(item.id) == requested_provider
    ]


def _redis_kwargs() -> dict[str, Any]:
    url = redis_url()
    if not url:
        return {}
    return {"redis_url": url}


def _deployment_params(item: ModelInfo) -> dict[str, Any]:
    params: dict[str, Any] = {
        "model": item.id,
        "rpm": provider_rpm(item.provider),
    }
    tpm = provider_tpm(item.provider)
    if tpm is not None:
        params["tpm"] = tpm
    return params


def _compute_router_signature(catalog: list[ModelInfo]) -> tuple[Any, ...]:
    return (
        tuple((item.id, provider_rpm(item.provider), provider_tpm(item.provider)) for item in catalog),
        redis_url(),
        cache_enabled(),
        cache_ttl(),
        os.getenv("FALLBACKS"),
        num_retries(),
    )


def _build_router(catalog: list[ModelInfo]) -> Router:
    model_list = [
        {
            "model_name": item.id,
            "litellm_params": _deployment_params(item),
        }
        for item in catalog
    ]
    redis_kwargs = _redis_kwargs()
    ttl = float(cache_ttl())
    if cache_enabled() and not redis_kwargs:
        # Router only merges cache_kwargs into RedisCache; ttl there is not a Redis client arg.
        litellm.cache = litellm.Cache(type="local", ttl=ttl)
    router = Router(
        model_list=model_list,
        routing_strategy="simple-shuffle",
        num_retries=num_retries(),
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
        cache_responses=cache_enabled(),
        timeout=45,
        stream_timeout=60,
        default_fallbacks=None,
        ignore_invalid_deployments=True,
        **redis_kwargs,
    )
    if cache_enabled() and litellm.cache is not None:
        litellm.cache.ttl = ttl
    return router


def get_router() -> Router:
    global _router, _router_signature
    from app.prompts import ensure_tracing

    ensure_tracing()
    catalog = list_available_models()
    signature = _compute_router_signature(catalog)
    if _router is None or _router_signature != signature:
        litellm.cache = None
        _router = _build_router(catalog)
        _router_signature = signature
    return _router


def reliability_status() -> ReliabilityInfo:
    get_router()
    catalog = list_available_models()
    return ReliabilityInfo(
        retries=num_retries(),
        cache=cache_enabled(),
        cache_ttl=cache_ttl(),
        redis=redis_enabled(),
        fallback_policy=fallback_policy(),
        fallbacks=fallback_pool(catalog),
        routing_strategy="simple-shuffle",
    )
