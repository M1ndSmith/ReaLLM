from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.schemas import ChatMessage, ChatResponse, UsageInfo

PromptSource = Literal["langfuse", "local", "fallback"]
IdentityScope = Literal["read", "chat", "config", "admin"]
BillingMode = Literal["off", "shadow", "hybrid", "wallet"]
BillingLineItemType = Literal[
    "inference_model_call",
    "security_injection_scan",
    "security_content_scan",
    "memory_retrieve_attach",
    "memory_record_extract",
    "pii_redaction",
]


@dataclass(frozen=True)
class PromptMeta:
    name: str
    version: int | None
    source: PromptSource


@dataclass(frozen=True)
class ChatCommand:
    model: str
    messages: list[ChatMessage]
    prompt: str | None = None
    prompt_label: str | None = None
    prompt_version: int | None = None
    variables: dict[str, str] | None = None
    user_id: str | None = None
    conversation_id: str | None = None
    agent_id: str | None = None
    response_format: dict | None = None
    identity_id: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    tools: list | None = None
    tool_choice: str | dict | None = None
    request_id: str | None = None


@dataclass(frozen=True)
class RuntimeFlags:
    memory: bool
    pii: bool
    guard: bool
    guard_injection: bool
    guard_content: bool


@dataclass(frozen=True)
class IdentityQuotas:
    daily_token_budget: int | None = None
    daily_usd_budget: float | None = None
    rpm_limit: int | None = None
    team_id: str | None = None
    team_daily_usd_cap: float | None = None
    prepaid_required: bool | None = None
    max_per_call_usd: float | None = None


@dataclass(frozen=True)
class BillingSubject:
    identity_id: str | None
    team_id: str | None


@dataclass(frozen=True)
class BillingLineItem:
    kind: BillingLineItemType
    usd: float
    units: float = 1.0


@dataclass(frozen=True)
class BillingStatus:
    mode: BillingMode
    prepaid_required: bool
    ledger: str
    team_id: str | None = None
    prepaid_balance_usdc: float | None = None
    team_daily_spent_usd: float | None = None
    team_daily_cap_usd: float | None = None
    line_item_totals: dict[str, float] = field(default_factory=dict)
    wallet_address: str | None = None
    chain_id: int | None = None
    faucet_url: str | None = None


@dataclass(frozen=True)
class GatewayIdentity:
    id: str
    scopes: tuple[IdentityScope, ...]
    label: str | None = None
    created_at: str | None = None
    revoked_at: str | None = None
    last_used_at: str | None = None
    quotas: IdentityQuotas = field(default_factory=IdentityQuotas)


__all__ = [
    "ChatCommand",
    "ChatResponse",
    "BillingLineItem",
    "BillingLineItemType",
    "BillingMode",
    "BillingStatus",
    "BillingSubject",
    "GatewayIdentity",
    "IdentityQuotas",
    "IdentityScope",
    "PromptMeta",
    "PromptSource",
    "RuntimeFlags",
    "UsageInfo",
]
