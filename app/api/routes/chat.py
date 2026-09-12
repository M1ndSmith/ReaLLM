from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.dependencies import bound_identity_id, get_runtime, require_scopes
from app.api.encoders.native import encode_native
from app.api.errors import raise_chat
from app.application.models import ChatCommand
from app.container import GatewayRuntime
from app.schemas import ChatRequest
from app.structured import SchemaError, normalize_response_format

router = APIRouter(dependencies=[Depends(require_scopes("chat"))])


def command_from_chat(body: ChatRequest, request: Request) -> ChatCommand:
    return ChatCommand(
        model=body.model,
        messages=body.messages,
        prompt=body.prompt,
        prompt_label=body.prompt_label,
        prompt_version=body.prompt_version,
        variables=body.variables,
        user_id=body.user_id,
        conversation_id=body.conversation_id,
        agent_id=body.agent_id,
        response_format=body.response_format,
        identity_id=bound_identity_id(request),
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        tools=body.tools,
        tool_choice=body.tool_choice,
    )


@router.post("/chat")
async def chat(body: ChatRequest, request: Request, runtime: GatewayRuntime = Depends(get_runtime)):
    try:
        fmt = normalize_response_format(body.response_format)
        command = command_from_chat(body, request)
        if body.stream:
            if fmt is not None:
                raise SchemaError("Structured output cannot be streamed. Omit stream or response_format.")
            return StreamingResponse(
                encode_native(runtime.chat.stream(command)),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        return await runtime.chat.complete(command)
    except Exception as exc:
        raise_chat(exc)
