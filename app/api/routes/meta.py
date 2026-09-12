from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_runtime, require_scopes
from app.container import GatewayRuntime
from app.schemas import (
    BudgetInfo,
    HealthResponse,
    ModelsResponse,
    PromptsInfo,
    PromptsResponse,
    ProvidersResponse,
)

router = APIRouter(dependencies=[Depends(require_scopes("read"))])


@router.get("/health", response_model=HealthResponse)
async def health(runtime: GatewayRuntime = Depends(get_runtime)) -> HealthResponse:
    flags = runtime.flags.snapshot()
    return HealthResponse(
        status="ok",
        providers=runtime.catalog.detected_providers(),
        reliability=runtime.router.reliability_status(),
        prompts=PromptsInfo(
            enabled=runtime.prompts.prompts_enabled(),
            source=runtime.prompts.prompts_source(),
            tracing=runtime.prompts.tracing_enabled(),
        ),
        budget=runtime.budget.status(),
        memory=runtime.memory.status(flags),
        pii=runtime.pii.status(flags.pii),
        guard=runtime.guards.status(flags),
    )


@router.get("/providers", response_model=ProvidersResponse)
async def providers(runtime: GatewayRuntime = Depends(get_runtime)) -> ProvidersResponse:
    return ProvidersResponse(providers=runtime.catalog.detected_providers())


@router.get("/models", response_model=ModelsResponse)
async def models(runtime: GatewayRuntime = Depends(get_runtime)) -> ModelsResponse:
    providers_found = runtime.catalog.detected_providers()
    return ModelsResponse(providers=providers_found, models=runtime.catalog.list_available_models())


@router.get("/prompts", response_model=PromptsResponse)
async def prompts(runtime: GatewayRuntime = Depends(get_runtime)) -> PromptsResponse:
    return PromptsResponse(prompts=runtime.prompts.list_prompts())


@router.get("/budget", response_model=BudgetInfo)
async def budget(runtime: GatewayRuntime = Depends(get_runtime)) -> BudgetInfo:
    return runtime.budget.status()
