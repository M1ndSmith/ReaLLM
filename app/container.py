from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from app.application.chat import ChatService
from app.infrastructure.budget import BudgetRuntime
from app.infrastructure.catalog import ProviderCatalog
from app.infrastructure.flags import RuntimeFlagStore
from app.infrastructure.guards import GuardService
from app.infrastructure.memory import MemoryRuntime
from app.infrastructure.pii import PiiRuntime
from app.infrastructure.prompts import PromptRepository
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
    chat: ChatService

    async def start(self) -> None:
        self.flags.load()
        if self.settings.auth_required():
            logger.info("gateway auth: on")
        else:
            logger.warning(
                "gateway auth: off; anyone who can reach this port can call the API. "
                "Compose publishes 8000:8000 — set GATEWAY_API_KEY when the port is network-reachable."
            )
        _warn_multi_worker_without_redis(self.settings)
        flags = self.flags.snapshot()
        logger.info(
            "providers=%s auth=%s redis=%s layers=memory:%s pii:%s guard:%s",
            ",".join(self.catalog.detected_providers()) or "none",
            "on" if self.settings.auth_required() else "off",
            "on" if self.settings.redis_enabled() else "off",
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
            logger.warning(
                "%s=%s without REDIS_URL: response cache, RPM/TPM/cooldown, and daily budget are per-process",
                name,
                raw,
            )
            return
