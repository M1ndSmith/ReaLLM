from __future__ import annotations

import json
import time
import uuid

from app import llm
from app.guardrails import GuardBlockedError
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


def openai_error_payload(exc: BaseException) -> dict:
    payload: dict = {"error": {"message": str(exc), "type": type(exc).__name__}}
    if isinstance(exc, GuardBlockedError):
        payload["error"]["type"] = "guard_blocked"
        payload["scanner"] = exc.scanner
        payload["categories"] = exc.categories
        payload["category_names"] = exc.category_names
    return payload


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _stream_extras(
    requested: str,
    memories_used: int | None,
    pii_redacted: bool | None,
    pii_entities: list[str] | None,
    guard_passed: bool | None,
    prompt_meta,
) -> dict:
    extras: dict = {
        "provider": llm.provider_for_model(requested),
    }
    if memories_used is not None:
        extras["memories_used"] = memories_used
    if pii_redacted is not None:
        extras["pii_redacted"] = pii_redacted
        if pii_entities:
            extras["pii_entities"] = pii_entities
    if guard_passed is not None:
        extras["guard_passed"] = guard_passed
    if prompt_meta is not None:
        extras["prompt_name"] = prompt_meta.name
        extras["prompt_version"] = prompt_meta.version
        extras["prompt_source"] = prompt_meta.source
    return extras


async def sse_openai_chat(request: ChatRequest, *, chat_id: str, created: int):
    try:
        first = True
        served = None
        resolved = None
        usage_payload = None
        async for (
            chunk,
            requested,
            chunk_served,
            prompt_meta,
            usage,
            memories_used,
            pii_redacted,
            pii_entities,
            guard_passed,
        ) in llm.stream_chat(
            request.model,
            request.messages,
            prompt=request.prompt,
            prompt_label=request.prompt_label,
            prompt_version=request.prompt_version,
            variables=request.variables,
            user_id=request.user_id,
            conversation_id=request.conversation_id,
            agent_id=request.agent_id,
            response_format=request.response_format,
        ):
            resolved = requested
            served = chunk_served
            if first:
                extras = _stream_extras(
                    requested,
                    memories_used,
                    pii_redacted,
                    pii_entities,
                    guard_passed,
                    prompt_meta,
                )
                yield _sse(
                    openai_chunk(
                        chat_id=chat_id,
                        created=created,
                        model=requested,
                        delta={"role": "assistant"},
                        extras=extras,
                    )
                )
                first = False
            if usage is not None:
                usage_payload = usage
            if chunk is None:
                continue
            delta = ""
            if chunk.choices:
                choice = chunk.choices[0]
                delta_obj = getattr(choice, "delta", None)
                delta = (getattr(delta_obj, "content", None) or "") if delta_obj is not None else ""
            if delta:
                yield _sse(
                    openai_chunk(
                        chat_id=chat_id,
                        created=created,
                        model=requested,
                        delta={"content": delta},
                    )
                )
        model_id = request.model
        extras = None
        if resolved is not None and served is not None:
            model_id = served if llm.fallback_from(resolved, served) else resolved
            fallback_from = llm.fallback_from(resolved, served)
            if fallback_from or served != resolved:
                extras = {
                    "provider": llm.provider_for_model(model_id),
                    "cached": False,
                    "fallback_from": fallback_from,
                }
        yield _sse(
            openai_chunk(
                chat_id=chat_id,
                created=created,
                model=model_id,
                extras=extras,
                finish_reason="stop",
            )
        )
        if usage_payload is not None:
            usage_block = _usage_block(usage_payload)
            chunk = openai_chunk(
                chat_id=chat_id,
                created=created,
                model=model_id,
                extras={"cost_usd": usage_payload.cost_usd} if usage_payload.cost_usd is not None else None,
                usage=usage_block,
            )
            yield _sse(chunk)
        yield "data: [DONE]\n\n"
    except Exception as exc:
        yield _sse(openai_error_payload(exc))
        yield "data: [DONE]\n\n"


def now_ts() -> int:
    return int(time.time())
