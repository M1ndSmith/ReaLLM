from __future__ import annotations

from collections.abc import AsyncIterator

from app.api.errors import native_sse_payload
from app.api.sse import DONE, sse
from app.application.events import (
    StreamDelta,
    StreamEvent,
    StreamFallback,
    StreamFinished,
    StreamStarted,
    StreamUsage,
)
from app.application.models import PromptMeta


def _started_payload(event: StreamStarted) -> dict:
    payload = {
        "model": event.model,
        "provider": event.provider,
    }
    if event.memories_used is not None:
        payload["memories_used"] = event.memories_used
    if event.pii_redacted is not None:
        payload["pii_redacted"] = event.pii_redacted
        if event.pii_entities:
            payload["pii_entities"] = event.pii_entities
    if event.guard_passed is not None:
        payload["guard_passed"] = event.guard_passed
    if event.prompt_meta is not None:
        payload.update(_prompt_fields(event.prompt_meta))
    return payload


def _prompt_fields(meta: PromptMeta) -> dict:
    return {
        "prompt_name": meta.name,
        "prompt_version": meta.version,
        "prompt_source": meta.source,
    }


async def encode_native(events: AsyncIterator[StreamEvent]) -> AsyncIterator[str]:
    try:
        async for event in events:
            if isinstance(event, StreamStarted):
                yield sse(_started_payload(event))
            elif isinstance(event, StreamDelta):
                if event.content:
                    yield sse({"content": event.content})
            elif isinstance(event, StreamFallback):
                yield sse(
                    {
                        "model": event.model,
                        "provider": event.provider,
                        "cached": False,
                        "fallback_from": event.fallback_from,
                    }
                )
            elif isinstance(event, StreamUsage):
                yield sse({"usage": event.usage.model_dump(), "cost_usd": event.cost_usd})
            elif isinstance(event, StreamFinished):
                yield DONE
    except Exception as exc:
        yield sse(native_sse_payload(exc))
