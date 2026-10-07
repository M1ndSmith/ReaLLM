from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.application.models import BillingLineItem, BillingSubject


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class UsageAuditLog:
    def __init__(self, path: Path):
        self._path = path
        self._lock = threading.Lock()

    def append_usage_event(
        self,
        *,
        idempotency_key: str,
        subject: BillingSubject,
        hold_id: str | None,
        model: str,
        route: str,
        items: list[BillingLineItem],
        total_usd: float,
        status: str,
        reason: str | None = None,
    ) -> None:
        row = {
            "timestamp": _now(),
            "idempotency_key": idempotency_key,
            "identity_id": subject.identity_id,
            "team_id": subject.team_id,
            "hold_id": hold_id,
            "model": model,
            "route": route,
            "total_usd": round(float(total_usd), 8),
            "status": status,
            "reason": reason,
            "items": [{"kind": item.kind, "usd": round(float(item.usd), 8), "units": float(item.units)} for item in items],
        }
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            with self._path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(row, separators=(",", ":")) + "\n")

    def list_usage_events(self, *, offset: int = 0, limit: int = 100) -> list[dict]:
        if not self._path.is_file():
            return []
        with self._lock:
            lines = self._path.read_text(encoding="utf-8").splitlines()
        rows: list[dict] = []
        for line in lines:
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                rows.append(payload)
        rows.reverse()
        start = max(0, offset)
        end = start + max(0, limit)
        return rows[start:end]

    def count(self) -> int:
        if not self._path.is_file():
            return 0
        with self._lock:
            return len(self._path.read_text(encoding="utf-8").splitlines())

