from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

from app.application.chat import ChatService
from app.container import GatewayRuntime
from app.infrastructure.budget import BudgetRuntime
from app.infrastructure.catalog import ProviderCatalog
from app.infrastructure.flags import RuntimeFlagStore
from app.infrastructure.guards import GuardService
from app.infrastructure.identities import GatewayIdentityStore
from app.infrastructure.memory import MemoryRuntime
from app.infrastructure.metrics import MetricsRuntime
from app.infrastructure.pii import PiiRuntime
from app.infrastructure.prompts import PromptRepository
from app.infrastructure.redis_health import RedisHealth
from app.infrastructure.router import LiteLLMRouterRuntime
from app.infrastructure.telemetry import StageTelemetry
from app.settings import GatewaySettings

_ROOT = Path(__file__).resolve().parent.parent
_DOTENV_LOADED = False


def load_dotenv_once(root: Path | None = None) -> None:
    global _DOTENV_LOADED
    if _DOTENV_LOADED:
        return
    path = (root or _ROOT) / ".env"
    load_dotenv(path, override=False)
    _DOTENV_LOADED = True


def reset_dotenv_loaded() -> None:
    global _DOTENV_LOADED
    _DOTENV_LOADED = False


def build_runtime(
    settings: GatewaySettings,
    *,
    data_dir: Path | None = None,
    prompts_dir: Path | None = None,
) -> GatewayRuntime:
    data = data_dir or (_ROOT / "data")
    prompts_path = prompts_dir or (_ROOT / "prompts")
    flags = RuntimeFlagStore(settings, data / "runtime-flags.json")
    catalog = ProviderCatalog(settings)
    prompts = PromptRepository(settings, prompts_dir=prompts_path)
    redis_health = RedisHealth(settings)
    budget = BudgetRuntime(settings, state_path=data / "budget-state.json", redis_health=redis_health)
    router = LiteLLMRouterRuntime(settings, catalog, tracing=prompts.ensure_tracing, redis_health=redis_health)
    pii = PiiRuntime(settings)
    memory = MemoryRuntime(settings, catalog, router, budget, mem0_dir=data / "mem0")
    guards = GuardService(settings, catalog, router, budget)
    identities = GatewayIdentityStore(settings, data / "gateway-keys.json")
    metrics = MetricsRuntime(settings.obs_metrics_on())
    chat = ChatService(
        flags=flags,
        catalog=catalog,
        prompts=prompts,
        pii=pii,
        memory=memory,
        guards=guards,
        budget=budget,
        backend=router,
        identities=identities,
        telemetry_factory=StageTelemetry,
    )
    return GatewayRuntime(
        settings=settings,
        flags=flags,
        catalog=catalog,
        router=router,
        prompts=prompts,
        budget=budget,
        memory=memory,
        pii=pii,
        guards=guards,
        identities=identities,
        metrics=metrics,
        redis_health=redis_health,
        chat=chat,
    )


def create_configured_app(*, data_dir: Path | None = None, prompts_dir: Path | None = None, root: Path | None = None):
    load_dotenv_once(root)
    settings = GatewaySettings()
    runtime = build_runtime(settings, data_dir=data_dir, prompts_dir=prompts_dir)
    from app.api.app import create_app

    return create_app(runtime)
