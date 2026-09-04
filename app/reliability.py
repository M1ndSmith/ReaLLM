from __future__ import annotations

import os
from typing import Any

from litellm import Router
from litellm.types.router import RetryPolicy

from app.llm import list_available_models, provider_for_model
from app.schemas import ModelInfo, ReliabilityInfo

_NON_CHAT_MARKERS = ("whisper", "tts", "orpheus", "prompt-guard")
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

_router: Router | None = None
_router_signature: tuple[str, ...] | None = None


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def cache_enabled() -> bool:
    raw = os.getenv("LITELLM_CACHE", "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def num_retries() -> int:
    return _int_env("LITELLM_NUM_RETRIES", 2)


def is_chat_model(model_id: str) -> bool:
    lowered = model_id.lower()
    return not any(marker in lowered for marker in _NON_CHAT_MARKERS)


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


def chat_fallback_ids(requested: str, catalog: list[ModelInfo] | None = None) -> list[str]:
    items = catalog if catalog is not None else list_available_models()
    requested_provider = provider_for_model(requested)
    chat = [item.id for item in items if is_chat_model(item.id) and item.id != requested]
    same = [model_id for model_id in chat if provider_for_model(model_id) == requested_provider]
    other = [model_id for model_id in chat if provider_for_model(model_id) != requested_provider]
    return same + other


def _redis_kwargs() -> dict[str, Any]:
    redis_url = (os.getenv("REDIS_URL") or "").strip()
    if not redis_url:
        return {}
    return {"redis_url": redis_url}


def _build_router(catalog: list[ModelInfo]) -> Router:
    model_list = [
        {
            "model_name": item.id,
            "litellm_params": {
                "model": item.id,
                "rpm": provider_rpm(item.provider),
            },
        }
        for item in catalog
    ]
    chat_ids = [item.id for item in catalog if is_chat_model(item.id)]
    return Router(
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
        default_fallbacks=chat_ids or None,
        ignore_invalid_deployments=True,
        **_redis_kwargs(),
    )


def get_router() -> Router:
    global _router, _router_signature
    catalog = list_available_models()
    signature = tuple(item.id for item in catalog)
    if _router is None or _router_signature != signature:
        _router = _build_router(catalog)
        _router_signature = signature
    return _router


def reliability_status() -> ReliabilityInfo:
    get_router()
    catalog = list_available_models()
    return ReliabilityInfo(
        retries=num_retries(),
        cache=cache_enabled(),
        fallbacks=[item.id for item in catalog if is_chat_model(item.id)],
        routing_strategy="simple-shuffle",
    )
