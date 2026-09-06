from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from litellm.exceptions import APIError, AuthenticationError, BadRequestError, RateLimitError
from starlette.middleware.cors import CORSMiddleware

from app import llm
from app.budget import BudgetExceededError, InputTooLargeError, budget_status
from app.guardrails import GuardBlockedError, GuardConfigError, assert_memory_write, guard_status
from app.memory import (
    MemoryConfigError,
    add_memories,
    delete_memory,
    memory_enabled,
    memory_status,
    search_memories,
)
from app.pii import (
    PiiConfigError,
    pii_status,
    redact_hits,
    redact_messages,
    redact_result_rows,
    redact_text,
)
from app.prompts import UnknownPromptError, list_prompts, prompts_enabled, prompts_source, tracing_enabled
from app.reliability import reliability_status
from app.structured import SchemaError, normalize_response_format
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

_DEFAULT_CORS = "http://localhost:3000,http://127.0.0.1:3000"


def cors_origins() -> list[str]:
    raw = (os.getenv("CORS_ORIGINS") or _DEFAULT_CORS).strip()
    return [item.strip() for item in raw.split(",") if item.strip()]


def console_url() -> str:
    return (os.getenv("CONSOLE_URL") or "http://localhost:3000").strip().rstrip("/")


class EnvCORSMiddleware(CORSMiddleware):
    def is_allowed_origin(self, origin: str) -> bool:
        return origin in cors_origins()


app = FastAPI(
    title="ReaLMM",
    description="LiteLLM endpoints that detect providers from API keys. Select a model only.",
    version="0.1.0",
)
app.add_middleware(
    EnvCORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _pointer_page() -> str:
    dest = console_url()
    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ReaLMM gateway</title>
    <style>
      :root {{
        --ink: #07141f;
        --paper: #e7f2f6;
        --signal: #2ec4b6;
        --mute: #8ba4b7;
      }}
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: var(--ink);
        color: var(--paper);
        font-family: "IBM Plex Sans", system-ui, sans-serif;
      }}
      main {{
        max-width: 36rem;
        padding: 2rem;
      }}
      h1 {{
        font-family: Syne, system-ui, sans-serif;
        font-weight: 800;
        letter-spacing: -0.04em;
        margin: 0 0 0.75rem;
      }}
      p {{ color: var(--mute); line-height: 1.5; }}
      a {{ color: var(--signal); }}
    </style>
  </head>
  <body>
    <main>
      <h1>ReaLMM</h1>
      <p>This process is the gateway. Completions go through <code>POST /chat</code>.</p>
      <p>Open the Next.js console at <a href="{dest}">{dest}</a>. Keys stay in <code>.env</code>; the console does not write them.</p>
      <p>API docs: <a href="/docs">/docs</a>.</p>
    </main>
  </body>
</html>
"""


@app.get("/", include_in_schema=False)
async def index() -> HTMLResponse:
    return HTMLResponse(_pointer_page())


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        providers=llm.detected_providers(),
        reliability=reliability_status(),
        prompts=PromptsInfo(
            enabled=prompts_enabled(),
            source=prompts_source(),
            tracing=tracing_enabled(),
        ),
        budget=budget_status(),
        memory=memory_status(),
        pii=pii_status(),
        guard=guard_status(),
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


def _guard_blocked_detail(exc: GuardBlockedError) -> dict:
    return {
        "error": str(exc),
        "scanner": exc.scanner,
        "categories": exc.categories,
        "category_names": exc.category_names,
    }


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
        query, _ = await redact_text(q)
        results = await search_memories(
            query,
            user_id=user_id,
            conversation_id=conversation_id,
            agent_id=agent_id,
            top_k=top_k,
        )
        results = await redact_hits(results)
    except GuardBlockedError as exc:
        raise HTTPException(status_code=400, detail=_guard_blocked_detail(exc)) from exc
    except GuardConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PiiConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except MemoryConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return MemorySearchResponse(results=results)


@app.post("/memory", response_model=MemoryAddResponse)
async def memory_add(request: MemoryAddRequest) -> MemoryAddResponse:
    _require_memory()
    try:
        messages, _ = await redact_messages(request.messages)
        await assert_memory_write(messages)
        payload = await add_memories(
            messages,
            user_id=request.user_id,
            conversation_id=request.conversation_id,
            agent_id=request.agent_id,
        )
    except GuardBlockedError as exc:
        raise HTTPException(status_code=400, detail=_guard_blocked_detail(exc)) from exc
    except GuardConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PiiConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except MemoryConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    results = payload.get("results", []) if isinstance(payload, dict) else []
    if not isinstance(results, list):
        results = []
    try:
        rows = await redact_result_rows(
            [item if isinstance(item, dict) else {"memory": str(item)} for item in results]
        )
    except PiiConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return MemoryAddResponse(results=rows)


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
        fmt = normalize_response_format(request.response_format)
        if request.stream:
            if fmt is not None:
                raise SchemaError("Structured output cannot be streamed. Omit stream or response_format.")
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
            response_format=request.response_format,
        )
    except llm.UnknownModelError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except UnknownPromptError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except InputTooLargeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except BudgetExceededError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    except GuardBlockedError as exc:
        raise HTTPException(status_code=400, detail=_guard_blocked_detail(exc)) from exc
    except SchemaError as exc:
        detail: dict = {"error": str(exc)}
        if exc.path:
            detail["path"] = exc.path
        raise HTTPException(status_code=400, detail=detail) from exc
    except GuardConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except PiiConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
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
        async for chunk, requested, chunk_served, prompt_meta, usage, memories_used, pii_redacted, pii_entities, guard_passed in llm.stream_chat(
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
                payload = {
                    "model": requested,
                    "provider": llm.provider_for_model(requested),
                }
                if memories_used is not None:
                    payload["memories_used"] = memories_used
                if pii_redacted is not None:
                    payload["pii_redacted"] = pii_redacted
                    if pii_entities:
                        payload["pii_entities"] = pii_entities
                if guard_passed is not None:
                    payload["guard_passed"] = guard_passed
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
    except GuardBlockedError as exc:
        yield _sse(_guard_blocked_detail(exc))
    except GuardConfigError as exc:
        yield _sse({"error": str(exc)})
    except SchemaError as exc:
        payload = {"error": str(exc)}
        if exc.path:
            payload["path"] = exc.path
        yield _sse(payload)
    except PiiConfigError as exc:
        yield _sse({"error": str(exc)})
    except Exception as exc:
        yield _sse({"error": str(exc)})


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
