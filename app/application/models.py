from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.schemas import ChatMessage, ChatResponse, UsageInfo

PromptSource = Literal["langfuse", "local", "fallback"]


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


@dataclass(frozen=True)
class RuntimeFlags:
    memory: bool
    pii: bool
    guard: bool
    guard_injection: bool
    guard_content: bool


__all__ = [
    "ChatCommand",
    "ChatResponse",
    "PromptMeta",
    "PromptSource",
    "RuntimeFlags",
    "UsageInfo",
]
