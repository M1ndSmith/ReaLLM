from __future__ import annotations

import os
import time
from pathlib import Path
from types import SimpleNamespace

import httpx
import litellm
from dotenv import load_dotenv
from litellm import get_valid_models
from litellm.utils import _infer_valid_provider_from_env_vars

from app.prompts import PromptMeta
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


def _completion_metadata(
    *,
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
    prompt_meta: PromptMeta | None = None,
    generation_name: str | None = None,
) -> dict:
    name = generation_name or (prompt_meta.name if prompt_meta else "chat")
    tags = ["realmm"]
    if agent_id:
        tags.append(f"agent:{agent_id}")
    metadata: dict = {
        "generation_name": name,
        "trace_name": name,
        "tags": tags,
    }
    if user_id:
        metadata["trace_user_id"] = user_id
    if conversation_id:
        metadata["session_id"] = conversation_id
    if prompt_meta is not None:
        if prompt_meta.version is not None:
            metadata["version"] = str(prompt_meta.version)
        metadata["trace_metadata"] = {
            "prompt_name": prompt_meta.name,
            "prompt_source": prompt_meta.source,
        }
    return metadata


def fallback_from(requested: str, served: str) -> str | None:
    if served == requested:
        return None
    if requested.endswith(f"/{served}"):
        return None
    catalog_ids = {item.id for item in list_available_models()}
    if served in catalog_ids and served != requested:
        return requested
    return None


def _delta_chunk(text: str, model: str | None = None):
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content=text))],
        model=model,
        usage=None,
    )


async def _prepare_outgoing(
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
    from app.budget import assert_allowed, token_count
    from app.guardrails import assert_inbound, guard_enabled
    from app.memory import attach_memories
    from app.pii import pii_enabled, redact_messages, unique_entity_types
    from app.prompts import prepare_messages

    outgoing, prompt_meta = prepare_messages(
        messages,
        prompt=prompt,
        prompt_label=prompt_label,
        prompt_version=prompt_version,
        variables=variables,
    )
    pii_on = pii_enabled()
    found: list[str] = []
    if pii_on:
        outgoing, types = await redact_messages(outgoing)
        found = unique_entity_types(found, types)
    outgoing, memories_used = await attach_memories(
        outgoing,
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
    )
    if pii_on:
        outgoing, types = await redact_messages(outgoing)
        found = unique_entity_types(found, types)
    if guard_enabled():
        await assert_inbound(outgoing)
    resolved = resolve_model(model)
    estimated = token_count(resolved, outgoing)
    assert_allowed(resolved, estimated)
    return (
        outgoing,
        prompt_meta,
        memories_used,
        resolved,
        estimated,
        True if pii_on else None,
        found if pii_on else None,
        True if guard_enabled() else None,
    )


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
    response_format: dict | None = None,
) -> ChatResponse:
    from app.budget import attach_cost, completion_usd, max_output_tokens, record_usage
    from app.guardrails import assert_outbound
    from app.memory import record_turn
    from app.pii import redact_text, unique_entity_types
    from app.reliability import chat_fallback_ids, get_router
    from app.structured import normalize_response_format, validate_output

    fmt = normalize_response_format(response_format)

    outgoing, prompt_meta, memories_used, resolved, estimated, pii_redacted, pii_entities, guard_passed = await _prepare_outgoing(
        model,
        messages,
        prompt=prompt,
        prompt_label=prompt_label,
        prompt_version=prompt_version,
        variables=variables,
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
    )
    router = get_router()
    fallbacks = chat_fallback_ids(resolved)
    call_kwargs: dict = {
        "model": resolved,
        "messages": [message.model_dump() for message in outgoing],
        "max_tokens": max_output_tokens(),
        "metadata": _completion_metadata(
            user_id=user_id,
            conversation_id=conversation_id,
            agent_id=agent_id,
            prompt_meta=prompt_meta,
        ),
    }
    if fallbacks:
        call_kwargs["fallbacks"] = fallbacks
    if fmt is not None:
        call_kwargs["response_format"] = fmt
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
    if pii_redacted:
        content, found = await redact_text(content)
        pii_entities = unique_entity_types(pii_entities or [], found)
    if guard_passed:
        await assert_outbound(content)
    if fmt is not None:
        validate_output(content, fmt)
    record_turn(
        outgoing,
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
        pii_redacted=pii_redacted,
        pii_entities=pii_entities,
        guard_passed=guard_passed,
        schema_valid=True if fmt is not None else None,
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
    response_format: dict | None = None,
):
    from app.budget import (
        max_output_tokens,
        record_usage,
        token_count_text,
        usage_from_counts,
    )
    from app.guardrails import assert_outbound, content_enabled
    from app.memory import record_turn
    from app.pii import redact_text, unique_entity_types
    from app.reliability import chat_fallback_ids, get_router
    from app.structured import SchemaError, normalize_response_format

    if response_format is not None:
        normalize_response_format(response_format)
        raise SchemaError("Structured output cannot be streamed. Omit stream or response_format.")

    outgoing, prompt_meta, memories_used, resolved, estimated, pii_redacted, pii_entities, guard_passed = await _prepare_outgoing(
        model,
        messages,
        prompt=prompt,
        prompt_label=prompt_label,
        prompt_version=prompt_version,
        variables=variables,
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
    )
    yield None, resolved, resolved, prompt_meta, None, memories_used, pii_redacted, pii_entities, guard_passed
    router = get_router()
    fallbacks = chat_fallback_ids(resolved)
    call_kwargs: dict = {
        "model": resolved,
        "messages": [message.model_dump() for message in outgoing],
        "stream": True,
        "caching": False,
        "max_tokens": max_output_tokens(),
        "stream_options": {"include_usage": True},
        "metadata": _completion_metadata(
            user_id=user_id,
            conversation_id=conversation_id,
            agent_id=agent_id,
            prompt_meta=prompt_meta,
        ),
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
        buffer_output = bool(pii_redacted) or bool(guard_passed and content_enabled())
        if not buffer_output:
            yield chunk, resolved, served, prompt_meta, None, memories_used, pii_redacted, pii_entities, guard_passed
    raw_assistant = "".join(assembled)
    if usage is None:
        usage = usage_from_counts(served, estimated, token_count_text(served, raw_assistant))
    elif usage.cost_usd is None:
        completion_tokens = usage.completion_tokens
        if completion_tokens is None:
            completion_tokens = token_count_text(served, raw_assistant)
        prompt_tokens = usage.prompt_tokens if usage.prompt_tokens is not None else estimated
        usage = usage_from_counts(served, prompt_tokens, completion_tokens)
    tokens = usage.total_tokens if usage.total_tokens is not None else estimated
    record_usage(tokens=tokens, usd=usage.cost_usd, cached=False)
    assistant = raw_assistant
    if pii_redacted:
        assistant, found = await redact_text(raw_assistant)
        pii_entities = unique_entity_types(pii_entities or [], found)
    if guard_passed:
        await assert_outbound(assistant)
    if (pii_redacted or (guard_passed and content_enabled())) and assistant:
        yield (
            _delta_chunk(assistant, served),
            resolved,
            served,
            prompt_meta,
            None,
            memories_used,
            pii_redacted,
            pii_entities,
            guard_passed,
        )
    record_turn(
        outgoing,
        assistant,
        user_id=user_id,
        conversation_id=conversation_id,
        agent_id=agent_id,
    )
    yield None, resolved, served, prompt_meta, usage, memories_used, pii_redacted, pii_entities, guard_passed
