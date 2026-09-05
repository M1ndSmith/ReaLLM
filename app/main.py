from __future__ import annotations

import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from litellm.exceptions import APIError, AuthenticationError, BadRequestError, RateLimitError

from app import llm
from app.budget import BudgetExceededError, InputTooLargeError, budget_status
from app.memory import (
    MemoryConfigError,
    add_memories,
    delete_memory,
    memory_enabled,
    memory_status,
    search_memories,
)
from app.prompts import UnknownPromptError, list_prompts, prompts_enabled, prompts_source
from app.reliability import reliability_status
from app.schemas import (
    BudgetInfo,
    ChatRequest,
    HealthResponse,
    MemoryAddRequest,
    MemoryAddResponse,
    MemorySearchResponse,
    ModelsResponse,
    PromptsInfo,
    PromptsResponse,
    ProvidersResponse,
)

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(
    title="ReaLMM",
    description="LiteLLM endpoints that detect providers from API keys. Select a model only.",
    version="0.1.0",
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        providers=llm.detected_providers(),
        reliability=reliability_status(),
        prompts=PromptsInfo(enabled=prompts_enabled(), source=prompts_source()),
        budget=budget_status(),
        memory=memory_status(),
    )


@app.get("/providers", response_model=ProvidersResponse)
async def providers() -> ProvidersResponse:
    return ProvidersResponse(providers=llm.detected_providers())


@app.get("/models", response_model=ModelsResponse)
async def models() -> ModelsResponse:
    providers_found = llm.detected_providers()
    return ModelsResponse(providers=providers_found, models=llm.list_available_models())


@app.get("/prompts", response_model=PromptsResponse)
async def prompts() -> PromptsResponse:
    return PromptsResponse(prompts=list_prompts())


@app.get("/budget", response_model=BudgetInfo)
async def budget() -> BudgetInfo:
    return budget_status()


def _require_memory() -> None:
    if not memory_enabled():
        raise HTTPException(status_code=503, detail="Memory is disabled. Set MEMORY=1.")


@app.get("/memory", response_model=MemorySearchResponse)
async def memory_search(
    q: str = Query(..., min_length=1),
    user_id: str | None = None,
    conversation_id: str | None = None,
    agent_id: str | None = None,
    top_k: int = Query(5, ge=1, le=50),
) -> MemorySearchResponse:
    _require_memory()
    try:
        results = await search_memories(
            q,
            user_id=user_id,
            conversation_id=conversation_id,
            agent_id=agent_id,
            top_k=top_k,
        )
    except MemoryConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return MemorySearchResponse(results=results)


@app.post("/memory", response_model=MemoryAddResponse)
async def memory_add(request: MemoryAddRequest) -> MemoryAddResponse:
    _require_memory()
    try:
        payload = await add_memories(
            request.messages,
            user_id=request.user_id,
            conversation_id=request.conversation_id,
            agent_id=request.agent_id,
        )
    except MemoryConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    results = payload.get("results", []) if isinstance(payload, dict) else []
    if not isinstance(results, list):
        results = []
    return MemoryAddResponse(results=[item if isinstance(item, dict) else {"memory": str(item)} for item in results])


@app.delete("/memory/{memory_id}")
async def memory_delete(memory_id: str) -> dict[str, str]:
    _require_memory()
    try:
        await delete_memory(memory_id)
    except MemoryConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted"}


@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        if request.stream:
            return StreamingResponse(
                _sse_chat(request),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        return await llm.complete_chat(
            request.model,
            request.messages,
            prompt=request.prompt,
            prompt_label=request.prompt_label,
            prompt_version=request.prompt_version,
            variables=request.variables,
            user_id=request.user_id,
            conversation_id=request.conversation_id,
            agent_id=request.agent_id,
        )
    except llm.UnknownModelError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except UnknownPromptError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InputTooLargeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except BudgetExceededError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    except AuthenticationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except RateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except BadRequestError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except APIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


async def _sse_chat(request: ChatRequest):
    try:
        first = True
        served = None
        resolved = None
        usage_payload = None
        async for chunk, requested, chunk_served, prompt_meta, usage, memories_used in llm.stream_chat(
            request.model,
            request.messages,
            prompt=request.prompt,
            prompt_label=request.prompt_label,
            prompt_version=request.prompt_version,
            variables=request.variables,
            user_id=request.user_id,
            conversation_id=request.conversation_id,
            agent_id=request.agent_id,
        ):
            resolved = requested
            served = chunk_served
            if first:
                payload = {
                    "model": requested,
                    "provider": llm.provider_for_model(requested),
                }
                if memories_used is not None:
                    payload["memories_used"] = memories_used
                if prompt_meta is not None:
                    payload.update(
                        {
                            "prompt_name": prompt_meta.name,
                            "prompt_version": prompt_meta.version,
                            "prompt_source": prompt_meta.source,
                        }
                    )
                yield _sse(payload)
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
                yield _sse({"content": delta})
        if resolved is not None and served is not None:
            fallback_from = llm.fallback_from(resolved, served)
            if fallback_from or served != resolved:
                yield _sse(
                    {
                        "model": served if fallback_from else resolved,
                        "provider": llm.provider_for_model(served if fallback_from else resolved),
                        "cached": False,
                        "fallback_from": fallback_from,
                    }
                )
        if usage_payload is not None:
            yield _sse({"usage": usage_payload.model_dump(), "cost_usd": usage_payload.cost_usd})
        yield "data: [DONE]\n\n"
    except llm.UnknownModelError as exc:
        yield _sse({"error": str(exc)})
    except UnknownPromptError as exc:
        yield _sse({"error": str(exc)})
    except InputTooLargeError as exc:
        yield _sse({"error": str(exc)})
    except BudgetExceededError as exc:
        yield _sse({"error": str(exc)})
    except Exception as exc:
        yield _sse({"error": str(exc)})


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
