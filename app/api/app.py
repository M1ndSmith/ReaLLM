from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.api.auth import require_gateway_auth
from app.api.routes import chat, config, memory, meta, openai, root
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
        description="LiteLLM endpoints that detect providers from API keys. Select a model only.",
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
    api = APIRouter(dependencies=[Depends(require_gateway_auth)])
    api.include_router(meta.router)
    api.include_router(config.router)
    api.include_router(memory.router)
    api.include_router(chat.router)
    api.include_router(openai.router)
    application.include_router(root.router)
    application.include_router(api)
    return application
