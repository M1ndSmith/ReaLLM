from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_runtime
from app.api.encoders.openai import (
    completion_id,
    encode_openai,
    now_ts,
    to_chat_request,
    wrap_chat_response,
)
from app.api.errors import raise_chat
from app.application.models import ChatCommand
from app.container import GatewayRuntime
from app.schemas import OpenAIChatRequest
from app.structured import SchemaError, normalize_response_format

router = APIRouter()


def _command(request) -> ChatCommand:
    return ChatCommand(
        model=request.model,
        messages=request.messages,
        prompt=request.prompt,
        prompt_label=request.prompt_label,
        prompt_version=request.prompt_version,
        variables=request.variables,
        user_id=request.user_id,
        conversation_id=request.conversation_id,
        agent_id=request.agent_id,
        response_format=request.response_format,
    )


@router.get("/v1/models")
async def openai_models(runtime: GatewayRuntime = Depends(get_runtime)) -> dict:
    return {
        "object": "list",
        "data": [
            {"id": item.id, "object": "model", "owned_by": item.provider}
            for item in runtime.catalog.list_available_models()
        ],
    }


@router.post("/v1/chat/completions")
async def openai_chat(body: OpenAIChatRequest, runtime: GatewayRuntime = Depends(get_runtime)):
    request = to_chat_request(body)
    chat_id = completion_id()
    created = now_ts()
    try:
        fmt = normalize_response_format(request.response_format)
        if request.stream:
            if fmt is not None:
                raise SchemaError("Structured output cannot be streamed. Omit stream or response_format.")
            return StreamingResponse(
                encode_openai(
                    runtime.chat.stream(_command(request)),
                    chat_id=chat_id,
                    created=created,
                    requested_model=request.model,
                ),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        result = await runtime.chat.complete(_command(request))
        return wrap_chat_response(result, chat_id=chat_id, created=created)
    except Exception as exc:
        raise_chat(exc)
