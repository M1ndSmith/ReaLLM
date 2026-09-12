from __future__ import annotations

import threading
from collections import Counter


class MetricsRuntime:
    def __init__(self, enabled: bool):
        self._enabled = enabled
        self._lock = threading.Lock()
        self._counters: Counter[str] = Counter()

    def enabled(self) -> bool:
        return self._enabled

    def incr(self, name: str, value: int = 1) -> None:
        if not self._enabled:
            return
        safe = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in name)[:200]
        if not safe:
            return
        with self._lock:
            self._counters[safe] += value

    def render_prometheus(self) -> str:
        if not self._enabled:
            return ""
        lines: list[str] = []
        with self._lock:
            items = sorted(self._counters.items())
        for key, value in items:
            lines.append(f"# TYPE {key} counter")
            lines.append(f"{key} {value}")
        return "\n".join(lines) + ("\n" if lines else "")
