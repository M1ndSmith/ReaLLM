from __future__ import annotations

import asyncio

from tests.fakes import FakeChunk, FakeResponse, FakeUsage

from app.application.events import StreamDelta, StreamFallback, StreamFinished, StreamStarted, StreamUsage
from app.application.models import ChatCommand, RuntimeFlags
from app.schemas import ChatMessage, ChatResponse, UsageInfo


class Recorder:
    def __init__(self):
        self.calls: list[str] = []

    def prepare_messages(self, messages, **kwargs):
        self.calls.append("prompt")
        return list(messages), None

    async def redact_messages(self, messages):
        self.calls.append("pii_in")
        return list(messages), []

    async def redact_text(self, text):
        self.calls.append("pii_out")
        return text, []

    def unique_entity_types(self, *groups):
        return []

    async def attach(self, messages, flags, **kwargs):
        self.calls.append("memory")
        return list(messages), 0

    def schedule_record(self, *args, **kwargs):
        self.calls.append("memory_record")

    async def assert_inbound(self, messages, flags):
        self.calls.append("guard_in")

    async def assert_outbound(self, assistant, flags):
        self.calls.append("guard_out")

    def content_enabled(self, flags):
        return flags.guard and flags.guard_content

    def resolve_model(self, requested):
        self.calls.append("catalog")
        return requested

    def provider_for_model(self, model_id):
        return "groq"

    def fallback_from(self, requested, served):
        if served != requested:
            return requested
        return None

    def token_count(self, model, messages):
        self.calls.append("budget")
        return 4

    def token_count_text(self, model, text):
        return 1

    def usage_from_counts(self, model, prompt_tokens, completion_tokens, *, cost=None):
        total = (prompt_tokens or 0) + (completion_tokens or 0)
        return UsageInfo(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total,
            cost_usd=cost,
        )

    def assert_allowed(self, model, estimated):
        self.calls.append("budget_assert")

    def max_output_tokens(self):
        return 2048

    async def acompletion(self, **kwargs):
        self.calls.append("router")
        if kwargs.get("stream"):

            async def _gen():
                yield FakeChunk("hel", model="groq/openai/gpt-oss-120b")
                yield FakeChunk("lo", usage=FakeUsage())

            return _gen()
        return FakeResponse("ok")

    def chat_fallback_ids(self, requested):
        return []

    def attach_cost(self, usage, cost):
        return usage

    def completion_usd(self, response, model):
        return None

    def record_usage(self, **kwargs):
        self.calls.append("usage")

    def snapshot(self):
        return RuntimeFlags(memory=True, pii=True, guard=True, guard_injection=True, guard_content=True)


def test_complete_pipeline_stage_order():
    from app.application.chat import ChatService

    rec = Recorder()
    service = ChatService(
        flags=rec,
        catalog=rec,
        prompts=rec,
        pii=rec,
        memory=rec,
        guards=rec,
        budget=rec,
        backend=rec,
    )

    async def _run():
        result = await service.complete(
            ChatCommand(model="groq/openai/gpt-oss-20b", messages=[ChatMessage(role="user", content="hi")])
        )
        assert isinstance(result, ChatResponse)
        assert result.message.content == "ok"

    asyncio.run(_run())
    assert rec.calls == [
        "prompt",
        "pii_in",
        "memory",
        "pii_in",
        "guard_in",
        "catalog",
        "budget",
        "budget_assert",
        "router",
        "usage",
        "pii_out",
        "guard_out",
        "memory_record",
    ]


def test_stream_pipeline_event_order():
    from app.application.chat import ChatService

    rec = Recorder()
    service = ChatService(
        flags=rec,
        catalog=rec,
        prompts=rec,
        pii=rec,
        memory=rec,
        guards=rec,
        budget=rec,
        backend=rec,
    )

    async def _run():
        events = []
        async for event in service.stream(
            ChatCommand(model="groq/openai/gpt-oss-20b", messages=[ChatMessage(role="user", content="hi")])
        ):
            events.append(event)
        kinds = [type(event) for event in events]
        assert kinds[0] is StreamStarted
        assert StreamDelta in kinds
        assert kinds[-3:] == [StreamFallback, StreamUsage, StreamFinished]
        assert all(kind in {StreamStarted, StreamDelta, StreamFallback, StreamUsage, StreamFinished} for kind in kinds)
        deltas = [event for event in events if isinstance(event, StreamDelta)]
        assert "".join(event.content for event in deltas) == "hello"
        fallback = next(event for event in events if isinstance(event, StreamFallback))
        assert fallback.fallback_from == "groq/openai/gpt-oss-20b"
        assert fallback.model == "groq/openai/gpt-oss-120b"

    asyncio.run(_run())
