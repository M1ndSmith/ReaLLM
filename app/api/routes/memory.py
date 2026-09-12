from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import get_runtime, require_scopes
from app.api.errors import raise_chat
from app.application.errors import MemoryConfigError
from app.container import GatewayRuntime
from app.schemas import MemoryAddRequest, MemoryAddResponse, MemorySearchResponse

router = APIRouter()


def _require_memory(runtime: GatewayRuntime) -> None:
    if not runtime.flags.snapshot().memory:
        raise HTTPException(status_code=503, detail="Memory is disabled. Set MEMORY=1.")


@router.get("/memory", response_model=MemorySearchResponse, dependencies=[Depends(require_scopes("read", "chat"))])
async def memory_search(
    q: str = Query(..., min_length=1),
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
    top_k: int = Query(5, ge=1, le=50),
    runtime: GatewayRuntime = Depends(get_runtime),
) -> MemorySearchResponse:
    _require_memory(runtime)
    flags = runtime.flags.snapshot()
    try:
        query = q
        if flags.pii:
            query, _ = await runtime.pii.redact_text(q)
        results = await runtime.memory.search(
            query,
            user_id=user_id,
            conversation_id=conversation_id,
            agent_id=agent_id,
            top_k=top_k,
        )
        if flags.pii:
            results = await runtime.pii.redact_hits(results)
    except Exception as exc:
        raise_chat(exc)
    return MemorySearchResponse(results=results)


@router.post("/memory", response_model=MemoryAddResponse, dependencies=[Depends(require_scopes("chat"))])
async def memory_add(
    request: MemoryAddRequest,
    runtime: GatewayRuntime = Depends(get_runtime),
) -> MemoryAddResponse:
    _require_memory(runtime)
    flags = runtime.flags.snapshot()
    try:
        messages = request.messages
        if flags.pii:
            messages, _ = await runtime.pii.redact_messages(request.messages)
        await runtime.guards.assert_memory_write(messages, flags)
        payload = await runtime.memory.add(
            messages,
            user_id=request.user_id,
            conversation_id=request.conversation_id,
            agent_id=request.agent_id,
        )
    except Exception as exc:
        raise_chat(exc)
    results = payload.get("results", []) if isinstance(payload, dict) else []
    if not isinstance(results, list):
        results = []
    try:
        rows = [item if isinstance(item, dict) else {"memory": str(item)} for item in results]
        if flags.pii:
            rows = await runtime.pii.redact_result_rows(rows)
    except Exception as exc:
        raise_chat(exc)
    return MemoryAddResponse(results=rows)


@router.delete("/memory/{memory_id}", dependencies=[Depends(require_scopes("chat"))])
async def memory_delete(memory_id: str, runtime: GatewayRuntime = Depends(get_runtime)) -> dict[str, str]:
    _require_memory(runtime)
    try:
        await runtime.memory.delete(memory_id)
    except MemoryConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted"}
