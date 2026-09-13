from __future__ import annotations

from dataclasses import dataclass

from app.application.models import PromptMeta
from app.schemas import UsageInfo


@dataclass(frozen=True)
class StreamStarted:
    model: str
    provider: str
    prompt_meta: PromptMeta | None
    memories_used: int | None
    pii_redacted: bool | None
    pii_entities: list[str] | None
    guard_passed: bool | None
    buffered: bool = False


@dataclass(frozen=True)
class StreamDelta:
    content: str


@dataclass(frozen=True)
class StreamFallback:
    model: str
    provider: str
    fallback_from: str | None


@dataclass(frozen=True)
class StreamUsage:
    usage: UsageInfo
    cost_usd: float | None


@dataclass(frozen=True)
class StreamFinished:
    finish_reason: str = "stop"
    model: str = ""
    served: str = ""


StreamEvent = StreamStarted | StreamDelta | StreamFallback | StreamUsage | StreamFinished
