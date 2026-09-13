from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from app.api.auth import require_gateway_auth
from app.api.middleware.request_context import RequestContextMiddleware
from app.api.routes import admin, chat, config, memory, meta, metrics, openai, ready, root
from app.container import GatewayRuntime
from app.settings import GatewaySettings

_DEFAULT_CORS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def cors_origins() -> list[str]:
    return GatewaySettings().cors_origin_list()


def create_app(runtime: GatewayRuntime) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        current: GatewayRuntime = app.state.runtime
        await current.start()
        yield
        await current.close()

    application = FastAPI(
        title="ReaLMM",
        description="Opinionated LiteLLM operator stack with memory, PII, guards, and a console. Not a Portkey or LiteLLM Proxy replacement.",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.state.runtime = runtime
    origins = runtime.settings.cors_origin_list() or _DEFAULT_CORS

    class BoundCORSMiddleware(CORSMiddleware):
        def is_allowed_origin(self, origin: str) -> bool:
            return origin in application.state.runtime.settings.cors_origin_list()

    application.add_middleware(
        BoundCORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.add_middleware(RequestContextMiddleware, settings=runtime.settings)

    @application.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        request_id = getattr(request.state, "request_id", None)
        detail = exc.detail
        if isinstance(detail, dict):
            payload = dict(detail)
            if request_id and "request_id" not in payload:
                payload["request_id"] = request_id
            detail = payload
        elif isinstance(detail, str) and request_id:
            detail = {"error": detail, "request_id": request_id}
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": detail},
            headers=exc.headers,
        )

    api = APIRouter(dependencies=[Depends(require_gateway_auth)])
    api.include_router(meta.router)
    api.include_router(ready.router)
    api.include_router(metrics.router)
    api.include_router(config.router)
    api.include_router(memory.router)
    api.include_router(chat.router)
    api.include_router(openai.router)
    api.include_router(admin.router)
    application.include_router(root.router)
    application.include_router(api)
    return application
