from __future__ import annotations

import os
import time
from pathlib import Path

import httpx
import litellm
from dotenv import load_dotenv
from litellm import get_valid_models
from litellm.utils import _infer_valid_provider_from_env_vars

from app.schemas import ChatMessage, ChatResponse, ModelInfo, UsageInfo

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_CACHE_TTL_SECONDS = 60.0
_models_cache: tuple[float, list[ModelInfo]] | None = None

# LiteLLM's provider get_models() often inherits OpenAI's /v1/models URL.
# For OpenAI-compatible hosts, hit the real base when live listing is empty.
_OPENAI_COMPAT_BASES: dict[str, str] = {
    "groq": os.getenv("GROQ_API_BASE", "https://api.groq.com/openai/v1"),
    "openai": os.getenv("OPENAI_BASE_URL")
    or os.getenv("OPENAI_API_BASE")
    or "https://api.openai.com/v1",
    "deepseek": os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com"),
    "xai": os.getenv("XAI_API_BASE", "https://api.x.ai/v1"),
    "mistral": os.getenv("MISTRAL_API_BASE", "https://api.mistral.ai/v1"),
    "openrouter": os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1"),
    "together_ai": os.getenv("TOGETHERAI_API_BASE", "https://api.together.xyz/v1"),
    "cerebras": os.getenv("CEREBRAS_API_BASE", "https://api.cerebras.ai/v1"),
    "fireworks_ai": os.getenv("FIREWORKS_API_BASE", "https://api.fireworks.ai/inference/v1"),
}


class UnknownModelError(ValueError):
    """Raised when the requested model is not in the discovered catalog."""


def _provider_name(provider: object) -> str:
    value = getattr(provider, "value", provider)
    return str(value)


def _provider_api_key(provider: str) -> str | None:
    compact = f"{provider.replace('_', '').upper()}_API_KEY"
    underscored = f"{provider.upper()}_API_KEY"
    raw = os.getenv(compact) or os.getenv(underscored)
    if raw is None:
        return None
    stripped = raw.strip()
    return stripped or None


def detected_providers() -> list[str]:
    providers: list[str] = []
    for provider in _infer_valid_provider_from_env_vars():
        name = _provider_name(provider)
        if _provider_api_key(name):
            providers.append(name)
    return providers


def _normalize_model_id(model_id: str, provider: str) -> str:
    if model_id.startswith(f"{provider}/"):
        return model_id
    return f"{provider}/{model_id}"


def _fetch_openai_compat_models(provider: str) -> list[str]:
    base = _OPENAI_COMPAT_BASES.get(provider)
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


def _models_for_provider(provider: str) -> list[str]:
    compat = _fetch_openai_compat_models(provider)
    if compat:
        return compat
    live = get_valid_models(check_provider_endpoint=True, custom_llm_provider=provider)
    if live:
        return list(live)
    static = litellm.models_by_provider.get(provider, [])
    return sorted(static)


def list_available_models(*, refresh: bool = False) -> list[ModelInfo]:
    global _models_cache
    now = time.monotonic()
    if not refresh and _models_cache and now - _models_cache[0] < _CACHE_TTL_SECONDS:
        return _models_cache[1]

    models: list[ModelInfo] = []
    seen: set[str] = set()
    for provider in detected_providers():
        for model_id in _models_for_provider(provider):
            litellm_id = _normalize_model_id(str(model_id), provider)
            if litellm_id in seen:
                continue
            seen.add(litellm_id)
            models.append(ModelInfo(id=litellm_id, provider=provider))
    models.sort(key=lambda item: (item.provider, item.id))
    _models_cache = (now, models)
    return models


def resolve_model(requested: str) -> str:
    catalog = list_available_models()
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
        raise UnknownModelError(
            f"Ambiguous model '{requested}'. Use a fully qualified id such as {unique_ids[0]}."
        )
    raise UnknownModelError(f"Unknown model '{requested}'. Choose one from GET /models.")


def provider_for_model(model_id: str) -> str:
    if "/" in model_id:
        return model_id.split("/", 1)[0]
    return "unknown"


def _usage_from_response(response: object) -> UsageInfo | None:
    usage = getattr(response, "usage", None)
    if usage is None:
        return None
    prompt_tokens = getattr(usage, "prompt_tokens", None)
    completion_tokens = getattr(usage, "completion_tokens", None)
    total_tokens = getattr(usage, "total_tokens", None)
    if prompt_tokens is None and completion_tokens is None and total_tokens is None:
        return None
    return UsageInfo(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
    )


def _hidden_params(response: object) -> dict:
    hidden = getattr(response, "_hidden_params", None)
    if isinstance(hidden, dict):
        return hidden
    if hidden is None:
        return {}
    dumped = getattr(hidden, "model_dump", None)
    if callable(dumped):
        data = dumped()
        return data if isinstance(data, dict) else {}
    return {}


def _cache_hit(response: object) -> bool:
    hidden = _hidden_params(response)
    if hidden.get("cache_hit") is True:
        return True
    return bool(getattr(response, "_cache_hit", False))


def _served_model(response: object, requested: str) -> str:
    hidden = _hidden_params(response)
    for key in ("model_group",):
        value = hidden.get(key)
        if isinstance(value, str) and value:
            return value
    model_name = getattr(response, "model", None)
    if isinstance(model_name, str) and model_name:
        if requested == model_name or requested.endswith(f"/{model_name}"):
            return requested
        return model_name
    return requested


def fallback_from(requested: str, served: str) -> str | None:
    if served == requested:
        return None
    if requested.endswith(f"/{served}"):
        return None
    catalog_ids = {item.id for item in list_available_models()}
    if served in catalog_ids and served != requested:
        return requested
    return None


async def complete_chat(
    model: str,
    messages: list[ChatMessage],
    *,
    prompt: str | None = None,
    prompt_label: str | None = None,
    prompt_version: int | None = None,
    variables: dict[str, str] | None = None,
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
) -> ChatResponse:
    from app.budget import assert_allowed, attach_cost, completion_usd, max_output_tokens, record_usage, token_count
    from app.memory import attach_memories, record_turn
    from app.prompts import prepare_messages
    from app.reliability import chat_fallback_ids, get_router

    outgoing, prompt_meta = prepare_messages(
        messages,
        prompt=prompt,
        prompt_label=prompt_label,
        prompt_version=prompt_version,
        variables=variables,
    )
    outgoing, memories_used = await attach_memories(
        outgoing,
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
    )
    resolved = resolve_model(model)
    estimated = token_count(resolved, outgoing)
    assert_allowed(resolved, estimated)
    router = get_router()
    fallbacks = chat_fallback_ids(resolved)
    call_kwargs: dict = {
        "model": resolved,
        "messages": [message.model_dump() for message in outgoing],
        "max_tokens": max_output_tokens(),
    }
    if fallbacks:
        call_kwargs["fallbacks"] = fallbacks
    response = await router.acompletion(**call_kwargs)
    choice = response.choices[0]
    content = choice.message.content or ""
    served = _served_model(response, resolved)
    used_fallback = fallback_from(resolved, served)
    reported = served if used_fallback else resolved
    cached = _cache_hit(response)
    usage = attach_cost(_usage_from_response(response), completion_usd(response, reported))
    tokens = usage.total_tokens if usage and usage.total_tokens is not None else estimated
    record_usage(tokens=tokens, usd=usage.cost_usd if usage else None, cached=cached)
    record_turn(
        messages,
        content,
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
    )
    return ChatResponse(
        model=reported,
        provider=provider_for_model(reported),
        message=ChatMessage(role="assistant", content=content),
        usage=usage,
        cached=cached,
        fallback_from=used_fallback,
        prompt_name=prompt_meta.name if prompt_meta else None,
        prompt_version=prompt_meta.version if prompt_meta else None,
        prompt_source=prompt_meta.source if prompt_meta else None,
        memories_used=memories_used,
    )


def _chunk_delta(chunk: object) -> str:
    choices = getattr(chunk, "choices", None)
    if not choices:
        return ""
    delta = getattr(choices[0], "delta", None)
    if delta is None:
        return ""
    return getattr(delta, "content", None) or ""


async def stream_chat(
    model: str,
    messages: list[ChatMessage],
    *,
    prompt: str | None = None,
    prompt_label: str | None = None,
    prompt_version: int | None = None,
    variables: dict[str, str] | None = None,
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
):
    from app.budget import (
        assert_allowed,
        max_output_tokens,
        record_usage,
        token_count,
        token_count_text,
        usage_from_counts,
    )
    from app.memory import attach_memories, record_turn
    from app.prompts import prepare_messages
    from app.reliability import chat_fallback_ids, get_router

    outgoing, prompt_meta = prepare_messages(
        messages,
        prompt=prompt,
        prompt_label=prompt_label,
        prompt_version=prompt_version,
        variables=variables,
    )
    outgoing, memories_used = await attach_memories(
        outgoing,
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
    )
    resolved = resolve_model(model)
    estimated = token_count(resolved, outgoing)
    assert_allowed(resolved, estimated)
    yield None, resolved, resolved, prompt_meta, None, memories_used
    router = get_router()
    fallbacks = chat_fallback_ids(resolved)
    call_kwargs: dict = {
        "model": resolved,
        "messages": [message.model_dump() for message in outgoing],
        "stream": True,
        "caching": False,
        "max_tokens": max_output_tokens(),
        "stream_options": {"include_usage": True},
    }
    if fallbacks:
        call_kwargs["fallbacks"] = fallbacks
    stream = await router.acompletion(**call_kwargs)
    served = resolved
    assembled: list[str] = []
    usage = None
    async for chunk in stream:
        chunk_model = getattr(chunk, "model", None)
        if isinstance(chunk_model, str) and chunk_model:
            served = _served_model(chunk, resolved)
        delta = _chunk_delta(chunk)
        if delta:
            assembled.append(delta)
        chunk_usage = _usage_from_response(chunk)
        if chunk_usage is not None:
            usage = chunk_usage
        yield chunk, resolved, served, prompt_meta, None, memories_used
    if usage is None:
        usage = usage_from_counts(served, estimated, token_count_text(served, "".join(assembled)))
    elif usage.cost_usd is None:
        completion_tokens = usage.completion_tokens
        if completion_tokens is None:
            completion_tokens = token_count_text(served, "".join(assembled))
        prompt_tokens = usage.prompt_tokens if usage.prompt_tokens is not None else estimated
        usage = usage_from_counts(served, prompt_tokens, completion_tokens)
    tokens = usage.total_tokens if usage.total_tokens is not None else estimated
    record_usage(tokens=tokens, usd=usage.cost_usd, cached=False)
    record_turn(
        messages,
        "".join(assembled),
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
    )
    yield None, resolved, served, prompt_meta, usage, memories_used
