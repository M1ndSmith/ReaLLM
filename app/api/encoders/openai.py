from __future__ import annotations

import time
import uuid
from collections.abc import AsyncIterator

from app.api.errors import openai_error_payload
from app.api.sse import DONE, sse
from app.application.events import (
    StreamDelta,
    StreamEvent,
    StreamFallback,
    StreamFinished,
    StreamStarted,
    StreamUsage,
)
from app.application.models import PromptMeta
from app.schemas import ChatRequest, ChatResponse, OpenAIChatRequest, UsageInfo


def to_chat_request(body: OpenAIChatRequest) -> ChatRequest:
    return ChatRequest(
        model=body.model,
        messages=body.messages,
        stream=body.stream,
        prompt=body.prompt,
        prompt_label=body.prompt_label,
        prompt_version=body.prompt_version,
        variables=body.variables,
        user_id=body.user_id or body.user,
        conversation_id=body.conversation_id,
        agent_id=body.agent_id,
        response_format=body.response_format,
    )


def completion_id() -> str:
    return f"chatcmpl-{uuid.uuid4().hex}"


def now_ts() -> int:
    return int(time.time())


def extras_from_chat_response(response: ChatResponse) -> dict:
    extra: dict = {
        "provider": response.provider,
        "cached": response.cached,
        "fallback_from": response.fallback_from,
        "prompt_name": response.prompt_name,
        "prompt_version": response.prompt_version,
        "prompt_source": response.prompt_source,
        "memories_used": response.memories_used,
        "pii_redacted": response.pii_redacted,
        "pii_entities": response.pii_entities,
        "guard_passed": response.guard_passed,
        "schema_valid": response.schema_valid,
    }
    if response.usage is not None and response.usage.cost_usd is not None:
        extra["cost_usd"] = response.usage.cost_usd
    return {key: value for key, value in extra.items() if value is not None or key == "cached"}


def _usage_block(usage: UsageInfo | None) -> dict | None:
    if usage is None:
        return None
    return {
        "prompt_tokens": usage.prompt_tokens or 0,
        "completion_tokens": usage.completion_tokens or 0,
        "total_tokens": usage.total_tokens or 0,
    }


def wrap_chat_response(response: ChatResponse, *, chat_id: str, created: int) -> dict:
    payload = {
        "id": chat_id,
        "object": "chat.completion",
        "created": created,
        "model": response.model,
        "choices": [
            {
                "index": 0,
                "message": {"role": response.message.role, "content": response.message.content},
                "finish_reason": "stop",
            }
        ],
        "usage": _usage_block(response.usage),
    }
    payload.update(extras_from_chat_response(response))
    return payload


def openai_chunk(
    *,
    chat_id: str,
    created: int,
    model: str,
    delta: dict | None = None,
    extras: dict | None = None,
    finish_reason: str | None = None,
    usage: dict | None = None,
) -> dict:
    payload = {
        "id": chat_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": delta if delta is not None else {},
                "finish_reason": finish_reason,
            }
        ],
    }
    if extras:
        payload.update(extras)
    if usage is not None:
        payload["usage"] = usage
    return payload


def _stream_extras(event: StreamStarted) -> dict:
    extras: dict = {"provider": event.provider}
    if event.memories_used is not None:
        extras["memories_used"] = event.memories_used
    if event.pii_redacted is not None:
        extras["pii_redacted"] = event.pii_redacted
        if event.pii_entities:
            extras["pii_entities"] = event.pii_entities
    if event.guard_passed is not None:
        extras["guard_passed"] = event.guard_passed
    if event.prompt_meta is not None:
        extras.update(_prompt_fields(event.prompt_meta))
    return extras


def _prompt_fields(meta: PromptMeta) -> dict:
    return {
        "prompt_name": meta.name,
        "prompt_version": meta.version,
        "prompt_source": meta.source,
    }


async def encode_openai(
    events: AsyncIterator[StreamEvent],
    *,
    chat_id: str,
    created: int,
    requested_model: str,
) -> AsyncIterator[str]:
    model_id = requested_model
    finish_extras: dict | None = None
    usage_event: StreamUsage | None = None
    started = False
    try:
        async for event in events:
            if isinstance(event, StreamStarted):
                started = True
                model_id = event.model
                yield sse(
                    openai_chunk(
                        chat_id=chat_id,
                        created=created,
                        model=event.model,
                        delta={"role": "assistant"},
                        extras=_stream_extras(event),
                    )
                )
            elif isinstance(event, StreamDelta):
                if event.content:
                    yield sse(
                        openai_chunk(
                            chat_id=chat_id,
                            created=created,
                            model=model_id,
                            delta={"content": event.content},
                        )
                    )
            elif isinstance(event, StreamFallback):
                model_id = event.model
                finish_extras = {
                    "provider": event.provider,
                    "cached": False,
                    "fallback_from": event.fallback_from,
                }
            elif isinstance(event, StreamUsage):
                usage_event = event
            elif isinstance(event, StreamFinished):
                if event.model:
                    model_id = event.model
                yield sse(
                    openai_chunk(
                        chat_id=chat_id,
                        created=created,
                        model=model_id,
                        extras=finish_extras,
                        finish_reason=event.finish_reason,
                    )
                )
                if usage_event is not None:
                    usage_block = _usage_block(usage_event.usage)
                    extras = {"cost_usd": usage_event.cost_usd} if usage_event.cost_usd is not None else None
                    yield sse(
                        openai_chunk(
                            chat_id=chat_id,
                            created=created,
                            model=model_id,
                            extras=extras,
                            usage=usage_block,
                        )
                    )
                yield DONE
                return
        if started:
            yield sse(
                openai_chunk(
                    chat_id=chat_id,
                    created=created,
                    model=model_id,
                    extras=finish_extras,
                    finish_reason="stop",
                )
            )
            if usage_event is not None:
                extras = {"cost_usd": usage_event.cost_usd} if usage_event.cost_usd is not None else None
                yield sse(
                    openai_chunk(
                        chat_id=chat_id,
                        created=created,
                        model=model_id,
                        extras=extras,
                        usage=_usage_block(usage_event.usage),
                    )
                )
        yield DONE
    except Exception as exc:
        yield sse(openai_error_payload(exc))
        yield DONE
