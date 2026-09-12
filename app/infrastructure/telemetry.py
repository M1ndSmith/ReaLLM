from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field


@dataclass
class StageTelemetry:
    stages_ms: dict[str, float] = field(default_factory=dict)

    def snapshot(self) -> dict[str, float]:
        return dict(self.stages_ms)

    @contextmanager
    def stage(self, name: str):
        start = time.perf_counter()
        try:
            yield
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            self.stages_ms[name] = self.stages_ms.get(name, 0.0) + elapsed_ms
