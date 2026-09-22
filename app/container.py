from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from app.application.chat import ChatService
from app.infrastructure.budget import BudgetRuntime
from app.infrastructure.catalog import ProviderCatalog
from app.infrastructure.flags import RuntimeFlagStore
from app.infrastructure.guards import GuardService
from app.infrastructure.identities import GatewayIdentityStore
from app.infrastructure.logging_config import configure_logging
from app.infrastructure.memory import MemoryRuntime
from app.infrastructure.metrics import MetricsRuntime
from app.infrastructure.pii import PiiRuntime
from app.infrastructure.prompts import PromptRepository
from app.infrastructure.redis_health import RedisHealth
from app.infrastructure.router import LiteLLMRouterRuntime
from app.settings import GatewaySettings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class GatewayRuntime:
    settings: GatewaySettings
    flags: RuntimeFlagStore
    catalog: ProviderCatalog
    router: LiteLLMRouterRuntime
    prompts: PromptRepository
    budget: BudgetRuntime
    memory: MemoryRuntime
    pii: PiiRuntime
    guards: GuardService
    identities: GatewayIdentityStore
    metrics: MetricsRuntime
    redis_health: RedisHealth
    chat: ChatService

    async def start(self) -> None:
        configure_logging(self.settings)
        self.flags.load()
        auth_on = self.identities.auth_enabled()
        if auth_on:
            if not self.settings.allow_open_on() and not self.settings.gateway_key_pepper_value():
                raise RuntimeError(
                    "GATEWAY_KEY_PEPPER is required unless GATEWAY_ALLOW_OPEN=1. "
                    "The published Compose path hashes issued keys with this pepper."
                )
            logger.info("gateway auth: on")
        elif self.settings.allow_open_on():
            logger.warning(
                "gateway auth: off; GATEWAY_ALLOW_OPEN=1 is set. Anyone who can reach this port can call the API."
            )
        else:
            raise RuntimeError(
                "GATEWAY_API_KEY is required unless GATEWAY_ALLOW_OPEN=1. "
                "The published Compose path binds a host port — do not run the gateway open on a reachable interface."
            )
        _warn_multi_worker_without_redis(self.settings)
        await self.catalog.refresh_async()
        await self.prompts.refresh_async()
        flags = self.flags.snapshot()
        logger.info(
            "providers=%s auth=%s redis=%s layers=memory:%s pii:%s guard:%s",
            ",".join(self.catalog.detected_providers()) or "none",
            "on" if auth_on else "off",
            self.redis_health.mode(),
            _on(flags.memory),
            _on(flags.pii),
            _on(flags.guard),
        )

    async def close(self) -> None:
        await self.memory.drain(timeout=5.0)
        self.budget.close()
        self.router.close()


def _on(value: bool) -> str:
    return "on" if value else "off"


def _warn_multi_worker_without_redis(settings: GatewaySettings) -> None:
    if settings.redis_enabled():
        return
    for name in ("WEB_CONCURRENCY", "UVICORN_WORKERS"):
        raw = (os.getenv(name) or "").strip()
        if raw.isdigit() and int(raw) > 1:
            message = (
                f"{name}={raw} without REDIS_URL: response cache, RPM/TPM/cooldown, and daily budget "
                "are per-process. Set REDIS_URL or GATEWAY_ALLOW_SPLIT_BUDGET=1."
            )
            if settings.allow_split_budget_on():
                logger.warning("%s", message)
            else:
                raise RuntimeError(message)
            return
