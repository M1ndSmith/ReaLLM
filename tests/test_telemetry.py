from __future__ import annotations

import pytest

from app.infrastructure.telemetry import StageTelemetry


def test_stage_records_and_accumulates_elapsed_ms(monkeypatch):
    ticks = iter([1.0, 1.1, 2.0, 2.25])
    monkeypatch.setattr("app.infrastructure.telemetry.time.perf_counter", lambda: next(ticks))
    telemetry = StageTelemetry()

    with telemetry.stage("load"):
        pass
    with telemetry.stage("load"):
        pass

    assert telemetry.stages_ms["load"] == pytest.approx(350.0)


def test_stage_records_time_even_when_block_raises(monkeypatch):
    ticks = iter([10.0, 10.5])
    monkeypatch.setattr("app.infrastructure.telemetry.time.perf_counter", lambda: next(ticks))
    telemetry = StageTelemetry()

    with pytest.raises(RuntimeError, match="boom"):
        with telemetry.stage("guard"):
            raise RuntimeError("boom")

    assert telemetry.stages_ms["guard"] == pytest.approx(500.0)
