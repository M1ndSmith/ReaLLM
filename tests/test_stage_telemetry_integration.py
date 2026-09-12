from __future__ import annotations

import asyncio

import pytest
from tests.test_pipeline import Recorder

from app.application.chat import ChatService
from app.application.models import ChatCommand
from app.infrastructure.telemetry import StageTelemetry
from app.schemas import ChatMessage


def test_complete_records_preflight_provider_postprocess_stages(monkeypatch):
    ticks = iter([1.0, 1.1, 2.0, 2.2, 3.0, 3.4])
    monkeypatch.setattr("app.infrastructure.telemetry.time.perf_counter", lambda: next(ticks))
    rec = Recorder()
    clocks: list[StageTelemetry] = []

    def factory() -> StageTelemetry:
        clock = StageTelemetry()
        clocks.append(clock)
        return clock

    service = ChatService(
        flags=rec,
        catalog=rec,
        prompts=rec,
        pii=rec,
        memory=rec,
        guards=rec,
        budget=rec,
        backend=rec,
        telemetry_factory=factory,
    )

    async def _run():
        return await service.complete(
            ChatCommand(model="groq/openai/gpt-oss-20b", messages=[ChatMessage(role="user", content="hi")])
        )

    result = asyncio.run(_run())
    assert result.message.content == "ok"
    assert clocks
    snapshot = clocks[0].snapshot()
    assert set(snapshot) == {"preflight", "provider", "postprocess"}
    assert snapshot["preflight"] == pytest.approx(100.0)
    assert snapshot["provider"] == pytest.approx(200.0)
    assert snapshot["postprocess"] == pytest.approx(400.0)
