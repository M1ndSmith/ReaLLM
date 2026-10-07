from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import AbstractContextManager
from typing import Protocol

from app.application.models import (
    BillingLineItem,
    BillingStatus,
    BillingSubject,
    IdentityQuotas,
    PromptMeta,
    RuntimeFlags,
)
from app.schemas import (
    BudgetInfo,
    ChatMessage,
    GuardInfo,
    MemoryHit,
    MemoryInfo,
    ModelInfo,
    PiiInfo,
    PromptListItem,
    ReliabilityInfo,
    UsageInfo,
)


class CompletionBackend(Protocol):
    async def acompletion(self, **kwargs): ...

    def completion(self, **kwargs): ...

    def chat_fallback_ids(self, requested: str) -> list[str]: ...

    def reliability_status(self) -> ReliabilityInfo: ...


class ModelCatalogPort(Protocol):
    def detected_providers(self) -> list[str]: ...

    def list_available_models(self, *, refresh: bool = False) -> list[ModelInfo]: ...

    def resolve_model(self, requested: str) -> str: ...

    def provider_for_model(self, model_id: str) -> str: ...

    def fallback_from(self, requested: str, served: str) -> str | None: ...

    def is_chat_model(self, model_id: str) -> bool: ...


class PromptPort(Protocol):
    def prepare_messages(
        self,
        messages: list[ChatMessage],
        prompt: str | None = None,
        prompt_label: str | None = None,
        prompt_version: int | None = None,
        variables: dict[str, str] | None = None,
    ) -> tuple[list[ChatMessage], PromptMeta | None]: ...

    def list_prompts(self) -> list[PromptListItem]: ...

    def prompts_enabled(self) -> bool: ...

    def prompts_source(self) -> str: ...

    def tracing_enabled(self) -> bool: ...

    def ensure_tracing(self) -> None: ...


class MemoryPort(Protocol):
    def enabled(self, flags: RuntimeFlags) -> bool: ...

    def status(self, flags: RuntimeFlags) -> MemoryInfo: ...

    async def attach(
        self,
        messages: list[ChatMessage],
        flags: RuntimeFlags,
        *,
        user_id: str | None = None,
        conversation_id: str | None = None,
        agent_id: str | None = None,
    ) -> tuple[list[ChatMessage], int | None]: ...

    def schedule_record(
        self,
        messages: list[ChatMessage],
        assistant: str,
        flags: RuntimeFlags,
        *,
        user_id: str | None = None,
        conversation_id: str | None = None,
        agent_id: str | None = None,
    ) -> None: ...

    async def search(
        self,
        query: str,
        *,
        user_id: str | None = None,
        conversation_id: str | None = None,
        agent_id: str | None = None,
        top_k: int = 5,
    ) -> list[MemoryHit]: ...

    async def add(
        self,
        messages: list[ChatMessage],
        *,
        user_id: str | None = None,
        conversation_id: str | None = None,
        agent_id: str | None = None,
    ) -> object: ...

    async def delete(self, memory_id: str, *, user_id: str | None = None) -> None: ...

    async def drain(self, timeout: float = 5.0) -> None: ...


class IdentityQuotaPort(Protocol):
    def quotas_for(self, identity_id: str | None) -> IdentityQuotas: ...


class StageClock(Protocol):
    def stage(self, name: str) -> AbstractContextManager[None]: ...

    def snapshot(self) -> dict[str, float]: ...


class UsageBudgetPort(Protocol):
    def token_count(self, model: str, messages: list[ChatMessage] | list[dict]) -> int: ...

    def token_count_text(self, model: str, text: str) -> int: ...

    def max_output_tokens(self) -> int: ...

    def estimated_input_usd(self, model: str, prompt_tokens: int) -> float | None: ...

    def assert_allowed(
        self,
        model: str,
        estimated_tokens: int,
        *,
        identity_id: str | None = None,
        quotas: IdentityQuotas | None = None,
    ) -> None: ...

    def assert_rpm(self, identity_id: str | None, rpm_limit: int | None) -> None: ...

    def reserve(
        self,
        model: str,
        estimated_tokens: int,
        *,
        identity_id: str | None = None,
        quotas: IdentityQuotas | None = None,
    ) -> str: ...

    def release(self, reservation_id: str | None) -> None: ...

    def record_usage(
        self,
        *,
        tokens: int | None,
        usd: float | None,
        cached: bool,
        identity_id: str | None = None,
        reservation_id: str | None = None,
    ) -> None: ...

    def attach_cost(self, usage: UsageInfo | None, cost: float | None) -> UsageInfo | None: ...

    def completion_usd(self, response: object, model: str) -> float | None: ...

    def usage_from_counts(
        self,
        model: str,
        prompt_tokens: int | None,
        completion_tokens: int | None,
        *,
        cost: float | None = None,
    ) -> UsageInfo: ...

    def status(self) -> BudgetInfo: ...


class PiiPort(Protocol):
    async def redact_text(self, text: str) -> tuple[str, list[str]]: ...

    async def redact_messages(self, messages: list[ChatMessage]) -> tuple[list[ChatMessage], list[str]]: ...

    async def redact_hits(self, hits: list[MemoryHit]) -> list[MemoryHit]: ...

    async def redact_result_rows(self, rows: list[dict]) -> list[dict]: ...

    def unique_entity_types(self, *groups: list[str]) -> list[str]: ...

    def status(self, enabled: bool) -> PiiInfo: ...


class GuardPort(Protocol):
    def status(self, flags: RuntimeFlags) -> GuardInfo: ...

    def content_enabled(self, flags: RuntimeFlags) -> bool: ...

    async def assert_inbound(
        self,
        messages: list[ChatMessage],
        flags: RuntimeFlags,
        *,
        identity_id: str | None = None,
    ) -> None: ...

    async def assert_outbound(
        self,
        assistant: str,
        flags: RuntimeFlags,
        *,
        identity_id: str | None = None,
        user_text: str = "",
    ) -> None: ...

    async def assert_memory_write(
        self,
        messages: list[ChatMessage],
        flags: RuntimeFlags,
        *,
        identity_id: str | None = None,
    ) -> None: ...


class FlagStorePort(Protocol):
    def snapshot(self) -> RuntimeFlags: ...

    def apply_layer_patch(self, layers: dict[str, bool | None]) -> RuntimeFlags: ...

    def config_payload(self, *, auth_required: bool) -> dict: ...


class ChatStream(Protocol):
    def __aiter__(self) -> AsyncIterator[object]: ...


class BillingEntitlementPort(Protocol):
    def subject_for(self, identity_id: str | None, quotas: IdentityQuotas | None = None) -> BillingSubject: ...

    def assert_can_spend(
        self,
        subject: BillingSubject,
        estimated_usd: float | None,
        *,
        quotas: IdentityQuotas | None = None,
    ) -> None: ...


class BillingHoldPort(Protocol):
    def hold(
        self,
        *,
        subject: BillingSubject,
        estimated_usd: float | None,
        idempotency_key: str,
    ) -> str | None: ...

    def release(self, hold_id: str | None) -> None: ...


class BillingSettlementPort(Protocol):
    def settle(
        self,
        *,
        hold_id: str | None,
        actual_usd: float | None,
        idempotency_key: str,
        items: list[BillingLineItem] | None = None,
        subject: BillingSubject | None = None,
    ) -> None: ...


class UsageAuditPort(Protocol):
    def append_usage_event(
        self,
        *,
        idempotency_key: str,
        subject: BillingSubject,
        hold_id: str | None,
        model: str,
        route: str,
        items: list[BillingLineItem],
        total_usd: float,
        status: str,
        reason: str | None = None,
    ) -> None: ...

    def list_usage_events(self, *, offset: int = 0, limit: int = 100) -> list[dict]: ...


class BillingStatusPort(Protocol):
    def status(self, identity_id: str | None = None, quotas: IdentityQuotas | None = None) -> BillingStatus: ...
