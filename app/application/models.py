from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.schemas import ChatMessage, ChatResponse, UsageInfo

PromptSource = Literal["langfuse", "local", "fallback"]
IdentityScope = Literal["read", "chat", "config", "admin"]


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
    "GatewayIdentity",
    "IdentityQuotas",
    "IdentityScope",
    "PromptMeta",
    "PromptSource",
    "RuntimeFlags",
    "UsageInfo",
]
