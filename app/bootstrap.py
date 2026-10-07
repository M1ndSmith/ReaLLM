from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

from app.application.chat import ChatService
from app.container import GatewayRuntime
from app.infrastructure.arc_usdc import ArcUsdcReader
from app.infrastructure.arc_wallet import load_or_create_wallet, wallet_file_path
from app.infrastructure.budget import BudgetRuntime
from app.infrastructure.billing_gateway import BillingGateway
from app.infrastructure.billing_noop import NoopBilling
from app.infrastructure.billing_store import BillingStore
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
from app.infrastructure.usage_audit import UsageAuditLog
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
    wallet = None
    chain_reader = None
    if settings.billing_wallet_mode():
        wallet = load_or_create_wallet(
            wallet_file_path(settings.billing_wallet_key_path, data),
            chain_id=settings.billing_arc_chain_id,
        )
        chain_reader = ArcUsdcReader(settings.billing_arc_rpc_url, settings.billing_usdc_address)
    billing = (
        BillingStore(
            settings,
            state_path=data / "billing-state.json",
            chain_reader=chain_reader,
            wallet_address=wallet.address if wallet is not None else None,
        )
        if settings.billing_enabled()
        else NoopBilling()
    )
    billing_audit = UsageAuditLog(data / "usage-audit.jsonl")
    billing_gateway = BillingGateway(mode="arc" if settings.billing_wallet_mode() else "ledger", store=billing)
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
        billing=billing,
        billing_audit=billing_audit,
        billing_rates={
            "security_injection_scan": settings.billing_security_injection_usd,
            "security_content_scan": settings.billing_security_content_usd,
            "memory_retrieve_attach": settings.billing_memory_retrieve_usd,
            "memory_record_extract": settings.billing_memory_record_usd,
            "pii_redaction": settings.billing_pii_base_usd,
            "pii_entity": settings.billing_pii_entity_usd,
        },
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
        billing=billing,
        billing_audit=billing_audit,
        billing_gateway=billing_gateway,
    )


def create_configured_app(*, data_dir: Path | None = None, prompts_dir: Path | None = None, root: Path | None = None):
    load_dotenv_once(root)
    settings = GatewaySettings()
    runtime = build_runtime(settings, data_dir=data_dir, prompts_dir=prompts_dir)
    from app.api.app import create_app

    return create_app(runtime)
