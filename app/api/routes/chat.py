from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_runtime
from app.api.encoders.native import encode_native
from app.api.errors import raise_chat
from app.application.models import ChatCommand
from app.container import GatewayRuntime
from app.schemas import ChatRequest
from app.structured import SchemaError, normalize_response_format

router = APIRouter()


def _command(request: ChatRequest) -> ChatCommand:
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


@router.post("/chat")
async def chat(request: ChatRequest, runtime: GatewayRuntime = Depends(get_runtime)):
    try:
        fmt = normalize_response_format(request.response_format)
        if request.stream:
            if fmt is not None:
                raise SchemaError("Structured output cannot be streamed. Omit stream or response_format.")
            return StreamingResponse(
                encode_native(runtime.chat.stream(_command(request))),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        return await runtime.chat.complete(_command(request))
    except Exception as exc:
        raise_chat(exc)
