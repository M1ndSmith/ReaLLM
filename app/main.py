from __future__ import annotations

import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from litellm.exceptions import APIError, AuthenticationError, BadRequestError, RateLimitError

from app import llm
from app.reliability import reliability_status
from app.schemas import ChatRequest, HealthResponse, ModelsResponse, ProvidersResponse

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
    )


@app.get("/providers", response_model=ProvidersResponse)
async def providers() -> ProvidersResponse:
    return ProvidersResponse(providers=llm.detected_providers())


@app.get("/models", response_model=ModelsResponse)
async def models() -> ModelsResponse:
    providers_found = llm.detected_providers()
    return ModelsResponse(providers=providers_found, models=llm.list_available_models())


@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        if request.stream:
            return StreamingResponse(
                _sse_chat(request),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        return await llm.complete_chat(request.model, request.messages)
    except llm.UnknownModelError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
        resolved = llm.resolve_model(request.model)
        yield _sse({"model": resolved, "provider": llm.provider_for_model(resolved)})
        served = resolved
        async for chunk, _requested, chunk_served in llm.stream_chat(request.model, request.messages):
            served = chunk_served
            delta = ""
            if chunk.choices:
                delta = chunk.choices[0].delta.content or ""
            if delta:
                yield _sse({"content": delta})
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
        yield "data: [DONE]\n\n"
    except llm.UnknownModelError as exc:
        yield _sse({"error": str(exc)})
    except Exception as exc:
        yield _sse({"error": str(exc)})


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
