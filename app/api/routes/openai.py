from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.dependencies import bound_identity_id, get_runtime, require_scopes
from app.api.encoders.openai import (
    completion_id,
    encode_openai,
    now_ts,
    to_chat_request,
    wrap_chat_response,
)
from app.api.errors import raise_chat
from app.api.routes.chat import command_from_chat
from app.container import GatewayRuntime
from app.schemas import EmbeddingRequest, OpenAIChatRequest
from app.structured import SchemaError, normalize_response_format

router = APIRouter()


def _embedding_payload(result: object, model: str) -> dict:
    if isinstance(result, dict):
        data = result.get("data") or []
        usage = result.get("usage") or {}
        served = result.get("model") or model
    else:
        data = getattr(result, "data", None) or []
        usage = getattr(result, "usage", None) or {}
        served = getattr(result, "model", None) or model
        if hasattr(usage, "model_dump"):
            usage = usage.model_dump()
        elif hasattr(usage, "dict"):
            usage = usage.dict()
    rows = []
    for index, item in enumerate(data):
        if isinstance(item, dict):
            vector = item.get("embedding")
            obj_index = item.get("index", index)
        else:
            vector = getattr(item, "embedding", None)
            obj_index = getattr(item, "index", index)
        rows.append({"object": "embedding", "embedding": vector, "index": obj_index})
    usage_block = usage if isinstance(usage, dict) else {}
    return {
        "object": "list",
        "data": rows,
        "model": served,
        "usage": {
            "prompt_tokens": usage_block.get("prompt_tokens") or usage_block.get("total_tokens") or 0,
            "total_tokens": usage_block.get("total_tokens") or usage_block.get("prompt_tokens") or 0,
        },
    }


def _embedding_token_estimate(budget, model: str, value: str | list[str]) -> int:
    if isinstance(value, list):
        total = sum(budget.token_count_text(model, str(item)) for item in value)
        return max(1, total) if value else 1
    return max(1, budget.token_count_text(model, str(value)))


@router.get("/v1/models", dependencies=[Depends(require_scopes("read", "chat"))])
async def openai_models(runtime: GatewayRuntime = Depends(get_runtime)) -> dict:
    return {
        "object": "list",
        "data": [
            {"id": item.id, "object": "model", "owned_by": item.provider}
            for item in runtime.catalog.list_available_models()
        ],
    }


@router.post("/v1/chat/completions", dependencies=[Depends(require_scopes("chat"))])
async def openai_chat(
    body: OpenAIChatRequest,
    request: Request,
    runtime: GatewayRuntime = Depends(get_runtime),
):
    chat_request = to_chat_request(body)
    command = command_from_chat(chat_request, request)
    chat_id = completion_id()
    created = now_ts()
    try:
        fmt = normalize_response_format(chat_request.response_format)
        if chat_request.stream:
            if fmt is not None:
                raise SchemaError("Structured output cannot be streamed. Omit stream or response_format.")
            return StreamingResponse(
                encode_openai(
                    runtime.chat.stream(command),
                    chat_id=chat_id,
                    created=created,
                    requested_model=chat_request.model,
                ),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        result = await runtime.chat.complete(command)
        return wrap_chat_response(result, chat_id=chat_id, created=created)
    except Exception as exc:
        raise_chat(exc)


@router.post("/v1/embeddings", dependencies=[Depends(require_scopes("chat"))])
async def openai_embeddings(
    body: EmbeddingRequest,
    request: Request,
    runtime: GatewayRuntime = Depends(get_runtime),
) -> dict:
    try:
        resolved = runtime.catalog.resolve_model(body.model)
        identity_id = bound_identity_id(request)
        quotas = runtime.identities.quotas_for(identity_id)
        estimated = _embedding_token_estimate(runtime.budget, resolved, body.input)
        runtime.budget.assert_allowed(
            resolved,
            estimated,
            identity_id=identity_id,
            quotas=quotas,
        )
        runtime.budget.assert_rpm(identity_id, quotas.rpm_limit)
        payload: dict = {"model": resolved, "input": body.input}
        if body.encoding_format:
            payload["encoding_format"] = body.encoding_format
        if body.user:
            payload["user"] = body.user
        result = await runtime.router.aembedding(**payload)
        body_out = _embedding_payload(result, resolved)
        tokens = body_out["usage"]["total_tokens"] or estimated
        runtime.budget.record_usage(
            tokens=tokens,
            usd=runtime.budget.completion_usd(result, resolved),
            cached=False,
            identity_id=identity_id,
        )
        return body_out
    except Exception as exc:
        raise_chat(exc)
